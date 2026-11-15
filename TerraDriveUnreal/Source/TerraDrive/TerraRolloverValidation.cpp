#include "TerraRolloverValidation.h"
#include "TerraRolloverBodyProbes.h"
#include "TerraVehicle.h"
#include "TerraTireProbeValidation.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Engine/StaticMesh.h"
#include "Misc/App.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonSerializer.h"

namespace TerraRolloverValidation {
namespace {
struct FCase { int Vehicle,Zone;float Roll; };
enum class EPhase { Prepare, GarageSettle, Drop, Capture, Recover, CheckRecoveryKey, RecoverySettle, ReleaseBrake, Drive };
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<ACameraActor> Camera;
  FTerraRolloverBodyProbes BodyProbes;TArray<FCase> Cases;
  EPhase Phase=EPhase::Prepare;
  int Trial=0,Samples=0,TireSize=0,ExpectedTireSize=0,MaximumCandidates=0,MaximumTraces=0;
  float Time=0,MinimumClearance=10000,MinimumTireClearance=10000,WorstTireSampleTime=0;
  bool Ready=false,Quick=false,InPlace=false,Finite=true,RequestedPoseSeen=false,OverturnedSeen=false,PoweredWhileOverturned=false;
  bool RolledAtRecovery=false;
  FVector RecoveryStart,DriveStart;
  float RecoveryHeading=0;
  double PreviousMeasuredFrame=0;TArray<float> FrameMS;
};
FState State;

bool UsesInPlaceRecovery(const FCase& C){
  return State.InPlace&&C.Zone==0&&(FMath::Abs(C.Roll)==90.f||C.Roll==180.f);
}
void RecoveryInput(ATerraVehicle* V,TerraControls::Action Action,EInputEvent Event){
  if(auto* PC=Cast<APlayerController>(V->GetController()))
    PC->InputKey(FInputKeyEventArgs::CreateSimulated(V->ControlKey(Action),Event,Event==IE_Released?0.f:1.f));
}
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
  if(!State.BodyProbes.Load(File)||!TerraTireProbeValidation::Load())return false;
  FParse::Value(FCommandLine::Get(),TEXT("TerraRolloverTireSize="),State.TireSize);
  if(State.TireSize<0||State.TireSize>TerraSim::MaxTireSizeStage)return false;
  State.Quick=FParse::Param(FCommandLine::Get(),TEXT("TerraRolloverQuick"));
  State.InPlace=FParse::Param(FCommandLine::Get(),TEXT("TerraRolloverInPlace"));
  if(State.InPlace&&!State.Quick)return false;
  int QuickVehicle=3;FParse::Value(FCommandLine::Get(),TEXT("TerraRolloverQuickVehicle="),QuickVehicle);
  if(QuickVehicle<0||QuickVehicle>=ATerraVehicle::VehicleCount)return false;
  for(int Zone:{1,0})for(int I=0;I<ATerraVehicle::VehicleCount;I++)if(!State.Quick||I==QuickVehicle)for(float Roll:{-90.f,90.f,180.f})State.Cases.Add({I,Zone,Roll});
  for(float Roll:{-55.f,55.f,-110.f,110.f})State.Cases.Add({State.Quick?QuickVehicle:3,0,Roll});
  auto Plan=MakeShared<FJsonObject>();Plan->SetNumberField(TEXT("version"),1);Plan->SetNumberField(TEXT("vehicleCount"),ATerraVehicle::VehicleCount);Plan->SetBoolField(TEXT("quick"),State.Quick);
  const bool Coachwork=FParse::Param(FCommandLine::Get(),TEXT("TerraExpectCoachworkCollision"));
  const bool Measure=FParse::Param(FCommandLine::Get(),TEXT("TerraRolloverMeasurePerformance"));
  const int ChecksPerPose=(Coachwork?9:7)+(Measure?1:0);
  Plan->SetBoolField(TEXT("performanceMeasured"),Measure);
  Plan->SetNumberField(TEXT("quickVehicle"),QuickVehicle);Plan->SetNumberField(TEXT("tireSizeStage"),State.TireSize);
  Plan->SetBoolField(TEXT("coachworkCollisionRequired"),Coachwork);Plan->SetNumberField(TEXT("checksPerPose"),ChecksPerPose);
  TArray<TSharedPtr<FJsonValue>> Cases;
  int InPlaceCases=0;
  for(const auto& C:State.Cases){
    auto Item=MakeShared<FJsonObject>();
    Item->SetNumberField(TEXT("vehicle"),C.Vehicle);Item->SetNumberField(TEXT("zone"),C.Zone);Item->SetNumberField(TEXT("roll"),C.Roll);
    if(UsesInPlaceRecovery(C))++InPlaceCases;
    Cases.Add(MakeShared<FJsonValueObject>(Item));
  }
  Plan->SetBoolField(TEXT("inPlaceRecovery"),State.InPlace);
  Plan->SetArrayField(TEXT("cases"),Cases);Plan->SetNumberField(TEXT("expectedChecks"),1+State.Cases.Num()*ChecksPerPose+InPlaceCases*3);
  return FJsonSerializer::Serialize(Plan,TJsonWriterFactory<>::Create(&Json))&&FFileHelper::SaveStringToFile(Json,*FixturePlanPath(TEXT("rollover-fixtures.json")));
}
bool Prepare(ATerraVehicle* V,const FCase& C){
  // Exercise the player's menu selection/upgrade/return path before each drop.
  // Auto-weld readiness must be established after the kinematic garage closes.
  V->SetGarage(true);V->SelectVehicle(C.Vehicle);V->ResetUpgrades(false);
  const int MaximumSize=V->UpgradeMaxStage(TerraSim::TireSize);
  if(State.Quick&&State.TireSize>MaximumSize){
    UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_TIRE_STAGE_UNSUPPORTED vehicle=%d requestedStage=%d maximumStage=%d"),
      C.Vehicle,State.TireSize,MaximumSize);
    return false;
  }
  const int Size=State.ExpectedTireSize=FMath::Min(State.TireSize,MaximumSize);
  if(Size>0){
    V->SetUpgrade(TerraSim::Suspension,V->RequiredTireSuspensionStage(Size),false);
    V->SetUpgrade(TerraSim::TireSize,Size,false);
  }
  V->SetGarage(false);V->TeleportZone(C.Zone);V->RouteIndex=-1;V->Terrain->ResetSoil();
  V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
  // Let activation/re-welding complete before applying the independent drop
  // pose. A same-frame teleport can be replaced by pending physics state.
  State.Time=0;State.Phase=EPhase::GarageSettle;
  return true;
}
void Place(ATerraVehicle* V,const FCase& C,const TArray<FVector>& BodyPoints){
  FVector Center=V->Terrain->Spawns[C.Zone]+(C.Zone==0?FVector(-1500,1200,0):FVector(3000,0,0));
  const FRotator Rotation(0,0,C.Roll);
  Center.Z=FTerraRolloverBodyProbes::DropHeight(V,BodyPoints,Center,Rotation.Quaternion())+30;
  V->SetActorLocationAndRotation(Center,Rotation,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);V->ResetContactTelemetry();
  State.Time=0;State.Samples=0;State.MinimumClearance=State.MinimumTireClearance=10000;State.WorstTireSampleTime=0;State.MaximumCandidates=State.MaximumTraces=0;State.Finite=true;State.RequestedPoseSeen=State.OverturnedSeen=State.PoweredWhileOverturned=false;State.Phase=EPhase::Drop;
  State.PreviousMeasuredFrame=0;State.FrameMS.Reset();
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(State.Vehicle.Get()!=V){State=FState();State.Vehicle=V;State.Ready=Load();Check(FString::Printf(TEXT("rollover probe data covers all %d actual body meshes"),ATerraVehicle::VehicleCount),State.Ready,State.Ready?ATerraVehicle::VehicleCount:0);if(!State.Ready)return true;}
  if(State.Trial>=State.Cases.Num())return true;
  const auto C=State.Cases[State.Trial];const FString Name=Label(C);
  if(State.Phase==EPhase::Prepare){
    if(Prepare(V,C))return false;
    Check(Name+TEXT(" supports the requested tire stage"),false,V->UpgradeMaxStage(TerraSim::TireSize));
    return true;
  }
  State.Time+=Dt;
  if(State.Phase==EPhase::GarageSettle){
    if(State.Time<=1.f)return false;
    const auto* BodyPoints=State.BodyProbes.Find(V);
    if(!BodyPoints||V->UpgradeStage(TerraSim::TireSize)!=State.ExpectedTireSize||!TerraTireProbeValidation::Matches(V)){
      Check(Name+TEXT(" requires the requested tire fit and mesh-matched body and tire probes"),false,V->UpgradeStage(TerraSim::TireSize));
      return true;
    }
    UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_BODY vehicle=%d zone=%d roll=%.0f sizeStage=%d asset=%s probes=%d"),
      C.Vehicle,C.Zone,C.Roll,State.ExpectedTireSize,*V->Body->GetStaticMesh()->GetName(),BodyPoints->Num());
    Place(V,C,*BodyPoints);
    return false;
  }
  if(State.Phase==EPhase::Drop){
    const auto* BodyPoints=State.BodyProbes.Find(V);
    if(!BodyPoints){Check(Name+TEXT(" retains its fitted body probes"),false,0);return true;}
    State.Finite&=!V->GetActorLocation().ContainsNaN()&&!V->Chassis->GetPhysicsLinearVelocity().ContainsNaN();
    if(State.Time>=.1f&&State.Time<=1.f){
      const float Up=V->GetActorUpVector().Z;
      State.RequestedPoseSeen|=FMath::Abs(C.Roll)>170?Up<-.7f:FMath::Abs(Up)<.8f;
    }
    if(State.Time>=.15f&&State.Time-Dt<.15f)UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_DROP vehicle=%d zone=%d requestedRoll=%.0f actualRoll=%.2f up=%.3f"),C.Vehicle,C.Zone,C.Roll,V->GetActorRotation().Roll,V->GetActorUpVector().Z);
    const bool SampleFromDrop=C.Zone==0&&FMath::Abs(C.Roll)==55.f&&V->TireDiameter()>=40.f;
    if(State.Time>2.5f||(SampleFromDrop&&State.Time>=.10f)){
      const float TireClearance=TerraTireProbeValidation::MinimumClearance(V);
      if(TireClearance<State.MinimumTireClearance){
        State.MinimumTireClearance=TireClearance;
        State.WorstTireSampleTime=State.Time;
      }
    }
    if(State.Time>2.5f){
      const double Now=FPlatformTime::Seconds();
      if(State.PreviousMeasuredFrame>0)State.FrameMS.Add(float((Now-State.PreviousMeasuredFrame)*1000));
      State.PreviousMeasuredFrame=Now;
      State.MinimumClearance=FMath::Min(State.MinimumClearance,FTerraRolloverBodyProbes::MinimumClearance(V,*BodyPoints));

      State.MaximumCandidates=FMath::Max(State.MaximumCandidates,V->RolledTireCandidates);State.MaximumTraces=FMath::Max(State.MaximumTraces,V->RolledTireTraces);
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
      const TCHAR* TireCheck=SampleFromDrop
        ?TEXT(" tread overlap stays below half an inch from landing through drive-away")
        :TEXT(" independent visible tire probes stay within 1.6 inches of ground with bounded contact work");
      const float ToleranceCM=SampleFromDrop?1.25f:4.f;
      Check(Name+TireCheck,
        State.Samples>=8&&TerraTireProbeValidation::Matches(V)&&State.MinimumTireClearance>=-ToleranceCM&&
        State.MaximumCandidates<=V->WheelCount()*2&&State.MaximumTraces<=V->WheelCount()*2,State.MinimumTireClearance/2.54f);
      UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_TIRES vehicle=%d zone=%d roll=%.0f sizeStage=%d psi=%.2f clearanceIn=%.3f sampleSeconds=%.3f fromDrop=%d candidates=%d traces=%d"),
        C.Vehicle,C.Zone,C.Roll,V->UpgradeStage(TerraSim::TireSize),V->WheelPressure(0),State.MinimumTireClearance/2.54f,
        State.WorstTireSampleTime,SampleFromDrop,State.MaximumCandidates,State.MaximumTraces);
      Check(Name+TEXT(" retains its fitted body probes"),BodyPoints->Num()>=64,BodyPoints->Num());
      Check(Name+TEXT(" cannot apply tire drive while overturned"),!State.PoweredWhileOverturned,State.OverturnedSeen?1:0);
      if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
      const FVector Target=V->GetActorLocation()+V->GetActorQuat().RotateVector(FVector(0,0,35));
      const FVector Eye=Target+FVector(-600,650,380);
      State.Camera->GetCameraComponent()->SetFieldOfView(54);State.Camera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
      if(auto* PC=UGameplayStatics::GetPlayerController(V,0)){PC->SetViewTarget(State.Camera.Get());if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}
      UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER vehicle=%d zone=%d roll=%.0f clearanceIn=%.3f up=%.3f samples=%d position=%s"),C.Vehicle,C.Zone,C.Roll,State.MinimumClearance/2.54f,V->GetActorUpVector().Z,State.Samples,*V->GetActorLocation().ToString());
      State.Phase=EPhase::Capture;State.Time=0;
    }
  }else if(State.Phase==EPhase::Capture&&State.Time>.35f){
    Capture(*FString::Printf(TEXT("native-rollover-v%d-z%d-%s%.0f.png"),C.Vehicle,C.Zone,C.Roll<0?TEXT("m"):TEXT("p"),FMath::Abs(C.Roll)));
    State.Phase=EPhase::Recover;State.Time=0;
  }else if(State.Phase==EPhase::Recover&&State.Time>.35f){
    V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    if(UsesInPlaceRecovery(C)){
      using A=TerraControls::Action;
      State.RolledAtRecovery=V->Overturned;
      State.RecoveryStart=V->GetActorLocation();
      State.RecoveryHeading=V->GetActorForwardVector().Rotation().Yaw;
      V->AutoTest=false;
      RecoveryInput(V,A::HoldBrake,IE_Pressed);
      RecoveryInput(V,A::Recover,IE_Pressed);
      State.Phase=EPhase::CheckRecoveryKey;
    }else{
      V->TeleportZone(C.Zone);
      State.Phase=EPhase::RecoverySettle;
    }
    State.Time=0;
  }else if(State.Phase==EPhase::CheckRecoveryKey&&State.Time>.20f){
    RecoveryInput(V,TerraControls::Action::Recover,IE_Released);
    const float Shift=FVector::Dist2D(State.RecoveryStart,V->GetActorLocation());
    const float YawError=FMath::Abs(FMath::FindDeltaAngleDegrees(State.RecoveryHeading,V->GetActorForwardVector().Rotation().Yaw));
    Check(Name+TEXT(" recovery key rights the rolled vehicle within two inches of its original position"),
      State.RolledAtRecovery&&!V->Overturned&&V->GetActorUpVector().Z>.9f&&Shift<5.f,Shift/2.54f);
    Check(Name+TEXT(" recovery key preserves the heading"),YawError<2.f,YawError);
    UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_IN_PLACE vehicle=%d zone=%d roll=%.0f wasOverturned=%d shiftIn=%.4f yawError=%.3f up=%.4f"),
      C.Vehicle,C.Zone,C.Roll,State.RolledAtRecovery,Shift/2.54f,YawError,V->GetActorUpVector().Z);
    State.Phase=EPhase::RecoverySettle;State.Time=0;
  }else if(State.Phase==EPhase::RecoverySettle&&State.Time>1.8f){
    Check(Name+TEXT(" recovery returns upright"),V->GetActorUpVector().Z>.9f,V->GetActorUpVector().Z);
    Check(Name+TEXT(" recovery regains at least three supporting tires"),V->ContactCount>=3,V->ContactCount);
    if(UsesInPlaceRecovery(C)){
      Capture(*FString::Printf(TEXT("native-rollover-v%d-pine-recovered-%s%.0f.png"),C.Vehicle,C.Roll<0?TEXT("m"):TEXT("p"),FMath::Abs(C.Roll)));
      RecoveryInput(V,TerraControls::Action::HoldBrake,IE_Released);
      State.Phase=EPhase::ReleaseBrake;
    }else{
      State.Trial++;State.Phase=EPhase::Prepare;
    }
    State.Time=0;
  }else if(State.Phase==EPhase::ReleaseBrake&&State.Time>.25f){
    State.DriveStart=V->GetActorLocation();
    RecoveryInput(V,TerraControls::Action::Forward,IE_Pressed);
    State.Phase=EPhase::Drive;State.Time=0;
  }else if(State.Phase==EPhase::Drive&&State.Time>2.f){
    RecoveryInput(V,TerraControls::Action::Forward,IE_Released);
    const float Motion=FVector::Dist2D(State.DriveStart,V->GetActorLocation());
    Check(Name+TEXT(" drives away using the forward control"),!V->Overturned&&Motion>150.f&&V->Speed>1.f,Motion/2.54f);
    UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLOVER_DRIVE_AWAY vehicle=%d roll=%.0f motionIn=%.2f mph=%.2f"),C.Vehicle,C.Roll,Motion/2.54f,V->Speed*2.236936f);
    V->AutoTest=true;State.Trial++;State.Phase=EPhase::Prepare;State.Time=0;
  }
  return State.Trial>=State.Cases.Num();
}
}
