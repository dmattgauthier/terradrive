#include "TerraRolloverValidation.h"
#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Misc/App.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace TerraRolloverValidation {
namespace {
struct FCase { int Vehicle,Zone;float Roll; };
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<ACameraActor> Camera;
  TArray<FVector> Probes[ATerraVehicle::VehicleCount];TArray<FCase> Cases;
  int Trial=0,Phase=0,Samples=0;float Time=0,MinimumClearance=10000;
  bool Ready=false,Finite=true,RequestedPoseSeen=false,OverturnedSeen=false,PoweredWhileOverturned=false;
  double PreviousMeasuredFrame=0;TArray<float> FrameMS;
};
FState State;
FString Label(const FCase& C){return FString::Printf(TEXT("rollover vehicle %d %s %.0f degrees"),C.Vehicle,C.Zone==0?TEXT("Pine Ridge"):TEXT("tarmac"),C.Roll);}
FString FixturePlanPath(const TCHAR* Name){
  FString Report;
  if(FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report)&&!Report.IsEmpty())return FPaths::GetPath(Report)/Name;
  return FPaths::ProjectSavedDir()/TEXT("Validation")/Name;
}
bool Load(){
  FString File=FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-collision.json"),Json;
  // A loose fixture lets the unchanged cooked meshes demonstrate the old
  // physics failure before accepting a new collision implementation.
  FParse::Value(FCommandLine::Get(),TEXT("TerraCoachworkData="),File);
  TSharedPtr<FJsonObject> Root;const TArray<TSharedPtr<FJsonValue>>* Vehicles=nullptr;
  if(!FFileHelper::LoadFileToString(Json,*File)||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||
      !Root->TryGetArrayField(TEXT("vehicles"),Vehicles)||Vehicles->Num()!=ATerraVehicle::VehicleCount)return false;
  for(int I=0;I<ATerraVehicle::VehicleCount;I++){
    const auto Item=(*Vehicles)[I]->AsObject();const TArray<TSharedPtr<FJsonValue>>* Probes=nullptr;
    if(!Item.IsValid()||!Item->TryGetArrayField(TEXT("rolloverProbes"),Probes)||Probes->Num()<64||Probes->Num()>384)return false;
    for(const auto& Value:*Probes){const auto& A=Value->AsArray();if(A.Num()!=3)return false;const FVector P(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber());if(P.ContainsNaN())return false;State.Probes[I].Add(P);}
  }
  const bool Quick=FParse::Param(FCommandLine::Get(),TEXT("TerraRolloverQuick"));
  int QuickVehicle=3;FParse::Value(FCommandLine::Get(),TEXT("TerraRolloverQuickVehicle="),QuickVehicle);
  if(QuickVehicle<0||QuickVehicle>=ATerraVehicle::VehicleCount)return false;
  for(int Zone:{1,0})for(int I=0;I<ATerraVehicle::VehicleCount;I++)if(!Quick||I==QuickVehicle)for(float Roll:{-90.f,90.f,180.f})State.Cases.Add({I,Zone,Roll});
  for(float Roll:{-55.f,55.f,-110.f,110.f})State.Cases.Add({Quick?QuickVehicle:3,0,Roll});
  auto Plan=MakeShared<FJsonObject>();Plan->SetNumberField(TEXT("version"),1);Plan->SetNumberField(TEXT("vehicleCount"),ATerraVehicle::VehicleCount);Plan->SetBoolField(TEXT("quick"),Quick);
  const bool Coachwork=FParse::Param(FCommandLine::Get(),TEXT("TerraExpectCoachworkCollision"));
  const bool Measure=FParse::Param(FCommandLine::Get(),TEXT("TerraRolloverMeasurePerformance"));
  const int ChecksPerPose=(Coachwork?8:6)+(Measure?1:0);
  Plan->SetBoolField(TEXT("performanceMeasured"),Measure);
  Plan->SetNumberField(TEXT("quickVehicle"),QuickVehicle);
  Plan->SetBoolField(TEXT("coachworkCollisionRequired"),Coachwork);Plan->SetNumberField(TEXT("checksPerPose"),ChecksPerPose);
  TArray<TSharedPtr<FJsonValue>> Cases;
  for(const auto& C:State.Cases){auto Item=MakeShared<FJsonObject>();Item->SetNumberField(TEXT("vehicle"),C.Vehicle);Item->SetNumberField(TEXT("zone"),C.Zone);Item->SetNumberField(TEXT("roll"),C.Roll);Cases.Add(MakeShared<FJsonValueObject>(Item));}
  Plan->SetArrayField(TEXT("cases"),Cases);Plan->SetNumberField(TEXT("expectedChecks"),1+State.Cases.Num()*ChecksPerPose);
  return FJsonSerializer::Serialize(Plan,TJsonWriterFactory<>::Create(&Json))&&FFileHelper::SaveStringToFile(Json,*FixturePlanPath(TEXT("rollover-fixtures.json")));
}
void Prepare(ATerraVehicle* V,const FCase& C){
  // Exercise the player's menu selection/upgrade/return path before each drop.
  // Auto-weld readiness must be established after the kinematic garage closes.
  V->SetGarage(true);V->SelectVehicle(C.Vehicle);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(C.Zone);V->RouteIndex=-1;V->Terrain->ResetSoil();
  V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
  // Let activation/re-welding complete before applying the independent drop
  // pose. A same-frame teleport can be replaced by pending physics state.
  State.Time=0;State.Phase=5;
}
void Place(ATerraVehicle* V,const FCase& C){
  FVector Center=V->Terrain->Spawns[C.Zone]+(C.Zone==0?FVector(-1500,1200,0):FVector(3000,0,0));
  const FRotator Rotation(0,0,C.Roll);const FQuat Q=Rotation.Quaternion();
  float Height=-100000;for(const FVector& P:State.Probes[C.Vehicle]){const FVector Offset=Q.RotateVector(P);Height=FMath::Max(Height,V->Terrain->Height(Center.X+Offset.X,Center.Y+Offset.Y)-float(Offset.Z));}
  Center.Z=Height+30;
  V->SetActorLocationAndRotation(Center,Rotation,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);V->ResetContactTelemetry();
  State.Time=0;State.Samples=0;State.MinimumClearance=10000;State.Finite=true;State.RequestedPoseSeen=State.OverturnedSeen=State.PoweredWhileOverturned=false;State.Phase=1;
  State.PreviousMeasuredFrame=0;State.FrameMS.Reset();
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(State.Vehicle.Get()!=V){State=FState();State.Vehicle=V;State.Ready=Load();Check(FString::Printf(TEXT("rollover probe data covers all %d actual body meshes"),ATerraVehicle::VehicleCount),State.Ready,State.Ready?ATerraVehicle::VehicleCount:0);if(!State.Ready)return true;}
  if(State.Trial>=State.Cases.Num())return true;
  const auto C=State.Cases[State.Trial];const FString Name=Label(C);
  if(State.Phase==0){Prepare(V,C);return false;}
  State.Time+=Dt;
  if(State.Phase==5){if(State.Time>1.f)Place(V,C);return false;}
  if(State.Phase==1){
    State.Finite&=!V->GetActorLocation().ContainsNaN()&&!V->Chassis->GetPhysicsLinearVelocity().ContainsNaN();
    if(State.Time>=.1f&&State.Time<=1.f){
      const float Up=V->GetActorUpVector().Z;
      State.RequestedPoseSeen|=FMath::Abs(C.Roll)>170?Up<-.7f:FMath::Abs(Up)<.8f;
    }
    if(State.Time>=.15f&&State.Time-Dt<.15f)UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_DROP vehicle=%d zone=%d requestedRoll=%.0f actualRoll=%.2f up=%.3f"),C.Vehicle,C.Zone,C.Roll,V->GetActorRotation().Roll,V->GetActorUpVector().Z);
    if(State.Time>2.5f){
      const double Now=FPlatformTime::Seconds();
      if(State.PreviousMeasuredFrame>0)State.FrameMS.Add(float((Now-State.PreviousMeasuredFrame)*1000));
      State.PreviousMeasuredFrame=Now;
      for(const FVector& Local:State.Probes[C.Vehicle]){const FVector P=V->Body->GetComponentTransform().TransformPosition(Local);State.MinimumClearance=FMath::Min(State.MinimumClearance,float(P.Z-V->Terrain->Height(P.X,P.Y)));}
      State.Samples++;
    }
    if(State.Time>3.2f){V->TestThrottle=1;V->TestSteer=1;V->TestBrake=0;}
    if(State.Time>3.35f&&V->Overturned){State.OverturnedSeen=true;State.PoweredWhileOverturned|=V->Throttle>.001f||V->LastTireForceN>100;}
    if(State.Time>3.8f){
      if(FParse::Param(FCommandLine::Get(),TEXT("TerraRolloverMeasurePerformance"))){
        float Mean=0;for(float MS:State.FrameMS)Mean+=MS;Mean/=FMath::Max(1,State.FrameMS.Num());
        auto Sorted=State.FrameMS;Sorted.Sort();const float P95=Sorted.IsEmpty()?0:Sorted[FMath::Min(Sorted.Num()-1,FMath::FloorToInt(Sorted.Num()*.95f))];
        Check(Name+TEXT(" real-time rollover stays above sustained single-digit FPS"),!FApp::UseFixedTimeStep()&&GEngine&&!GEngine->bUseFixedFrameRate&&State.FrameMS.Num()>=8&&Mean>0&&Mean<100,Mean);
        UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_FRAME_BUDGET vehicle=%d zone=%d roll=%.0f frames=%d meanMS=%.3f p95MS=%.3f fps=%.3f"),C.Vehicle,C.Zone,C.Roll,State.FrameMS.Num(),Mean,P95,Mean>0?1000/Mean:0);
      }
      if(FParse::Param(FCommandLine::Get(),TEXT("TerraExpectCoachworkCollision"))){
        Check(Name+TEXT(" uses twelve mesh-matched physical body sections"),V->CoachworkCollisionReady&&V->CoachworkCollision->BodyInstance.WeldParent!=nullptr&&V->CoachworkHullCount==12&&V->CoachworkCollisionSource.Len()==64,V->CoachworkHullCount);
        const float ActualMass=V->Chassis->GetMass();
        const float COMOffset=V->Chassis->GetComponentTransform().InverseTransformPosition(V->Chassis->GetCenterOfMass()).Size();
        Check(Name+TEXT(" keeps the configured chassis mass and centre of mass"),FMath::Abs(ActualMass-V->Mass)<FMath::Max(1.f,V->Mass*.001f)&&COMOffset<2.f,COMOffset/2.54f);
        UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_MASS vehicle=%d actualKG=%.3f expectedKG=%.3f comOffsetIn=%.4f"),C.Vehicle,ActualMass,V->Mass,COMOffset/2.54f);
      }
      Check(Name+TEXT(" remains finite and enters its requested drop pose under real Chaos gravity"),State.Finite&&State.RequestedPoseSeen,State.RequestedPoseSeen?1:0);
      Check(Name+TEXT(" sampled visible body stays within 1.6 inches of ground"),State.Samples>=8&&State.MinimumClearance>=-4.f,State.MinimumClearance/2.54f);
      Check(Name+TEXT(" retains its source surface probes"),State.Probes[C.Vehicle].Num()>=64,State.Probes[C.Vehicle].Num());
      Check(Name+TEXT(" cannot apply tire drive while overturned"),!State.PoweredWhileOverturned,State.OverturnedSeen?1:0);
      if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
      const FVector Target=V->GetActorLocation()+V->GetActorQuat().RotateVector(FVector(0,0,35));
      const FVector Eye=Target+FVector(-600,650,380);
      State.Camera->GetCameraComponent()->SetFieldOfView(54);State.Camera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
      if(auto* PC=UGameplayStatics::GetPlayerController(V,0)){PC->SetViewTarget(State.Camera.Get());if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}
      UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER vehicle=%d zone=%d roll=%.0f clearanceIn=%.3f up=%.3f samples=%d position=%s"),C.Vehicle,C.Zone,C.Roll,State.MinimumClearance/2.54f,V->GetActorUpVector().Z,State.Samples,*V->GetActorLocation().ToString());
      State.Phase=2;State.Time=0;
    }
  }else if(State.Phase==2&&State.Time>.35f){
    Capture(*FString::Printf(TEXT("native-rollover-v%d-z%d-%s%.0f.png"),C.Vehicle,C.Zone,C.Roll<0?TEXT("m"):TEXT("p"),FMath::Abs(C.Roll)));
    State.Phase=3;State.Time=0;
  }else if(State.Phase==3&&State.Time>.35f){
    // This is the same placement function as the player's R recovery control.
    V->TestThrottle=V->TestSteer=0;V->TestBrake=1;V->TeleportZone(C.Zone);State.Phase=4;State.Time=0;
  }else if(State.Phase==4&&State.Time>1.8f){
    Check(Name+TEXT(" recovery returns upright"),V->GetActorUpVector().Z>.9f,V->GetActorUpVector().Z);
    Check(Name+TEXT(" recovery regains at least three supporting tires"),V->ContactCount>=3,V->ContactCount);
    State.Trial++;State.Phase=0;State.Time=0;
  }
  return State.Trial>=State.Cases.Num();
}
}
