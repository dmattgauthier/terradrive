#include "TerraRecoveryValidation.h"
#include "TerraVehicle.h"
#include "TerraGameMode.h"
#include "TerraTireProbeValidation.h"
#include "Camera/PlayerCameraManager.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "Engine/OverlapResult.h"
#include "InputKeyEventArgs.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Actor.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace TerraRecoveryValidation {
namespace {
constexpr int Model=3,CaseCount=4;
const TCHAR* Names[]={TEXT("settled side"),TEXT("settled roof"),TEXT("narrow shoulder post"),TEXT("trapped shoulder post")};
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<AActor> PostActor;
  TWeakObjectPtr<UBoxComponent> Post;
  TArray<FVector> Probes,PostCandidates;
  FVector Center=FVector::ZeroVector,Sentinel=FVector::ZeroVector,Base=FVector::ZeroVector,PostLocal=FVector::ZeroVector;
  FQuat Upright=FQuat::Identity;
  int Trial=0,Phase=0,Candidate=0,BlockedHeights=0;float Time=0,TotalTime=0;
  bool Finite=true,SawRolled=false,FixtureValid=false,Recovered=false;
  void Next(int P){Phase=P;Time=0;}
} S;
void RemovePost(){if(S.PostActor.IsValid())S.PostActor->Destroy();S.PostActor.Reset();S.Post.Reset();}
void StopInput(ATerraVehicle* V){V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;}
bool LoadProbes(){
  FString Json;TSharedPtr<FJsonObject> Root;const TArray<TSharedPtr<FJsonValue>>* Vehicles=nullptr;
  if(!FFileHelper::LoadFileToString(Json,*(FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-collision.json")))||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||
      !Root->TryGetArrayField(TEXT("vehicles"),Vehicles)||!Vehicles->IsValidIndex(Model))return false;
  const auto Vehicle=(*Vehicles)[Model]->AsObject();const TArray<TSharedPtr<FJsonValue>>* Probes=nullptr;
  if(!Vehicle.IsValid()||!Vehicle->TryGetArrayField(TEXT("rolloverProbes"),Probes)||Probes->Num()<64)return false;
  for(const auto& P:*Probes){const auto& A=P->AsArray();if(A.Num()!=3)return false;
    const FVector Point(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber());if(Point.ContainsNaN())return false;S.Probes.Add(Point);}
  return true;
}
bool MakeSentinel(ATerraVehicle* V){
  // A remote, pre-existing soil deformation must survive every recovery. It
  // is never reset, including when preparing the next independent drop.
  const FVector Origin=V->Terrain->Spawns[3];bool Found=false;
  for(int X=-5;X<=5&&!Found;++X)for(int Y=-5;Y<=5&&!Found;++Y){
    const FVector P=Origin+FVector(X*130,Y*130,0);const auto G=V->Terrain->Sample(P);
    if(G.Surface==2&&G.Softness>.4f){S.Sentinel=P;Found=true;}
  }
  if(!Found)return false;
  V->Terrain->ActivateSoil(S.Sentinel,200);
  for(int I=0;I<24;++I)V->Terrain->Deform(S.Sentinel,FVector::ForwardVector,12000,18,.38f,.42f,.6f,2,.025f);
  const auto G=V->Terrain->Sample(S.Sentinel);return G.Packing>.001f||G.RutDepth>.001f||G.Churn>.001f;
}
bool CameraClearsTerrainAndFramesVehicle(ATerraVehicle* V,float& CameraClearanceIn){
  auto* PC=Cast<APlayerController>(V->GetController());auto* HUD=PC?Cast<ATerraHUD>(PC->GetHUD()):nullptr;
  if(!PC||!PC->PlayerCameraManager||!HUD||PC->GetViewTarget()!=V)return false;
  const FVector Eye=PC->PlayerCameraManager->GetCameraLocation(),Origin=V->CameraArm->GetComponentLocation();
  const float CameraGap=Eye.Z-V->Terrain->Height(Eye.X,Eye.Y),OriginGap=Origin.Z-V->Terrain->Height(Origin.X,Origin.Y);
  CameraClearanceIn=CameraGap/2.54f;
  int Width=0,Height=0;PC->GetViewportSize(Width,Height);
  bool Visible=!Eye.ContainsNaN()&&!Origin.ContainsNaN()&&CameraGap>=V->CameraArm->ProbeSize&&
    OriginGap>=V->CameraArm->ProbeSize+7.5f&&Width>0&&Height>0;
  float Bottom=0;
  auto Project=[&](const FVector& P){FVector2D Screen;
    if(!P.ContainsNaN()&&PC->ProjectWorldLocationToScreen(P,Screen)){
      Bottom=FMath::Max(Bottom,float(Screen.Y));Visible&=Screen.X>=8&&Screen.X<Width-8&&Screen.Y>=8&&Screen.Y<Height-8;
    }else Visible=false;
  };
  for(const FVector& Local:S.Probes)Project(V->Body->GetComponentTransform().TransformPosition(Local));
  const bool Tires=TerraTireProbeValidation::Load()&&TerraTireProbeValidation::Matches(V);Visible&=Tires;
  if(Tires)for(const FVector& Local:TerraTireProbeValidation::ActorLocalPoints(V))Project(V->GetActorTransform().TransformPosition(Local));
  Visible&=Bottom<HUD->VehicleSafeBottom-8;
  UE_LOG(LogTemp,Display,TEXT("TERRA_RECOVERY_CAMERA trial=%d phase=%d cameraGapIn=%.3f originGapIn=%.3f hudGapPX=%.2f visible=%d eye=%s origin=%s"),
    S.Trial,S.Phase,CameraClearanceIn,OriginGap/2.54f,HUD->VehicleSafeBottom-Bottom,Visible,*Eye.ToString(),*Origin.ToString());
  return Visible;
}
bool SameSoil(const FTerraSample& A,const FTerraSample& B){
  return A.Height==B.Height&&A.Packing==B.Packing&&A.RutDepth==B.RutDepth&&A.Displacement==B.Displacement&&A.Churn==B.Churn;
}
bool ActualBlocked(ATerraVehicle* V,const FVector& P,const FQuat& Q,bool PostOnly=false){
  FComponentQueryParams Query(SCENE_QUERY_STAT(TerraRecoveryFixtureHull),V);
  // UE filters welded overlap shapes by their original owning BodyInstance.
  // Query each active sub-body; querying only the root omits coachwork.
  UPrimitiveComponent* Components[]={V->Chassis.Get(),V->FrontCollision.Get(),V->RearCollision.Get(),V->RoofCollision.Get(),V->CoachworkCollision.Get()};
  for(UPrimitiveComponent* C:Components){
    if(!C->IsQueryCollisionEnabled())continue;
    const FTransform Relative=C==V->Chassis?FTransform::Identity:C->GetRelativeTransform();
    TArray<FOverlapResult> Hits;C->ComponentOverlapMulti(Hits,V->GetWorld(),P+Q.RotateVector(Relative.GetLocation()),Q*Relative.GetRotation(),ECC_Visibility,Query);
    for(const auto& Hit:Hits)if(Hit.bBlockingHit&&(!PostOnly||Hit.Component.Get()==S.Post.Get()))return true;
  }
  return false;
}
bool FormerBoxesBlocked(ATerraVehicle* V,const FVector& P,const FQuat& Q){
  FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraRecoveryFixtureOldBoxes),true,V);
  for(UBoxComponent* C:{V->Chassis.Get(),V->FrontCollision.Get(),V->RearCollision.Get(),V->RoofCollision.Get()}){
    const FVector Offset=C==V->Chassis?FVector::ZeroVector:C->GetRelativeLocation();TArray<FOverlapResult> Hits;
    V->GetWorld()->OverlapMultiByChannel(Hits,P+Q.RotateVector(Offset),Q, ECC_Visibility,FCollisionShape::MakeBox(C->GetScaledBoxExtent()*.98f),Query);
    for(const auto& Hit:Hits)if(Hit.bBlockingHit&&Hit.Component.Get()==S.Post.Get())return true;
  }
  return false;
}
bool MissesSupportColumns(ATerraVehicle* V,float X,float Y){
  const float Length=V->SpecValue(TEXT("length"),5.9f)*50;
  const float Width=FMath::Max(V->SpecValue(TEXT("track"))+V->SpecValue(TEXT("tireWidth")),V->SpecValue(TEXT("width")))*50;
  for(int A=-5;A<=5;++A)for(int B=-2;B<=2;++B)if(FMath::Abs(X-Length*A/5)<6&&FMath::Abs(Y-Width*B/2)<6)return false;
  for(int I=0;I<V->WheelCount();++I)if(FMath::Abs(X-V->AxleOffsetM(I/2)*100)<6&&FMath::Abs(Y-(I%2?1:-1)*V->SpecValue(TEXT("track"))*50)<6)return false;
  return true;
}
bool PositionNextPost(){
  if(!S.Post.IsValid()||!S.PostCandidates.IsValidIndex(S.Candidate))return false;
  S.PostLocal=S.PostCandidates[S.Candidate++];
  // Query-only while searching: a rejected candidate must not kick the
  // settled van. Actual queries run in a later tick after the scene updates.
  S.Post->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
  S.Post->SetBoxExtent(FVector(3,3,45));
  S.Post->SetWorldLocationAndRotation(S.Base+S.Upright.RotateVector(S.PostLocal),S.Upright,false,nullptr,ETeleportType::TeleportPhysics);
  S.Next(7);return true;
}
bool BeginPostSearch(ATerraVehicle* V){
  S.PostCandidates.Reset();S.Candidate=0;S.BlockedHeights=0;
  const float HalfLength=V->SpecValue(TEXT("length"),5.9f)*50;
  const float MinY=FMath::Max(V->Chassis->GetScaledBoxExtent().Y,V->RoofCollision->GetScaledBoxExtent().Y)+6;
  // Cell midpoints avoid the complete recovery floor lattice. Search both
  // shoulders and the rear body, not only a tiny front/right range. Keep the
  // independent wheel-column and former-box checks; location alone is no proof.
  for(float Side:{1.f,-1.f})for(int A:{0,1,-1,2,-2,3,-3,-4})
    for(float Y=MinY;Y<V->SpecValue(TEXT("width"))*50+5;Y+=4)
      for(float Z:{35.f,65.f,95.f}){
        const float X=(A+.5f)*HalfLength/5;
        if(MissesSupportColumns(V,X,Side*Y))S.PostCandidates.Add(FVector(X,Side*Y,Z));
      }
  if(S.PostCandidates.IsEmpty())return false;
  S.PostActor=V->GetWorld()->SpawnActor<AActor>();if(!S.PostActor.IsValid())return false;
  auto* Box=NewObject<UBoxComponent>(S.PostActor.Get());S.PostActor->SetRootComponent(Box);S.Post=Box;
  Box->SetMobility(EComponentMobility::Movable);Box->SetCollisionObjectType(ECC_WorldStatic);
  Box->SetCollisionEnabled(ECollisionEnabled::QueryOnly);Box->SetCollisionResponseToAllChannels(ECR_Block);
  Box->SetGenerateOverlapEvents(false);Box->SetBoxExtent(FVector(3,3,45));
  Box->SetWorldLocationAndRotation(S.Base+S.Upright.RotateVector(S.PostCandidates[0]),S.Upright);
  Box->RegisterComponent();return PositionNextPost();
}
bool PostProvesObstruction(ATerraVehicle* V,bool Tall){
  if(!S.Post.IsValid()||!MissesSupportColumns(V,S.PostLocal.X,S.PostLocal.Y)||
      FormerBoxesBlocked(V,S.Base,S.Upright)||ActualBlocked(V,V->GetActorLocation(),V->GetActorQuat(),true))return false;
  S.BlockedHeights=0;
  for(int I=0;I<(Tall?13:1);++I)if(ActualBlocked(V,S.Base+FVector(0,0,I*20),S.Upright,true))++S.BlockedHeights;
  return S.BlockedHeights==(Tall?13:1);
}
void MakePostPhysical(){
  S.Post->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
  auto* Visual=NewObject<UStaticMeshComponent>(S.PostActor.Get());Visual->SetupAttachment(S.Post.Get());
  Visual->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,TEXT("/Engine/BasicShapes/Cube.Cube")));Visual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
  Visual->SetRelativeScale3D(S.Post->GetUnscaledBoxExtent()/50);Visual->RegisterComponent();
  // Enabling physics/creating a visible post is a separate stage. Re-prove
  // the complete obstruction after that change before requesting recovery.
  S.Next(9);
}
void Prepare(ATerraVehicle* V){
  RemovePost();V->SetGarage(true);V->SelectVehicle(Model);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);StopInput(V);
  S.Center=V->Terrain->Spawns[1]+FVector(3000,0,0);V->RouteIndex=-1;S.Next(1);
}
void Drop(ATerraVehicle* V){
  const FRotator R(0,0,S.Trial==1?180:90);float Z=-100000;
  for(const auto& Probe:S.Probes){const FVector Offset=R.RotateVector(Probe);Z=FMath::Max(Z,V->Terrain->Height(S.Center.X+Offset.X,S.Center.Y+Offset.Y)-float(Offset.Z));}
  S.Center.Z=Z+30;V->SetActorLocationAndRotation(S.Center,R,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);V->ResetContactTelemetry();
  S.Finite=true;S.SawRolled=false;S.Next(2);
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(S.Vehicle.Get()!=V){S=FState();S.Vehicle=V;
    const bool Loaded=LoadProbes();Check(TEXT("local recovery fixture loads actual Sprinter rollover probes"),Loaded,S.Probes.Num());
    const bool Sentinel=MakeSentinel(V);Check(TEXT("local recovery fixture preserves an existing nonzero mud deformation"),Sentinel,V->Terrain->Sample(S.Sentinel).RutDepth);
    if(!Loaded||!Sentinel)return true;
  }
  S.TotalTime+=Dt;S.Time+=Dt;
  if(S.TotalTime>90){Check(TEXT("local recovery completes four scenarios within ninety seconds"),false,S.TotalTime);RemovePost();return true;}
  const FString Prefix=FString(TEXT("local recovery "))+Names[S.Trial]+TEXT(" ");
  auto Test=[&](const TCHAR* Name,bool Pass,float Value=0){Check(Prefix+Name,Pass,Value);};
  if(S.Phase==0){Prepare(V);}
  else if(S.Phase==1&&S.Time>1){Drop(V);}
  else if(S.Phase==2){
    S.Finite&=!V->GetActorLocation().ContainsNaN()&&!V->Chassis->GetPhysicsLinearVelocity().ContainsNaN();
    S.SawRolled|=S.Trial==1?V->GetActorUpVector().Z<-.7f:FMath::Abs(V->GetActorUpVector().Z)<.3f;
    const bool Rest=V->Chassis->GetPhysicsLinearVelocity().Size()<12&&V->Chassis->GetPhysicsAngularVelocityInRadians().Size()<.15f;
    if(S.Time>4&&(Rest||S.Time>9)){
      Test(TEXT("rests rolled under Chaos before requesting recovery"),S.Finite&&S.SawRolled&&V->Overturned&&Rest,V->Chassis->GetPhysicsLinearVelocity().Size());
      float CameraGap=0;const bool CameraClear=CameraClearsTerrainAndFramesVehicle(V,CameraGap);
      Test(TEXT("before recovery camera stays above terrain and frames the vehicle clear of the HUD"),CameraClear,CameraGap);
      Capture(*FString::Printf(TEXT("native-recovery-%d-before.png"),S.Trial));S.Next(3);
    }
  }else if(S.Phase==3&&S.Time>.3f){
    const FVector Before=V->GetActorLocation();
    S.Upright=FRotator(0,V->GetActorForwardVector().Rotation().Yaw,0).Quaternion();
    S.Base=FVector(Before.X,Before.Y,V->Terrain->Height(Before.X,Before.Y)+V->ExpectedRideHeight()*100+15);
    S.FixtureValid=false;
    if(S.Trial<2){S.FixtureValid=!ActualBlocked(V,S.Base,S.Upright);S.Next(10);}
    else if(!BeginPostSearch(V)){RemovePost();S.Next(10);}
  }else if(S.Phase==7&&S.Time>.04f){
    if(PostProvesObstruction(V,false)){
      if(S.Trial==3){
        const FVector XY=S.Base+S.Upright.RotateVector(FVector(S.PostLocal.X,S.PostLocal.Y,0));
        S.Post->SetBoxExtent(FVector(3,3,2200));
        S.Post->SetWorldLocation(FVector(XY.X,XY.Y,V->Terrain->Height(XY.X,XY.Y)+2200));S.Next(8);
      }else MakePostPhysical();
    }else if(!PositionNextPost()){
      UE_LOG(LogTemp,Error,TEXT("TERRA_RECOVERY_POST_NO_CANDIDATE trial=%d tested=%d"),S.Trial,S.Candidate);
      RemovePost();S.Next(10);
    }
  }else if(S.Phase==8&&S.Time>.04f){
    // The tall post must independently overlap every upward retry and avoid
    // the current rolled pose. Do not accept the old narrow-post result.
    if(PostProvesObstruction(V,true))MakePostPhysical();
    else if(!PositionNextPost()){RemovePost();S.Next(10);}
  }else if(S.Phase==9&&S.Time>.04f){
    S.FixtureValid=PostProvesObstruction(V,S.Trial==3);
    UE_LOG(LogTemp,Display,TEXT("TERRA_RECOVERY_POST_PROOF trial=%d candidate=%d local=%s heights=%d valid=%d physical=%d"),
      S.Trial,S.Candidate,*S.PostLocal.ToCompactString(),S.BlockedHeights,S.FixtureValid,
      S.Post.IsValid()&&S.Post->GetCollisionEnabled()==ECollisionEnabled::QueryAndPhysics);
    S.Next(10);
  }else if(S.Phase==10&&S.Time>.04f){
    const FVector Before=V->GetActorLocation();const FQuat BeforeQ=V->GetActorQuat();
    Test(TEXT("collision setup independently proves the intended obstruction"),S.FixtureValid,S.Trial);
    // A non-default state makes accidental spawn/repair/refill/reset detectable.
    V->RouteIndex=0;V->GateIndex=1;V->RouteTime=38.25f;V->FuelFraction=.43f;V->BatterySOC=.37f;
    V->StructuralDamage.Zones[1]=.2f;V->StructuralDamage.Events=7;V->Damage=TerraSim::DamageAmount(V->StructuralDamage);V->DamageEventCount=7;
    const auto Damage=V->StructuralDamage;const float DamageAmount=V->Damage;
    const auto Soil=V->Terrain->Sample(S.Sentinel);const int Marks=V->Terrain->BodyMarkCount();
    S.Recovered=V->RecoverInPlace();const FVector After=V->GetActorLocation();
    Test(TEXT("recovers even with the physical post present"),S.FixtureValid&&S.Recovered,S.Recovered?1:0);
    const double YawError=FMath::Abs(FMath::FindDeltaAngleDegrees(BeforeQ.GetForwardVector().Rotation().Yaw,V->GetActorRotation().Yaw));
    const float Shift=FVector::Dist2D(Before,After);
    Test(TEXT("keeps exact XY when clear or moves nearby around the post, with the same heading"),
      S.Recovered&&(S.Trial<2?Shift<.1f:Shift>=99.f&&Shift<=1201.f)&&V->GetActorUpVector().Z>.999f&&YawError<.1,Shift);
    Test(TEXT("retains route gate and elapsed challenge time"),V->RouteIndex==0&&V->GateIndex==1&&V->RouteTime==38.25f,V->RouteTime);
    Test(TEXT("retains visible damage and both energy reserves"),V->Damage==DamageAmount&&V->StructuralDamage.Zones==Damage.Zones&&V->StructuralDamage.Events==Damage.Events&&V->DamageEventCount==7&&V->FuelFraction==.43f&&V->BatterySOC==.37f,V->Damage);
    Test(TEXT("does not reset soil deformation or existing body marks"),SameSoil(Soil,V->Terrain->Sample(S.Sentinel))&&V->Terrain->BodyMarkCount()==Marks,Marks);
    Test(TEXT("clears every active hull with the obstruction present"),S.Recovered&&!ActualBlocked(V,After,V->GetActorQuat()),After.Z-Before.Z);
    S.Next(4);
  }else if(S.Phase==4&&S.Time>1.f){
    // Let the ordinary camera lag settle after a successful upward retry.
    // The actual obstruction remains present during the camera check/capture.
    float CameraGap=0;const bool CameraClear=CameraClearsTerrainAndFramesVehicle(V,CameraGap);
    Test(TEXT("after recovery camera stays above terrain and frames the vehicle clear of the HUD"),CameraClear,CameraGap);
    Capture(*FString::Printf(TEXT("native-recovery-%d-after.png"),S.Trial));S.Next(5);
  }else if(S.Phase==5&&S.Time>3){
    Test(TEXT("finishes supported upright without removing the obstruction"),
      S.Recovered&&!V->Overturned&&V->GetActorUpVector().Z>.9f&&V->ContactCount>=3,V->ContactCount);
    RemovePost();
    if(++S.Trial>=CaseCount){
      Check(TEXT("local recovery removes all runtime obstruction fixtures"),!S.PostActor.IsValid()&&!S.Post.IsValid(),0);
      // Request recovery before physics changes this steep, inverted pose.
      // The nose has a heading even though the right-vector fallback is reversed.
      constexpr double Heading=37;
      const FVector Before=V->GetActorLocation()+FVector(0,0,400);
      V->SetActorLocationAndRotation(Before,FRotator(85,Heading,180),false,nullptr,ETeleportType::TeleportPhysics);
      const bool Recovered=V->RecoverInPlace();
      const double YawError=FMath::Abs(FMath::FindDeltaAngleDegrees(Heading,V->GetActorRotation().Yaw));
      Check(TEXT("local recovery preserves the projected heading of a steep inverted vehicle"),
        Recovered&&YawError<.1&&FVector::Dist2D(Before,V->GetActorLocation())<.1&&V->GetActorUpVector().Z>.999,YawError);
      return true;
    }
    S.Next(0);
  }
  return false;
}

namespace {
constexpr int GraveModel=10;
constexpr float QuarryX=15000,PadY=-26900,ShoulderY=-27565;
constexpr float TestFuel=.43f,TestBattery=.37f,TestRouteTime=38.25f;
constexpr int TestRoute=4,TestGate=3;
struct FGraveRecovery {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  FVector Before=FVector::ZeroVector,DriveStart=FVector::ZeroVector;
  FRotator DropRotation;
  float PadZ=0,Time=0,Total=0,Damage=0;
  int Trial=0,Phase=0;
  bool PrimedReleaseGate=false;
  void Next(int P){Phase=P;Time=0;}
} Grave;

bool GraniteFloor(ATerraVehicle* V,const FVector& XY,FHitResult& Hit){
  FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraGraveRecoveryFixture),true,V);
  if(!V->GetWorld()->LineTraceSingleByChannel(Hit,XY+FVector(0,0,6000),XY-FVector(0,0,6000),ECC_Visibility,Query))return false;
  auto* Mesh=Cast<UStaticMeshComponent>(Hit.GetComponent());
  return Mesh&&Mesh->GetStaticMesh()&&Mesh->GetStaticMesh()->GetName()==TEXT("granite_trials");
}

void TestKey(APlayerController* PC,const FKey& Key,EInputEvent Event){
  PC->InputKey(FInputKeyEventArgs::CreateSimulated(Key,Event,Event==IE_Released?0.f:1.f));
}

void PlaceGrave(ATerraVehicle* V,const FVector& Position,const FRotator& Rotation){
  V->SetActorLocationAndRotation(Position,Rotation,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  V->ResetContactTelemetry();
}

float GraniteTireGap(ATerraVehicle* V){
  float Gap=UE_BIG_NUMBER;
  for(const FVector& Local:TerraTireProbeValidation::ActorLocalPoints(V)){
    const FVector P=V->GetActorTransform().TransformPosition(Local);
    FHitResult Hit;
    if(GraniteFloor(V,P,Hit))Gap=FMath::Min(Gap,float(P.Z-Hit.ImpactPoint.Z));
  }
  return Gap;
}
}

bool TickGrave(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(Grave.Vehicle.Get()!=V){Grave=FGraveRecovery();Grave.Vehicle=V;}
  Grave.Time+=Dt;Grave.Total+=Dt;
  using A=TerraControls::Action;
  const bool Shoulder=Grave.Trial==1,HoldDrive=Grave.Trial==2;
  const FString Name=Shoulder?TEXT("Granite shoulder"):HoldDrive?TEXT("held-control retry"):TEXT("buried quarry tires");
  auto Test=[&](const TCHAR* Detail,bool Pass,float Value=0){Check(TEXT("Grave Digger ")+Name+TEXT(" ")+Detail,Pass,Value);};
  auto* PC=Cast<APlayerController>(V->GetController());
  if(!PC||Grave.Total>65){Test(TEXT("fixture completes with a native controller"),false,Grave.Total);return true;}
  if(Grave.Phase==0){
    V->AutoTest=true;V->SetGarage(true);V->SelectVehicle(GraveModel);V->ResetUpgrades(false);V->SetGarage(false);
    V->TeleportZone(8);StopInput(V);
    V->SetEnergyUsageEnabled(false,false);
    FHitResult Flat,Slope;
    const bool Pad=GraniteFloor(V,FVector(QuarryX,PadY,0),Flat)&&Flat.ImpactNormal.Z>.95f;
    const bool Wall=GraniteFloor(V,FVector(QuarryX,-27750,0),Slope)&&Slope.ImpactPoint.Z>Flat.ImpactPoint.Z+170;
    Test(TEXT("uses the cooked Granite Trials pad and real rock shoulder"),Pad&&Wall,Slope.ImpactPoint.Z-Flat.ImpactPoint.Z);
    if(!Pad||!Wall)return true;
    Grave.PadZ=Flat.ImpactPoint.Z;
    const FVector FlatPose(QuarryX,PadY,Grave.PadZ+V->ExpectedRideHeight()*100+15);
    PlaceGrave(V,FlatPose,FRotator::ZeroRotator);
    if(HoldDrive)Grave.PrimedReleaseGate=V->RecoverInPlace();
    Grave.Next(1);
  }else if(Grave.Phase==1&&Grave.Time>.8f){
    Grave.DropRotation=FRotator(0,0,90);
    if(Grave.DropRotation.Quaternion().GetUpVector().Y<0)Grave.DropRotation.Roll=-90;
    const FVector Start(QuarryX,Shoulder?ShoulderY:PadY,Grave.PadZ+(Shoulder?290:160));
    PlaceGrave(V,Start,Grave.DropRotation);
    Grave.Next(2);
  }else if(Grave.Phase==2&&Grave.Time>.08f){
    FVector P=V->GetActorLocation();
    if(!Shoulder&&!HoldDrive){
      float LowestHub=UE_BIG_NUMBER;
      for(int I=0;I<V->WheelCount();++I)LowestHub=FMath::Min(LowestHub,float(V->WheelState[I].Center.Z));
      const float Drop=Grave.PadZ-12-LowestHub;
      const bool TireData=TerraTireProbeValidation::Load()&&TerraTireProbeValidation::Matches(V);
      const float InitialGap=TireData?GraniteTireGap(V)+Drop:UE_BIG_NUMBER;
      Test(TEXT("starts with a lower wheel hub below the actual deck"),TireData&&InitialGap<-45,InitialGap);
      P.Z+=Drop;
      PlaceGrave(V,P,Grave.DropRotation);
    }
    Grave.Next(3);
  }else if(Grave.Phase==3&&Grave.Time>(Shoulder?.01f:2.6f)){
    const bool TireData=TerraTireProbeValidation::Load()&&TerraTireProbeValidation::Matches(V);
    const float Up=V->GetActorUpVector().Z;
    Test(TEXT("starts tipped with the actual truck and tire geometry"),
      TireData&&V->VehicleIndex==GraveModel&&(Shoulder?FMath::Abs(Up)<.5f:V->Overturned),Up);
    if(!Shoulder){
      const float Clearance=TireData?GraniteTireGap(V):-999.f;
      Test(TEXT("rolled tires stay at the visible rock surface"),Clearance>=-5.f&&Clearance<UE_BIG_NUMBER*.5f,Clearance);
    }
    if(Shoulder){
      const FVector P=V->GetActorLocation();
      FHitResult Left,Right;
      const bool Both=GraniteFloor(V,P+FVector(0,-136,0),Left)&&GraniteFloor(V,P+FVector(0,136,0),Right);
      Test(TEXT("the original upright footprint straddles the cliff shoulder"),Both&&FMath::Abs(Left.ImpactPoint.Z-Right.ImpactPoint.Z)>95,
        FMath::Abs(Left.ImpactPoint.Z-Right.ImpactPoint.Z));
    }
    Capture(*FString::Printf(TEXT("grave-recovery-%d-before.png"),Grave.Trial));
    V->RouteIndex=TestRoute;V->GateIndex=TestGate;V->RouteTime=TestRouteTime;
    V->FuelFraction=TestFuel;V->BatterySOC=TestBattery;
    V->StructuralDamage.Zones[1]=.2f;V->StructuralDamage.Events=7;V->Damage=TerraSim::DamageAmount(V->StructuralDamage);V->DamageEventCount=7;
    Grave.Damage=V->Damage;
    if(HoldDrive)TestKey(PC,V->ControlKey(A::Forward),IE_Pressed);
    Grave.Next(4);
  }else if(Grave.Phase==4&&Grave.Time>(HoldDrive?.20f:.01f)){
    if(HoldDrive)Test(TEXT("forward is already held after an earlier recovery"),Grave.PrimedReleaseGate&&V->ControlDown(A::Forward));
    Grave.Before=V->GetActorLocation();
    V->AutoTest=false;
    TestKey(PC,V->ControlKey(A::Recover),IE_Pressed);
    Grave.Next(5);
  }else if(Grave.Phase==5&&Grave.Time>.24f){
    TestKey(PC,V->ControlKey(A::Recover),IE_Released);
    if(HoldDrive)TestKey(PC,V->ControlKey(A::Forward),IE_Released);
    const FVector P=V->GetActorLocation();
    const float Shift=FVector::Dist2D(Grave.Before,P);
    UE_LOG(LogTemp,Display,TEXT("TERRA_GRAVE_RECOVERY trial=%d before=%s after=%s up=%.4f shiftCM=%.2f notice=%s"),
      Grave.Trial,*Grave.Before.ToString(),*P.ToString(),V->GetActorUpVector().Z,Shift,*V->Notice);
    Test(TEXT("bound recovery key places the truck upright"),!V->Overturned&&V->GetActorUpVector().Z>.9f,V->GetActorUpVector().Z);
    Test(TEXT("uses the current pad or a nearby position on the same level"),P.Z<Grave.PadZ+V->ExpectedRideHeight()*100+110&&
      (Shoulder?Shift>20&&Shift<1225:Shift<20),Shift);
    Test(TEXT("preserves the challenge gate, elapsed time, damage and energy"),
      V->RouteIndex==TestRoute&&V->GateIndex==TestGate&&V->RouteTime>=TestRouteTime&&V->RouteTime<TestRouteTime+1&&
      V->Damage==Grave.Damage&&V->DamageEventCount==7&&V->FuelFraction==TestFuel&&V->BatterySOC==TestBattery,V->RouteTime);
    Grave.Next(6);
  }else if(Grave.Phase==6&&Grave.Time>2.5f){
    const bool Upright=V->GetActorUpVector().Z>.9f&&!V->Overturned;
    Test(TEXT("settles on at least three tires with the cliff still present"),Upright&&V->ContactCount>=3,V->ContactCount);
    Capture(*FString::Printf(TEXT("grave-recovery-%d-after.png"),Grave.Trial));
    Grave.DriveStart=V->GetActorLocation();
    TestKey(PC,V->ControlKey(A::Forward),IE_Pressed);Grave.Next(7);
  }else if(Grave.Phase==7&&Grave.Time>2.f){
    TestKey(PC,V->ControlKey(A::Forward),IE_Released);
    const float Motion=FVector::Dist2D(V->GetActorLocation(),Grave.DriveStart);
    Test(TEXT("drives away on the normal forward control"),!V->Overturned&&Motion>150&&FMath::Abs(V->Speed)>1,Motion);
    V->AutoTest=true;StopInput(V);
    if(++Grave.Trial==3)return true;
    Grave.Next(0);
  }
  return false;
}
}
