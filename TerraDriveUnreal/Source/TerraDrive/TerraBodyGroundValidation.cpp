#include "TerraBodyGroundValidation.h"
#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInterface.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace TerraBodyGroundValidation {
namespace {
struct FCase {int Vehicle,Surface;float Roll;bool Coast;};
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;TWeakObjectPtr<ACameraActor> Camera;
  TArray<FVector> Probes[ATerraVehicle::VehicleCount];TArray<FCase> Cases;
  int Trial=0,Phase=0,Frames=0;float Time=0,MaximumTravel=0,MinimumClearance=10000,EarlySpeed=0,MaxGrip=0;
  FVector Center=FVector::ZeroVector,Start=FVector::ZeroVector,Scar=FVector::ZeroVector;
  bool Loaded=false,Patch=false,Finite=true,PoseSeen=false,Powered=false,WheelsRecovered=false,Legacy=false;
};
FState State;
FString Name(const FCase& C){return FString::Printf(TEXT("body ground vehicle %d surface %d roll %.0f"),C.Vehicle,C.Surface,C.Roll);}
bool Load(){
  FString Json;TSharedPtr<FJsonObject> Root;
  if(!FFileHelper::LoadFileToString(Json,*(FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-collision.json")))||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid())return false;
  const auto& Vehicles=Root->GetArrayField(TEXT("vehicles"));if(Vehicles.Num()!=ATerraVehicle::VehicleCount)return false;
  for(int I=0;I<Vehicles.Num();++I)for(const auto& P:Vehicles[I]->AsObject()->GetArrayField(TEXT("rolloverProbes"))){
    const auto& A=P->AsArray();if(A.Num()!=3)return false;const FVector Point(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber());if(Point.ContainsNaN())return false;State.Probes[I].Add(Point);
  }
  for(const auto& Probes:State.Probes)if(Probes.Num()<64||Probes.Num()>384)return false;
  const bool Quick=FParse::Param(FCommandLine::Get(),TEXT("TerraBodyGroundQuick"));
  State.Legacy=FParse::Param(FCommandLine::Get(),TEXT("TerraLegacyBodyGrip"));
  for(int V=0;V<ATerraVehicle::VehicleCount;++V)if(!Quick||V==0||V==3||V==7)
    for(float Roll:{-90.f,90.f,180.f})if(!Quick||Roll>=0)State.Cases.Add({V,1,Roll,true});
  if(!Quick)for(int Surface:{0,2,3,4,5,6})for(float Roll:{90.f,180.f})State.Cases.Add({0,Surface,Roll,false});
  auto Plan=MakeShared<FJsonObject>();Plan->SetNumberField(TEXT("version"),1);Plan->SetBoolField(TEXT("legacyControl"),State.Legacy);
  Plan->SetBoolField(TEXT("quick"),Quick);Plan->SetNumberField(TEXT("vehicles"),ATerraVehicle::VehicleCount);
  Plan->SetNumberField(TEXT("checksPerTrial"),12);Plan->SetNumberField(TEXT("expectedChecks"),1+State.Cases.Num()*12);
  TArray<TSharedPtr<FJsonValue>> Cases;for(const auto& C:State.Cases){auto O=MakeShared<FJsonObject>();
    O->SetNumberField(TEXT("vehicle"),C.Vehicle);O->SetNumberField(TEXT("surface"),C.Surface);O->SetNumberField(TEXT("roll"),C.Roll);O->SetBoolField(TEXT("movingCoast"),C.Coast);Cases.Add(MakeShared<FJsonValueObject>(O));}
  Plan->SetArrayField(TEXT("cases"),Cases);FString Report;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);
  return FJsonSerializer::Serialize(Plan,TJsonWriterFactory<>::Create(&Json))&&FFileHelper::SaveStringToFile(Json,*(FPaths::GetPath(Report)/TEXT("body-ground-fixtures.json")));
}
bool Match(ATerraVehicle* V,FVector P,int Surface){
  auto* T=V->Terrain.Get();const auto S=T->Sample(P);const auto Blend=T->SurfaceBlend(P.X,P.Y);
  if(S.Surface!=Surface||Blend.Weight[Surface]<.96f||S.Normal.Z<.97f)return false;
  FHitResult Hit;FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraBodyGroundFixture),true,V);
  if(!V->GetWorld()->LineTraceSingleByChannel(Hit,FVector(P.X,P.Y,S.Height+350),FVector(P.X,P.Y,S.Height-100),ECC_Visibility,Query))return false;
  return Hit.GetComponent()&&Hit.GetComponent()->ComponentHasTag(TEXT("TerraGround"));
}
bool FindPatch(ATerraVehicle* V,const FCase& C){
  if(C.Surface==1){State.Center=V->Terrain->Spawns[1]+FVector(3000,0,0);return Match(V,State.Center,1)&&Match(V,State.Center+FVector(2000,0,0),1);}
  static const int Zone[]={0,1,3,4,2,5,7};
  const FVector Origin=V->Terrain->Spawns[Zone[C.Surface]]-FVector(600,600,0);
  float Best=FLT_MAX;bool Found=false;
  for(int X=-22;X<=22;++X)for(int Y=-22;Y<=22;++Y){const float Cost=X*X+Y*Y;if(Cost>=Best)continue;
    const FVector P=Origin+FVector(X*150,Y*150,0);bool Valid=true;
    for(float Along:{-260.f,0.f,260.f})for(float Across:{-150.f,0.f,150.f})if(Valid)Valid=Match(V,P+FVector(Along,Across,0),C.Surface);
    if(Valid){Best=Cost;State.Center=P;Found=true;}
  }
  return Found;
}
void Frame(ATerraVehicle* V,bool GroundView){
  if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
  FVector Target=GroundView?State.Scar:V->GetActorLocation()+FVector(0,0,40);if(GroundView)Target.Z=V->Terrain->Height(Target.X,Target.Y);
  const FVector Eye=Target+(GroundView?FVector(-190,-230,150):FVector(-650,650,390));
  State.Camera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());State.Camera->GetCameraComponent()->SetFieldOfView(GroundView?57:55);
  if(auto* PC=UGameplayStatics::GetPlayerController(V,0)){PC->SetViewTarget(State.Camera.Get());if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}
}
void Place(ATerraVehicle* V,const FCase& C){
  const FQuat Q=FRotator(0,0,C.Roll).Quaternion();float Z=-100000;
  for(const FVector& P:State.Probes[C.Vehicle]){const FVector D=Q.RotateVector(P);Z=FMath::Max(Z,V->Terrain->Height(State.Center.X+D.X,State.Center.Y+D.Y)-float(D.Z));}
  State.Center.Z=Z+18;V->SetActorLocationAndRotation(State.Center,Q,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);V->ResetContactTelemetry();
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(State.Vehicle.Get()!=V){State=FState();State.Vehicle=V;State.Loaded=Load();Check(TEXT("body ground fixtures load all nine actual body probe sets"),State.Loaded,State.Cases.Num());if(!State.Loaded)return true;}
  if(State.Trial>=State.Cases.Num())return true;
  const auto C=State.Cases[State.Trial];const FString Label=Name(C);
  State.Time+=FMath::Min(Dt,.1f);
  // Observe the settling drop as well as the later coast. Some broad/tall
  // bodies naturally tip back onto their tires before the one-second coast
  // seed; that must not erase the actual side pose and panel-grip response.
  if(State.Phase==2){
    const float Alignment=FVector::DotProduct(V->GetActorUpVector(),V->Terrain->Sample(V->GetActorLocation()).Normal);
    State.PoseSeen|=Alignment<.6f;
    State.MaxGrip=FMath::Max(State.MaxGrip,V->BodyGroundSlidingFriction);
  }
  if(State.Phase==0){
    V->SetGarage(true);V->SelectVehicle(C.Vehicle);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);V->SetDamageEnabled(false,false);
    V->TestDriverInput=false;V->TestThrottle=V->TestSteer=V->TestBrake=0;V->RouteIndex=-1;V->Terrain->ResetSoil();
    State.Patch=FindPatch(V,C);State.Phase=1;State.Time=0;State.PoseSeen=false;State.MaxGrip=0;
  }else if(State.Phase==1&&State.Time>1.f){
    Place(V,C);State.Time=0;State.Phase=2;
  }else if(State.Phase==2&&State.Time>1.f){
    State.Start=V->GetActorLocation();State.MaximumTravel=0;State.MinimumClearance=10000;State.Frames=0;State.EarlySpeed=0;
    State.Finite=true;State.Powered=State.WheelsRecovered=false;
    if(C.Coast){V->Chassis->WakeAllRigidBodies();V->Chassis->SetPhysicsLinearVelocity(FVector(800,0,0));}
    State.Phase=3;State.Time=0;
  }else if(State.Phase==3){
    ++State.Frames;const FVector Position=V->GetActorLocation(),Velocity=V->Chassis->GetPhysicsLinearVelocity();
    State.Finite&=!Position.ContainsNaN()&&!Velocity.ContainsNaN();State.MaximumTravel=FMath::Max(State.MaximumTravel,float(FVector::Dist2D(Position,State.Start)*.01));
    const float Alignment=FVector::DotProduct(V->GetActorUpVector(),V->Terrain->Sample(Position).Normal);
    State.PoseSeen|=Alignment<.6f;State.WheelsRecovered|=Alignment>.75f&&V->ContactCount>=3;
    if(V->Overturned)State.Powered|=V->Throttle>.001f||V->LastTireForceN>100;
    State.MaxGrip=FMath::Max(State.MaxGrip,V->BodyGroundSlidingFriction);
    if(State.Time<=2.1f)State.EarlySpeed=Velocity.Size()*.01f;
    if(State.Frames%3==0){const FTransform T=V->GetActorTransform();for(const FVector& P:State.Probes[C.Vehicle]){const FVector W=T.TransformPosition(P);State.MinimumClearance=FMath::Min(State.MinimumClearance,float(W.Z-V->Terrain->Height(W.X,W.Y)));}}
    if(State.Time>(C.Coast?5.5f:3.f)){
      const float FinalSpeed=Velocity.Size()*.01f;const bool Rest=FinalSpeed<.45f||State.WheelsRecovered;
      Check(Label+TEXT(" uses a clear pure matching gentle natural surface"),State.Patch,State.Patch?1:0);
      Check(Label+TEXT(" actually enters side or roof contact"),State.PoseSeen,Alignment);
      Check(Label+TEXT(" uses the actual twelve-section coachwork collision"),V->CoachworkCollisionReady&&V->CoachworkHullCount==12,V->CoachworkHullCount);
      Check(Label+TEXT(" produces actual terrain-body collision notifications"),V->TerrainBodyHits>0&&V->BodyGroundContactCount>0,V->BodyGroundContactCount);
      Check(Label+TEXT(" remains finite with no body burial beyond 1.6 inches"),State.Finite&&State.Frames>=10&&State.MinimumClearance>=-4.f,State.MinimumClearance/2.54f);
      Check(Label+TEXT(" cannot apply tire drive while overturned"),!State.Powered,V->LastTireForceN);
      Check(Label+(State.Legacy?TEXT(" legacy control retains its slippery panel coefficient"):TEXT(" panel grip rises while overturned")),State.Legacy?State.MaxGrip<.101f:State.MaxGrip>.25f,State.MaxGrip);
      Check(Label+(State.Legacy?TEXT(" legacy control retains substantial sliding at two seconds"):TEXT(" stops sliding or legitimately regains supporting tires")),State.Legacy&&C.Coast?State.EarlySpeed>3.f:Rest,State.Legacy?State.EarlySpeed:FinalSpeed);
      Check(Label+(State.Legacy?TEXT(" legacy control demonstrates a long glide"):TEXT(" retains bounded rollover travel")),State.Legacy&&C.Coast?State.MaximumTravel>10.f:((!C.Coast||State.MaximumTravel>1.5f)&&(State.MaximumTravel<18.f||State.WheelsRecovered)),State.MaximumTravel);
      Check(Label+TEXT(" leaves body marks independently of disabled vehicle damage"),!V->DamageEnabled&&V->Terrain->BodyMarkCount()>0,V->Terrain->BodyMarkCount());
      auto* Mesh=V->Terrain->BodyMarkMesh.Get();int Vertices=0;bool Geometry=Mesh&&Mesh->GetNumSections()>0;float Depth=0;
      if(Mesh)for(int Section=0;Section<Mesh->GetNumSections();++Section){const auto* M=Mesh->GetProcMeshSection(Section);Geometry&=M&&Mesh->GetMaterial(Section);if(M)for(const auto& P:M->ProcVertexBuffer){++Vertices;Geometry&=!P.Position.ContainsNaN();if(C.Surface==1||C.Surface==4)Geometry&=P.Color.R>60&&P.Color.G>60;}}
      for(const auto& M:V->Terrain->BodyGroundMarks())for(float Along:{-.3f,0.f,.3f})for(float Across:{-.3f,0.f,.3f}){
        const FVector Side(-M.Forward.Y,M.Forward.X,0),P=M.Point+M.Forward*(M.Length*Along)+Side*(M.Width*Across);
        Depth=FMath::Max(Depth,-V->Terrain->Sample(P).Displacement);
      }
      const bool Rigid=C.Surface==1||C.Surface==4;
      bool PhysicalMesh=false;
      if(!Rigid)for(const auto& M:V->Terrain->BodyGroundMarks())PhysicalMesh|=V->Terrain->HasRenderedBodyImpression(M.Point);
      Check(Label+(Rigid?TEXT(" renders finite bounded non-rubber scrape geometry"):TEXT(" renders physically depressed packed soil without painted track lines")),
        Rigid?(Geometry&&Vertices>0&&Vertices<=36864&&Mesh->GetMaterial(0)->GetName()==TEXT("BodyGroundScuff")):(PhysicalMesh&&Vertices==0),Rigid?Vertices:(PhysicalMesh?1:0));
      Check(Label+(Rigid?TEXT(" scrapes hard ground without excavating it"):TEXT(" compacts a physical soft-ground impression")),Rigid?Depth<.00001f:Depth>.0008f,Depth*39.3701f);
      const auto& Marks=V->Terrain->BodyGroundMarks();State.Scar=Marks.IsEmpty()?State.Center:Marks.Last().Point;
      UE_LOG(LogTemp,Display,TEXT("TERRA_BODY_GROUND trial=%d vehicle=%d surface=%d roll=%.0f coast=%d legacy=%d frames=%d finalMPS=%.4f speedAt2MPS=%.4f travelM=%.4f minClearanceCM=%.4f grip=%.4f marks=%d depthM=%.5f recoveredWheels=%d"),
        State.Trial,C.Vehicle,C.Surface,C.Roll,C.Coast,State.Legacy,State.Frames,FinalSpeed,State.EarlySpeed,State.MaximumTravel,State.MinimumClearance,State.MaxGrip,V->Terrain->BodyMarkCount(),Depth,State.WheelsRecovered);
      Frame(V,false);State.Phase=4;State.Time=0;
    }
  }else if(State.Phase==4&&State.Time>.3f){Capture(*FString::Printf(TEXT("native-body-ground-%02d-vehicle.png"),State.Trial));State.Phase=5;State.Time=0;
  }else if(State.Phase==5&&State.Time>.3f){V->TeleportZone(1);Frame(V,true);State.Phase=6;State.Time=0;
  }else if(State.Phase==6&&State.Time>.4f){Capture(*FString::Printf(TEXT("native-body-ground-%02d-ground.png"),State.Trial));State.Phase=7;State.Time=0;
  }else if(State.Phase==7&&State.Time>.3f){++State.Trial;State.Phase=0;State.Time=0;}
  return false;
}
}
