#include "TerraMomentumValidation.h"
#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "Materials/MaterialInterface.h"
#include "Math/RotationMatrix.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UnrealClient.h"

namespace TerraMomentumValidation {
namespace {
constexpr int BoundaryTrialCount=7,ChecksPerBoundary=4,ChecksPerRiseVehicle=9,BarrierChecks=2;
struct FTrial {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<UProceduralMeshComponent> Bump;
  TWeakObjectPtr<UBoxComponent> Wall;
  int Trial=0,Phase=0,Frames=0;
  float Time=0,Span=0,Travel=0,LastSpeed=0,PeakLoss=0,MinimumSpeed=1000,
      PeakCompression=0,MinimumClearance=10000,PeakPitch=0,BrakeEntrySpeed=0,
      MinimumVisibleClearance=10000,RiseVisibleClearance=10000,PeakDeceleration=0;
  float LoadedDistance[4]={};
  int PairMask=0,EncounteredMask=0;
  FVector Start=FVector::ZeroVector,Direction=FVector::ForwardVector,BumpCenter=FVector::ZeroVector,LastPosition=FVector::ZeroVector;
  TArray<FVector> BodyProbes[ATerraVehicle::VehicleCount];
  FString ProbeAssets[ATerraVehicle::VehicleCount];
  bool ProbesReady[ATerraVehicle::VehicleCount]={};
  FString Name;
  void NextPhase(int P){Phase=P;Time=0;Frames=0;}
};
FTrial State;
FString FixturePlanPath(const TCHAR* Name){
  FString Report;
  if(FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report)&&!Report.IsEmpty())return FPaths::GetPath(Report)/Name;
  return FPaths::ProjectSavedDir()/TEXT("Validation")/Name;
}
void LoadBodyProbes(){
  FString Json;TSharedPtr<FJsonObject> Root;
  if(!FFileHelper::LoadFileToString(Json,*(FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-ground-probes.json")))||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid())return;
  const TArray<TSharedPtr<FJsonValue>> *Vehicles=nullptr;
  if(!Root->TryGetArrayField(TEXT("vehicles"),Vehicles)||Vehicles->Num()!=ATerraVehicle::VehicleCount)return;
  for(int I=0;I<ATerraVehicle::VehicleCount;++I){
    const auto Vehicle=(*Vehicles)[I]->AsObject();if(!Vehicle.IsValid())continue;
    const TArray<TSharedPtr<FJsonValue>> *Probes=nullptr;FString Hash,Asset;
    if(!Vehicle->TryGetArrayField(TEXT("probes"),Probes)||Probes->Num()<32||Probes->Num()>60||
        !Vehicle->TryGetStringField(TEXT("objSha256"),Hash)||Hash.Len()!=64||
        !Vehicle->TryGetStringField(TEXT("asset"),Asset))continue;
    bool Valid=true;TSet<FString> Regions;
    for(const auto &Value:*Probes){
      const auto Probe=Value->AsObject();const TArray<TSharedPtr<FJsonValue>> *Point=nullptr;FString Region;
      if(!Probe.IsValid()||!Probe->TryGetArrayField(TEXT("point"),Point)||Point->Num()!=3||
          !Probe->TryGetStringField(TEXT("region"),Region)){Valid=false;break;}
      const FVector P((*Point)[0]->AsNumber(),(*Point)[1]->AsNumber(),(*Point)[2]->AsNumber());
      if(P.ContainsNaN()){Valid=false;break;}
      State.BodyProbes[I].Add(P);Regions.Add(Region);
    }
    for(const TCHAR *Region:{TEXT("front"),TEXT("rear"),TEXT("left-skirt"),TEXT("right-skirt"),TEXT("underbody")})
      Valid&=Regions.Contains(Region);
    State.ProbeAssets[I]=Asset;State.ProbesReady[I]=Valid&&State.BodyProbes[I].Num()==Probes->Num();
  }
}
void WriteFixturePlan(ATerraVehicle* V){
  auto Plan=MakeShared<FJsonObject>();Plan->SetNumberField(TEXT("version"),1);Plan->SetNumberField(TEXT("vehicleCount"),ATerraVehicle::VehicleCount);
  Plan->SetNumberField(TEXT("boundaryTrialCount"),BoundaryTrialCount);Plan->SetNumberField(TEXT("checksPerBoundary"),ChecksPerBoundary);
  Plan->SetNumberField(TEXT("checksPerRiseVehicle"),ChecksPerRiseVehicle);Plan->SetNumberField(TEXT("barrierChecks"),BarrierChecks);
  Plan->SetNumberField(TEXT("expectedChecks"),BoundaryTrialCount*ChecksPerBoundary+ATerraVehicle::VehicleCount*ChecksPerRiseVehicle+BarrierChecks);
  TArray<TSharedPtr<FJsonValue>> Rises;for(int I=0;I<ATerraVehicle::VehicleCount;++I)Rises.Add(MakeShared<FJsonValueNumber>(I));Plan->SetArrayField(TEXT("riseVehicles"),Rises);
  TArray<TSharedPtr<FJsonValue>> Boundaries;
  if(V->Terrain->TransitionData.IsValid())for(const auto& F:V->Terrain->TransitionData->GetArrayField(TEXT("fixtures")))Boundaries.Add(MakeShared<FJsonValueString>(F->AsObject()->GetStringField(TEXT("name"))));
  Plan->SetArrayField(TEXT("boundaries"),Boundaries);
  FString Json;if(FJsonSerializer::Serialize(Plan,TJsonWriterFactory<>::Create(&Json)))FFileHelper::SaveStringToFile(Json,*FixturePlanPath(TEXT("momentum-fixtures.json")));
}
void Capture(const FString &Name){
  if(FParse::Param(FCommandLine::Get(),TEXT("TerraCapture")))
    FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir()/TEXT("Screenshots")/Name,true,false);
}
void Park(ATerraVehicle *V,int VehicleIndex,FVector Ground,FVector Direction){
  V->SelectVehicle(VehicleIndex);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);
  V->Terrain->ResetSoil();V->RouteIndex=-1;V->TestDriverInput=false;
  V->TestThrottle=V->TestSteer=0;V->TestBrake=1;V->LowRange=V->DescentAssist=false;
  Ground.Z=V->Terrain->Height(Ground.X,Ground.Y);
  const FVector Normal=V->Terrain->Sample(Ground).Normal;
  const FVector Forward=(Direction-Normal*FVector::DotProduct(Direction,Normal)).GetSafeNormal();
  const FRotator Rotation=FRotationMatrix::MakeFromXZ(Forward,Normal).Rotator();
  V->SetActorLocationAndRotation(Ground+FVector(0,0,V->ExpectedRideHeight()*100+14),Rotation,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  State.NextPhase(1);
}
void Launch(ATerraVehicle *V,float Speed){
  State.Start=V->GetActorLocation();State.LastSpeed=Speed;State.MinimumSpeed=Speed;
  State.PeakLoss=State.PeakCompression=State.PeakPitch=State.PeakDeceleration=0;State.MinimumClearance=10000;
  State.MinimumVisibleClearance=State.RiseVisibleClearance=10000;State.LastPosition=State.Start;State.EncounteredMask=0;
  V->ResetContactTelemetry();V->TestBrake=0;
  const FVector Forward=V->GetActorForwardVector();
  V->Chassis->SetPhysicsLinearVelocity(Forward*Speed*100);
  const float Radius=V->TireDiameter()*2.54f/200;
  for(auto &Wheel:V->WheelState)Wheel.Omega=Speed/Radius;
  State.NextPhase(2);
}
float BumpHeight(float X,float Y){
  if(!State.Bump.IsValid()||State.Bump->GetCollisionEnabled()==ECollisionEnabled::NoCollision)return 0;
  const float Along=(X-State.BumpCenter.X)/120;
  return FMath::Abs(Along)<1&&FMath::Abs(Y-State.BumpCenter.Y)<400?
      7.f*(1+FMath::Cos(PI*Along)):0;
}
void MakeBump(ATerraVehicle *V){
  auto *Mesh=NewObject<UProceduralMeshComponent>(V->Terrain);
  V->Terrain->AddInstanceComponent(Mesh);Mesh->RegisterComponent();
  Mesh->SetCollisionProfileName(TEXT("BlockAll"));Mesh->bUseComplexAsSimpleCollision=true;
  Mesh->SetCastShadow(false);Mesh->ComponentTags.Add(TEXT("TerraMomentumBump"));
  Mesh->SetMaterial(0,LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Materials/Terrain_asphalt")));
  State.BumpCenter=V->Terrain->Spawns[1]+FVector(700,0,0);
  TArray<FVector> Points,Normals;TArray<FVector2D> UV;TArray<FLinearColor> Colors;
  TArray<int32> Indices;TArray<FProcMeshTangent> Tangents;
  for(int I=0;I<=32;++I){
    const float A=float(I)/16-1,X=State.BumpCenter.X+A*120;
    const float H=7*(1+FMath::Cos(PI*A)),Derivative=-7*PI/120*FMath::Sin(PI*A);
    for(float Side:{-1.f,1.f}){
      const float Y=State.BumpCenter.Y+Side*400;
      Points.Add(FVector(X,Y,V->Terrain->Height(X,Y)+H));Normals.Add(FVector(-Derivative,0,1).GetSafeNormal());
      UV.Add(FVector2D(float(I)/8,(Side+1)*2));Colors.Add(FLinearColor::White);
      Tangents.Add(FProcMeshTangent(1,0,Derivative));
    }
    if(I<32){const int A0=I*2;Indices.Append({A0,A0+2,A0+1,A0+1,A0+2,A0+3});}
  }
  Mesh->CreateMeshSection_LinearColor(0,Points,Indices,Normals,UV,Colors,Tangents,true);
  State.Bump=Mesh;
}
void RecordMotion(ATerraVehicle *V,float Dt){
  const float Speed=V->Chassis->GetPhysicsLinearVelocity().Size()/100;
  if(State.LastSpeed>3){
    State.PeakLoss=FMath::Max(State.PeakLoss,(State.LastSpeed-Speed)/State.LastSpeed);
    State.PeakDeceleration=FMath::Max(State.PeakDeceleration,(State.LastSpeed-Speed)/FMath::Max(.001f,Dt));
  }
  // A narrow rock patch can fit between 20 FPS body positions. Sample the
  // crossed segment as well as the endpoint so the fixture proves both
  // terrain coverages were crossed rather than just travelling a distance.
  const FVector Position=V->GetActorLocation();
  const int Steps=FMath::Clamp(FMath::CeilToInt(FVector::Dist2D(State.LastPosition,Position)/25),1,64);
  for(int I=0;I<=Steps;++I){
    const FVector P=FMath::Lerp(State.LastPosition,Position,float(I)/Steps);
    const auto Blend=V->Terrain->SurfaceBlend(P.X,P.Y);
    for(int S=0;S<7;++S)if(Blend.Weight[S]>.10f)State.EncounteredMask|=1<<S;
  }
  State.LastPosition=Position;
  State.LastSpeed=Speed;State.MinimumSpeed=FMath::Min(State.MinimumSpeed,Speed);
  State.Travel=FVector::DotProduct(V->GetActorLocation()-State.Start,State.Direction)/100;
  ++State.Frames;
}
void RecordSuspension(ATerraVehicle *V){
  for(int I=0;I<4;++I)if(V->WheelState[I].ContactValid)
    State.PeakCompression=FMath::Max(State.PeakCompression,
        (State.LoadedDistance[I]-V->WheelState[I].Distance)/V->BumpTravel(I<2));
  State.PeakPitch=FMath::Max(State.PeakPitch,FMath::Abs(V->GetActorRotation().Pitch));
  for(auto *C:{V->Chassis.Get(),V->FrontCollision.Get(),V->RearCollision.Get()}){
    const FVector E=C->GetScaledBoxExtent();const FTransform T=C->GetComponentTransform();
    for(float X:{-1.f,1.f})for(float Y:{-1.f,1.f}){
      const FVector Corner=T.TransformPositionNoScale(FVector(X*E.X,Y*E.Y,-E.Z));
      const float Floor=V->Terrain->Height(Corner.X,Corner.Y)+BumpHeight(Corner.X,Corner.Y);
      State.MinimumClearance=FMath::Min(State.MinimumClearance,Corner.Z-Floor);
    }
  }
  const int Vehicle=V->VehicleIndex;
  const FString Expected=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[Vehicle]->AsObject()->GetStringField(TEXT("asset"))+TEXT("_body");
  if(State.ProbesReady[Vehicle]&&State.ProbeAssets[Vehicle]==Expected&&V->Body->GetStaticMesh()){
    const FTransform Transform=V->Body->GetComponentTransform();
    for(const FVector &Local:State.BodyProbes[Vehicle]){
      const FVector P=Transform.TransformPosition(Local);
      const float Floor=V->Terrain->Height(P.X,P.Y)+BumpHeight(P.X,P.Y);
      State.MinimumVisibleClearance=FMath::Min(State.MinimumVisibleClearance,P.Z-Floor);
    }
  }else State.MinimumVisibleClearance=-10000;
}
void EndTrial(){State.Trial++;State.NextPhase(0);}
}

bool Tick(ATerraVehicle *V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check){
  if(State.Vehicle.Get()!=V){State=FTrial();State.Vehicle=V;LoadBodyProbes();WriteFixturePlan(V);}
  State.Time+=FMath::Min(Dt,.1f);
  if(State.Trial<BoundaryTrialCount){
    if(!V->Terrain->TransitionData.IsValid()){
      Check(TEXT("momentum boundary fixture manifest is available"),false,0);return true;
    }
    const auto &Fixtures=V->Terrain->TransitionData->GetArrayField(TEXT("fixtures"));
    if(Fixtures.Num()!=BoundaryTrialCount){Check(TEXT("momentum has seven boundary fixtures"),false,Fixtures.Num());return true;}
    if(State.Phase==0){
      const auto F=Fixtures[State.Trial]->AsObject();const auto P=F->GetArrayField(TEXT("p")),N=F->GetArrayField(TEXT("normal")),Pair=F->GetArrayField(TEXT("pair"));
      State.Name=F->GetStringField(TEXT("name"));State.Direction=FVector(N[0]->AsNumber(),N[1]->AsNumber(),0).GetSafeNormal();
      State.PairMask=(1<<int(Pair[0]->AsNumber()))|(1<<int(Pair[1]->AsNumber()));
      // The shortest downhill crossing needs a full observation window.
      State.Span=FMath::Max(float(F->GetNumberField(TEXT("halfWidthM")))+3,4.5f);
      // The photographic sand-edge fixture starts beside a boulder. Move
      // along the same boundary to a clear corridor; both IDs remain 0/5.
      const FVector Offset=State.Name==TEXT("dirt-sand")?FVector(0,300,0):FVector::ZeroVector;
      Park(V,0,FVector(P[0]->AsNumber(),P[1]->AsNumber(),0)+Offset-State.Direction*State.Span*100,State.Direction);
    }else if(State.Phase==1&&State.Time>2){
      Check(TEXT("coast ")+State.Name+TEXT(" has loaded tires at entry"),V->ContactCount>=3,V->ContactCount);
      Launch(V,12);
    }else if(State.Phase==2){
      RecordMotion(V,Dt);
      if(State.Travel>=State.Span*2||State.Time>5){
        Check(TEXT("coast ")+State.Name+TEXT(" crosses both sides without throttle or brake"),State.Travel>=State.Span*2&&V->Throttle==0&&V->Brake==0&&
            (State.EncounteredMask&State.PairMask)==State.PairMask&&V->ObjectBodyHits==0,State.Travel);
        Check(TEXT("coast ")+State.Name+TEXT(" retains rolling momentum"),State.LastSpeed>2,State.LastSpeed);
        Check(TEXT("coast ")+State.Name+TEXT(" has no abrupt frame speed collapse"),State.Frames>12&&State.PeakLoss<.38f&&State.PeakDeceleration<15,State.PeakLoss);
        UE_LOG(LogTemp,Display,TEXT("TERRA_MOMENTUM_BOUNDARY name=%s travel=%.3f speed=%.3f min=%.3f frameLoss=%.4f deceleration=%.3f coverageMask=%d pairMask=%d terrainHits=%d terrainImpact=%.3f objectHits=%d frames=%d"),
            *State.Name,State.Travel,State.LastSpeed,State.MinimumSpeed,State.PeakLoss,State.PeakDeceleration,State.EncounteredMask,State.PairMask,V->TerrainBodyHits,V->TerrainImpactMPS,V->ObjectBodyHits,State.Frames);
        Capture(TEXT("native-momentum-")+State.Name+TEXT(".png"));EndTrial();
      }
    }
    return false;
  }
  if(State.Trial<BoundaryTrialCount+ATerraVehicle::VehicleCount){
    const int Vehicle=State.Trial-BoundaryTrialCount;
    if(State.Phase==0){
      if(!State.Bump.IsValid())MakeBump(V);
      State.Direction=FVector::ForwardVector;State.Name=FString::Printf(TEXT("vehicle %d"),Vehicle);
      Park(V,Vehicle,V->Terrain->Spawns[1],State.Direction);
    }else if(State.Phase==1&&State.Time>2){
      for(int I=0;I<4;++I)State.LoadedDistance[I]=V->WheelState[I].Distance;
      Check(State.Name+TEXT(" begins at supported ride height"),V->ContactCount==4&&FMath::Abs(V->GetActorLocation().Z-V->Terrain->Height(V->GetActorLocation().X,V->GetActorLocation().Y)-V->ExpectedRideHeight()*100)<12,V->ContactCount);
      Launch(V,8);
    }else if(State.Phase==2){
      RecordMotion(V,Dt);RecordSuspension(V);
      if(State.Travel>12||State.Time>5){
        Check(State.Name+TEXT(" rolls over a rounded rise without sticking"),State.Travel>12&&State.LastSpeed>2,State.LastSpeed);
        Check(State.Name+TEXT(" bump travel remains bounded"),State.PeakCompression<1.40f,State.PeakCompression);
        Check(State.Name+TEXT(" lower body stays above the ground"),State.MinimumClearance>-8,State.MinimumClearance);
        Check(State.Name+TEXT(" visible coachwork clears the rounded rise"),State.MinimumVisibleClearance>-3,State.MinimumVisibleClearance);
        State.RiseVisibleClearance=State.MinimumVisibleClearance;State.MinimumVisibleClearance=10000;
        State.BrakeEntrySpeed=State.LastSpeed;V->TestBrake=1;State.NextPhase(3);
      }
    }else if(State.Phase==3){
      RecordSuspension(V);
      if(State.Time>3){
        const float Speed=V->Chassis->GetPhysicsLinearVelocity().Size()/100;
        Check(State.Name+TEXT(" brakes to rest after the rise"),State.BrakeEntrySpeed>2&&Speed<.35f,Speed);
        Check(State.Name+TEXT(" front suspension resists brake dive"),State.PeakCompression<1.40f&&State.PeakPitch<18,State.PeakCompression);
        Check(State.Name+TEXT(" braking does not bury the nose"),State.MinimumClearance>-8,State.MinimumClearance);
        Check(State.Name+TEXT(" visible coachwork stays clear while braking"),State.MinimumVisibleClearance>-3,State.MinimumVisibleClearance);
        UE_LOG(LogTemp,Display,TEXT("TERRA_MOMENTUM_SUSPENSION vehicle=%d travel=%.3f speed=%.3f compression=%.4f clearanceCM=%.3f riseVisibleCM=%.3f brakeVisibleCM=%.3f probes=%d pitch=%.3f terrainHits=%d objectHits=%d"),
            Vehicle,State.Travel,Speed,State.PeakCompression,State.MinimumClearance,State.RiseVisibleClearance,State.MinimumVisibleClearance,State.BodyProbes[Vehicle].Num(),State.PeakPitch,V->TerrainBodyHits,V->ObjectBodyHits);
        Capture(FString::Printf(TEXT("native-suspension-rise-%d.png"),Vehicle));EndTrial();
      }
    }
    return false;
  }
  if(State.Trial==BoundaryTrialCount+ATerraVehicle::VehicleCount){
    if(State.Phase==0){
      if(State.Bump.IsValid())State.Bump->SetCollisionEnabled(ECollisionEnabled::NoCollision);
      const FVector P=V->Terrain->Spawns[1];State.Direction=FVector::ForwardVector;
      auto *Wall=NewObject<UBoxComponent>(V->Terrain);V->Terrain->AddInstanceComponent(Wall);
      Wall->InitBoxExtent(FVector(30,400,200));Wall->SetCollisionProfileName(TEXT("BlockAll"));Wall->RegisterComponent();
      Wall->SetWorldLocation(P+FVector(850,0,200));State.Wall=Wall;Park(V,0,P,State.Direction);
    }else if(State.Phase==1&&State.Time>2)Launch(V,10);
    else if(State.Phase==2){
      RecordMotion(V,Dt);
      if(State.Time>3){
        Check(TEXT("solid barrier still receives a real chassis collision"),V->ObjectBodyHits>0&&V->ObjectImpactMPS>.2f,V->ObjectImpactMPS);
        Check(TEXT("solid barrier stops unbraked coasting vehicle"),State.LastSpeed<1.5f&&State.Travel<8.5f,State.LastSpeed);
        if(State.Wall.IsValid())State.Wall->DestroyComponent();
        if(State.Bump.IsValid())State.Bump->DestroyComponent();
        EndTrial();
      }
    }
    return false;
  }
  V->TestBrake=1;return true;
}
}
