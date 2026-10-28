#include "TerraDamageValidation.h"
#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"
#include "Kismet/GameplayStatics.h"
#include "Math/RotationMatrix.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "ProceduralMeshComponent.h"
#include "PrimitiveSceneProxy.h"
#include "StaticMeshResources.h"

namespace TerraDamageValidation {
namespace {
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;TWeakObjectPtr<AActor> WallActor;
  TWeakObjectPtr<UStaticMeshComponent> Wall;TWeakObjectPtr<ACameraActor> Camera;
  TWeakObjectPtr<UProceduralMeshComponent> FirstImpactBody;
  int Car=0,Phase=0,Boundary=0,PairMask=0,EncounteredMask=0;
  int FirstImpactEvents=0,FirstImpactSections=0;float FirstImpactDamage=0,FirstImpactDent=0;
  TArray<TArray<FVector>> FirstImpactPositions;
  TArray<TWeakObjectPtr<UPrimitiveComponent>> PatchHiddenTiles;
  bool PatchTireMarksVisible=false;
  float Time=0,Span=0;bool RollSeen=false;FVector Start,DriveStart,Direction,LastPosition;FString BoundaryName;
  void Next(int P){Phase=P;Time=0;}
} State;
void Pose(ATerraVehicle* V,FVector P,FRotator R){V->SetActorLocationAndRotation(P,R,false,nullptr,ETeleportType::TeleportPhysics);V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);V->ResetContactTelemetry();}
void View(ATerraVehicle* V){
  if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
  const FVector Target=V->GetActorLocation()+FVector(0,0,35),Eye=Target+FVector(650,-750,400);
  State.Camera->GetCameraComponent()->SetFieldOfView(54);State.Camera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
  if(auto* PC=UGameplayStatics::GetPlayerController(V,0)){PC->SetViewTarget(State.Camera.Get());if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}
}
bool Wall(ATerraVehicle* V){
  if(!State.WallActor.IsValid()){
    auto* A=V->GetWorld()->SpawnActor<AActor>();auto* C=NewObject<UStaticMeshComponent>(A);
    A->SetRootComponent(C);C->SetMobility(EComponentMobility::Movable);
    C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,TEXT("/Engine/BasicShapes/Cube.Cube")));
    C->SetCollisionProfileName(TEXT("BlockAll"));C->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);C->RegisterComponent();State.WallActor=A;State.Wall=C;
  }
  State.WallActor->SetActorLocation(State.Start+FVector(900,0,120));State.WallActor->SetActorScale3D(FVector(.5f,7,6));
  State.WallActor->SetActorHiddenInGame(false);State.Wall->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
  return State.Wall->IsRegistered();
}
bool Renderer(ATerraVehicle* V){
  if(!V->DamageBody||V->Body->IsVisible()||!V->DamageBody->IsVisible()||V->DamageBody->GetNumSections()!=V->Body->GetStaticMesh()->GetNumSections(0))return false;
  const auto* Render=V->Body->GetStaticMesh()->GetRenderData();if(!Render||!Render->LODResources.IsValidIndex(0))return false;
  for(int I=0;I<V->DamageBody->GetNumSections();++I){auto* M=V->DamageBody->GetMaterial(I);if(!M||M!=V->Body->GetMaterial(Render->LODResources[0].Sections[I].MaterialIndex))return false;}
  return V->DamageBody->GetCollisionEnabled()==ECollisionEnabled::NoCollision&&V->CoachworkCollisionReady;
}
void Launch(ATerraVehicle* V){V->TestBrake=0;V->TestThrottle=0;V->Chassis->SetPhysicsLinearVelocity(FVector(1250,0,0));for(auto& W:V->WheelState)W.Omega=12.5f/FMath::Max(.1f,V->TireDiameter()*.0127f);}
bool PatchDiagnostic(){return FParse::Param(FCommandLine::Get(),TEXT("TerraDamageBoundariesOnly"));}
bool OverlapsPatch(const FBox& B){return B.Min.X<=-11100&&B.Max.X>=-11700&&B.Min.Y<=-1200&&B.Max.Y>=-2200&&B.Min.Z<1800&&B.Max.Z>-1000;}
void InspectPatch(ATerraVehicle* V){
  UE_LOG(LogTemp,Display,TEXT("TERRA_PATCH_BEGIN vehicle=%s"),*V->GetActorLocation().ToString());
  for(TActorIterator<AActor> It(V->GetWorld());It;++It){
    TInlineComponentArray<UPrimitiveComponent*> Components;It->GetComponents(Components);
    for(auto* Component:Components){
      const FBox B=Component->CalcBounds(Component->GetComponentTransform()).GetBox();
      if(!Component->IsVisible()||!OverlapsPatch(B))continue;
      FString Materials;for(int I=0;I<Component->GetNumMaterials();++I)Materials+=FString::Printf(TEXT(" [%d:%s]"),I,*GetPathNameSafe(Component->GetMaterial(I)));
      UE_LOG(LogTemp,Display,TEXT("TERRA_PATCH_COMPONENT path=%s class=%s boundsMin=%s boundsMax=%s collision=%d registered=%d materials=%s"),*Component->GetPathName(),*Component->GetClass()->GetName(),*B.Min.ToString(),*B.Max.ToString(),int(Component->GetCollisionEnabled()),Component->IsRegistered(),*Materials);
      const FBox Cached=Component->Bounds.GetBox();const auto* Proxy=Component->GetSceneProxy();
      const FBox ProxyBounds=Proxy?Proxy->GetBounds().GetBox():FBox(EForceInit::ForceInit);
      UE_LOG(LogTemp,Display,TEXT("TERRA_PATCH_RENDER_BOUNDS path=%s cachedMin=%s cachedMax=%s proxy=%d proxyMin=%s proxyMax=%s renderState=%d dirty=%d hidden=%d"),*Component->GetPathName(),*Cached.Min.ToString(),*Cached.Max.ToString(),Proxy!=nullptr,*ProxyBounds.Min.ToString(),*ProxyBounds.Max.ToString(),Component->IsRenderStateCreated(),Component->IsRenderStateDirty(),Component->bHiddenInGame);
      if(auto* Mesh=Cast<UProceduralMeshComponent>(Component))for(int I=0;I<Mesh->GetNumSections();++I){
        const auto* S=Mesh->GetProcMeshSection(I);if(!S||S->ProcVertexBuffer.IsEmpty()||S->ProcIndexBuffer.IsEmpty())continue;
        const auto& First=S->ProcVertexBuffer[0];
        UE_LOG(LogTemp,Display,TEXT("TERRA_PATCH_SECTION component=%s section=%d vertices=%d triangles=%d material=%s color0=%s uv0=%s normal0=%s"),*Mesh->GetPathName(),I,S->ProcVertexBuffer.Num(),S->ProcIndexBuffer.Num()/3,*GetPathNameSafe(Mesh->GetMaterial(I)),*First.Color.ToString(),*First.UV0.ToString(),*First.Normal.ToString());
        // Bound the full geometry audit to the single white-patch tile.
        const FVector Center=B.GetCenter(),Extent=B.GetExtent();
        if(FMath::Abs(Center.X+11800)<10&&FMath::Abs(Center.Y+2200)<10&&Extent.X<210&&Extent.Y<210){
          int BadVertices=0,BadNormals=0,BadUV=0,BadIndices=0,Degenerate=0;
          float MinimumNormalZ=FLT_MAX,MaximumNormalZ=-FLT_MAX;double MinimumTriangleArea=DBL_MAX;
          FBox Geometry(EForceInit::ForceInit);
          for(const auto& Vertex:S->ProcVertexBuffer){
            if(Vertex.Position.ContainsNaN())++BadVertices;else Geometry+=Vertex.Position;
            if(Vertex.Normal.ContainsNaN())++BadNormals;
            if(!FMath::IsFinite(Vertex.UV0.X)||!FMath::IsFinite(Vertex.UV0.Y))++BadUV;
            MinimumNormalZ=FMath::Min(MinimumNormalZ,float(Vertex.Normal.Z));MaximumNormalZ=FMath::Max(MaximumNormalZ,float(Vertex.Normal.Z));
          }
          for(uint32 Index:S->ProcIndexBuffer)if(Index>=uint32(S->ProcVertexBuffer.Num()))++BadIndices;
          if(!BadIndices&&!BadVertices)for(int Index=0;Index+2<S->ProcIndexBuffer.Num();Index+=3){
            const FVector A=S->ProcVertexBuffer[S->ProcIndexBuffer[Index]].Position,B0=S->ProcVertexBuffer[S->ProcIndexBuffer[Index+1]].Position,C0=S->ProcVertexBuffer[S->ProcIndexBuffer[Index+2]].Position;
            const double Area=FVector::CrossProduct(B0-A,C0-A).Size()*.5;MinimumTriangleArea=FMath::Min(MinimumTriangleArea,Area);if(Area<.0001)++Degenerate;
          }
          const auto* Material=Mesh->GetMaterial(I);
          UE_LOG(LogTemp,Display,TEXT("TERRA_PATCH_GEOMETRY component=%s section=%d visible=%d badVertices=%d badNormals=%d badUV=%d badIndices=%d degenerate=%d minAreaCM2=%.6f normalZMin=%.6f normalZMax=%.6f geometryMin=%s geometryMax=%s materialTwoSided=%d materialBlend=%d"),*Mesh->GetPathName(),I,S->bSectionVisible,BadVertices,BadNormals,BadUV,BadIndices,Degenerate,MinimumTriangleArea,MinimumNormalZ,MaximumNormalZ,*Geometry.Min.ToString(),*Geometry.Max.ToString(),Material?Material->IsTwoSided():false,Material?int(Material->GetBlendMode()):-1);
        }
      }
    }
  }
  FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraDamagePatch),true,V);Query.bReturnFaceIndex=true;
  for(float X:{-11650.f,-11450.f,-11250.f})for(float Y:{-2150.f,-1950.f,-1750.f,-1550.f,-1350.f}){
    FHitResult Hit;const bool Found=V->GetWorld()->LineTraceSingleByChannel(Hit,FVector(X,Y,5000),FVector(X,Y,-1000),ECC_Visibility,Query);
    UE_LOG(LogTemp,Display,TEXT("TERRA_PATCH_RAY x=%.1f y=%.1f hit=%d component=%s point=%s face=%d"),X,Y,Found,*GetPathNameSafe(Hit.GetComponent()),*Hit.ImpactPoint.ToString(),Hit.FaceIndex);
  }
}
void HidePatchTiles(ATerraVehicle* V){
  State.PatchHiddenTiles.Reset();TInlineComponentArray<UProceduralMeshComponent*> Components;V->Terrain->GetComponents(Components);
  for(auto* Mesh:Components){const FBox B=Mesh->CalcBounds(Mesh->GetComponentTransform()).GetBox();const FVector E=B.GetExtent();
    if(Mesh->IsVisible()&&Mesh->ComponentHasTag(TEXT("TerraGround"))&&E.X<=201&&E.Y<=201&&OverlapsPatch(B)){
      State.PatchHiddenTiles.Add(Mesh);Mesh->SetVisibility(false,false);UE_LOG(LogTemp,Display,TEXT("TERRA_PATCH_HIDE_TILE component=%s boundsMin=%s boundsMax=%s"),*Mesh->GetPathName(),*B.Min.ToString(),*B.Max.ToString());
    }
  }
}
bool Boundaries(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(State.Boundary>=7)return true;
  if(!V->Terrain->TransitionData.IsValid()||V->Terrain->TransitionData->GetArrayField(TEXT("fixtures")).Num()!=7){Check(TEXT("damage terrain transition fixtures are available"),false,0);return true;}
  auto C=[&](const TCHAR* Name,bool Pass,float Value=0.f){Check(TEXT("damage enabled transition ")+State.BoundaryName+TEXT(" ")+Name,Pass,Value);};
  if(State.Phase==0){
    if(State.Wall.IsValid())State.Wall->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    const auto F=V->Terrain->TransitionData->GetArrayField(TEXT("fixtures"))[State.Boundary]->AsObject();
    const auto P=F->GetArrayField(TEXT("p")),N=F->GetArrayField(TEXT("normal")),Pair=F->GetArrayField(TEXT("pair"));
    State.BoundaryName=F->GetStringField(TEXT("name"));State.Direction=FVector(N[0]->AsNumber(),N[1]->AsNumber(),0).GetSafeNormal();
    State.PairMask=(1<<int(Pair[0]->AsNumber()))|(1<<int(Pair[1]->AsNumber()));State.EncounteredMask=0;
    State.Span=FMath::Max(float(F->GetNumberField(TEXT("halfWidthM")))+3,4.5f);
    FVector Ground=FVector(P[0]->AsNumber(),P[1]->AsNumber(),0)-State.Direction*State.Span*100;
    if(State.BoundaryName==TEXT("dirt-sand"))Ground+=FVector(0,300,0);
    V->SetGarage(true);V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);V->Terrain->ResetSoil();V->RouteIndex=-1;
    V->SetDamageEnabled(true,false);V->RepairDamage();V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;V->LowRange=V->DescentAssist=false;
    Ground.Z=V->Terrain->Height(Ground.X,Ground.Y);State.DriveStart=Ground;State.Next(10);
  }else if(State.Phase==10&&State.Time>1.1f){
    // Re-enabling simulation and welding coachwork finish before applying the
    // fixture pose; a same-tick pose was replaced by the restored spawn body.
    const FVector Ground=State.DriveStart,Normal=V->Terrain->Sample(Ground).Normal;
    const FVector Forward=(State.Direction-Normal*FVector::DotProduct(State.Direction,Normal)).GetSafeNormal();
    Pose(V,Ground+FVector(0,0,V->ExpectedRideHeight()*100+14),FRotationMatrix::MakeFromXZ(Forward,Normal).Rotator());State.Next(1);
  }else if(State.Phase==1&&State.Time>2){
    const float PoseError=FVector::Dist2D(V->GetActorLocation(),State.DriveStart);
    C(TEXT("has loaded tires enabled damage and the measured fixture pose"),V->DamageEnabled&&V->ContactCount>=3&&PoseError<100&&FVector::DotProduct(V->GetActorForwardVector(),State.Direction)>.9f,PoseError);
    State.Start=State.LastPosition=V->GetActorLocation();V->ResetContactTelemetry();V->TestBrake=0;
    V->Chassis->SetPhysicsLinearVelocity(V->GetActorForwardVector()*1200);for(auto& W:V->WheelState)W.Omega=12/FMath::Max(.1f,V->TireDiameter()*.0127f);State.Next(2);
  }else if(State.Phase==2){
    const FVector Position=V->GetActorLocation();const int Steps=FMath::Clamp(FMath::CeilToInt(FVector::Dist2D(State.LastPosition,Position)/25),1,64);
    for(int I=0;I<=Steps;++I){const FVector P=FMath::Lerp(State.LastPosition,Position,float(I)/Steps);const auto Blend=V->Terrain->SurfaceBlend(P.X,P.Y);
      for(int S=0;S<7;++S)if(Blend.Weight[S]>.1f)State.EncounteredMask|=1<<S;}
    State.LastPosition=Position;const float Travel=FVector::DotProduct(Position-State.Start,State.Direction)/100;
    if(Travel>=State.Span*2||State.Time>5){
      C(TEXT("crosses both surfaces without throttle brake or object impact"),Travel>=State.Span*2&&V->Throttle==0&&V->Brake==0&&V->ObjectBodyHits==0&&(State.EncounteredMask&State.PairMask)==State.PairMask,Travel);
      C(TEXT("terrain and suspension do not accumulate nuisance damage"),V->DamageEnabled&&V->Damage==0&&V->DamageEventCount==0,V->Damage);
      C(TEXT("retains rolling momentum over rendered terrain"),V->Chassis->GetPhysicsLinearVelocity().Size()>200&&V->Terrain->HasVisibleSoilCoverage(Position),V->Chassis->GetPhysicsLinearVelocity().Size()/100);
      UE_LOG(LogTemp,Display,TEXT("TERRA_DAMAGE_BOUNDARY name=%s start=%s end=%s travel=%.3f speed=%.3f coverage=%d pair=%d throttle=%.3f brake=%.3f terrainHits=%d objectHits=%d damage=%.4f"),
        *State.BoundaryName,*State.Start.ToString(),*Position.ToString(),Travel,V->Chassis->GetPhysicsLinearVelocity().Size()/100,State.EncounteredMask,State.PairMask,V->Throttle,V->Brake,V->TerrainBodyHits,V->ObjectBodyHits,V->Damage);
      View(V);V->TestBrake=1;State.Next(3);
    }
  }else if(State.Phase==3&&State.Time>.4f){
    View(V);
    const bool Coverage=V->Terrain->HasVisibleSoilCoverage(V->GetActorLocation());
    UE_LOG(LogTemp,Display,TEXT("TERRA_DAMAGE_CAPTURE_COVERAGE name=%s position=%s rendered=%d"),*State.BoundaryName,*V->GetActorLocation().ToString(),Coverage);
    if(PatchDiagnostic()&&State.BoundaryName==TEXT("dirt-mud"))InspectPatch(V);
    Capture(*(TEXT("native-damage-transition-")+State.BoundaryName+TEXT(".png")));
    State.Next(PatchDiagnostic()&&State.BoundaryName==TEXT("dirt-mud")?30:4);
  }else if(State.Phase==30&&State.Time>.4f){
    State.PatchTireMarksVisible=V->Terrain->TireMarkMesh&&V->Terrain->TireMarkMesh->IsVisible();
    if(V->Terrain->TireMarkMesh)V->Terrain->TireMarkMesh->SetVisibility(false,false);State.Next(31);
  }else if(State.Phase==31&&State.Time>.4f){View(V);Capture(TEXT("native-damage-patch-no-tiremarks.png"));State.Next(32);
  }else if(State.Phase==32&&State.Time>.4f){
    if(V->Terrain->TireMarkMesh)V->Terrain->TireMarkMesh->SetVisibility(State.PatchTireMarksVisible,false);HidePatchTiles(V);State.Next(33);
  }else if(State.Phase==33&&State.Time>.4f){View(V);Capture(TEXT("native-damage-patch-no-detailtiles.png"));State.Next(34);
  }else if(State.Phase==34&&State.Time>.4f){for(auto& Mesh:State.PatchHiddenTiles)if(Mesh.IsValid())Mesh->SetVisibility(true,false);State.PatchHiddenTiles.Reset();State.Next(4);
  }else if(State.Phase==4&&State.Time>.4f){++State.Boundary;State.Next(0);}
  return false;
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(State.Vehicle.Get()!=V){State=FState();State.Vehicle=V;if(PatchDiagnostic())State.Car=ATerraVehicle::VehicleCount;UE_LOG(LogTemp,Display,TEXT("TERRA_DAMAGE_READY vehicles=9 checks=228 captures=45 boundariesOnly=%d"),PatchDiagnostic());}
  State.Time+=Dt;
  if(State.Car>=ATerraVehicle::VehicleCount){if(!Boundaries(V,Check,Capture))return false;if(State.WallActor.IsValid())State.WallActor->Destroy();V->SetDamageEnabled(false,false);return true;}
  const FString Prefix=FString::Printf(TEXT("damage vehicle %d "),State.Car);
  auto C=[&](const TCHAR* Name,bool Pass,float Value=0.f){Check(Prefix+Name,Pass,Value);};
  if(State.Phase==0){
    if(State.Wall.IsValid())State.Wall->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    V->SetGarage(true);V->SelectVehicle(State.Car);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);V->RouteIndex=-1;
    V->SetDamageEnabled(true,false);V->RepairDamage();V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    C(TEXT("cooked body supports runtime deformation"),V->Body->GetStaticMesh()&&V->Body->GetStaticMesh()->bAllowCPUAccess);
    C(TEXT("begins with enabled clean structural and visual state"),V->DamageEnabled&&V->Damage==0&&V->DamageEventCount==0&&V->Body->IsVisible());
    State.Next(1);
  }else if(State.Phase==1&&State.Time>1.2f){
    State.Start=V->Terrain->Spawns[1]+FVector(3000,0,0);State.Start.Z=V->Terrain->Height(State.Start.X,State.Start.Y)+V->ExpectedRideHeight()*100+5;
    Pose(V,State.Start,FRotator::ZeroRotator);State.DriveStart=State.Start;V->TestThrottle=.6f;V->TestBrake=0;State.Next(2);
  }else if(State.Phase==2&&State.Time>2.2f){
    C(TEXT("ordinary enabled driving makes measured forward progress"),V->GetActorLocation().X-State.DriveStart.X>25,V->GetActorLocation().X-State.DriveStart.X);
    C(TEXT("ordinary tire support and driving do not accumulate damage"),V->Damage==0&&V->DamageEventCount==0,V->Damage);
    State.Start=V->GetActorLocation();V->TestThrottle=0;C(TEXT("registered solid wall fixture exists"),Wall(V));Launch(V);State.Next(3);
  }else if(State.Phase==3&&State.Time>3.5f){
    C(TEXT("real moving rigid body collides with the object"),V->ObjectBodyHits>0&&V->ObjectImpactMPS>2,V->ObjectImpactMPS);
    C(TEXT("object impact accumulates bounded structural damage"),V->Damage>0&&V->Damage<=1&&V->DamageEventCount>0,V->Damage);
    C(TEXT("object impact visibly displaces actual body vertices"),V->DeformedVertexCount>100&&V->MaximumDentCM>.5f&&V->MaximumDentCM<=24.01f,V->MaximumDentCM);
    C(TEXT("deformed renderer retains materials and stable original collision"),Renderer(V),V->DeformedVertexCount);
    C(TEXT("front impact reduces actual drive or braking capacity"),V->DamageDriveFactor()<.999f||V->DamageBrakeFactor()<.999f,V->DamageDriveFactor());
    // Preserve the first-hit assertions, then hit the same real wall again
    // without repairing or replacing the active procedural body/cache.
    State.FirstImpactBody=V->DamageBody;State.FirstImpactEvents=V->DamageEventCount;
    State.FirstImpactDamage=V->Damage;State.FirstImpactDent=V->MaximumDentCM;
    State.FirstImpactSections=V->DamageBody?V->DamageBody->GetNumSections():0;
    State.FirstImpactPositions.SetNum(State.FirstImpactSections);
    for(int I=0;I<State.FirstImpactSections;++I){
      auto& Before=State.FirstImpactPositions[I];Before.Reset();
      if(const auto* Section=V->DamageBody->GetProcMeshSection(I)){
        Before.Reserve(Section->ProcVertexBuffer.Num());
        for(const auto& Vertex:Section->ProcVertexBuffer)Before.Add(Vertex.Position);
      }
    }
    Pose(V,State.Start,FRotator::ZeroRotator);V->TestBrake=1;State.Next(30);
  }else if(State.Phase==30&&State.Time>1.1f){Launch(V);State.Next(31);
  }else if(State.Phase==31&&State.Time>3.5f){
    const bool SameRenderer=State.FirstImpactBody.IsValid()&&V->DamageBody==State.FirstImpactBody.Get()&&
      State.FirstImpactSections>0&&V->DamageBody->GetNumSections()==State.FirstImpactSections;
    bool SameTopology=SameRenderer;int ChangedVertices=0;float MaximumMovementCM=0;
    if(SameRenderer)for(int I=0;I<State.FirstImpactSections;++I){
      const auto* Section=V->DamageBody->GetProcMeshSection(I);const auto& Before=State.FirstImpactPositions[I];
      if(!Section||Section->ProcVertexBuffer.Num()!=Before.Num()){SameTopology=false;continue;}
      for(int J=0;J<Before.Num();++J){const FVector After=Section->ProcVertexBuffer[J].Position;
        if(After.ContainsNaN()){SameTopology=false;continue;}
        const float Movement=FVector::Dist(Before[J],After);
        if(Movement>.05f)++ChangedVertices;MaximumMovementCM=FMath::Max(MaximumMovementCM,Movement);
      }
    }
    C(TEXT("second real wall impact changes actual body vertices and increases damage through the existing renderer"),
      V->DamageEnabled&&V->ObjectBodyHits>0&&V->ObjectImpactMPS>2&&V->DamageEventCount>State.FirstImpactEvents&&
      V->Damage>State.FirstImpactDamage&&ChangedVertices>100&&MaximumMovementCM>.1f&&V->MaximumDentCM<=24.01f&&
      SameTopology&&Renderer(V)&&V->Chassis->GetPhysicsLinearVelocity().X<500,MaximumMovementCM);
    UE_LOG(LogTemp,Display,TEXT("TERRA_DAMAGE_REPEAT vehicle=%d eventsBefore=%d eventsAfter=%d damageBefore=%.4f damageAfter=%.4f dentBeforeCM=%.3f dentAfterCM=%.3f objectHits=%d deltaV=%.3f sameRenderer=%d validRenderer=%d changedVertices=%d maxMovementCM=%.3f sameTopology=%d"),
      State.Car,State.FirstImpactEvents,V->DamageEventCount,State.FirstImpactDamage,V->Damage,State.FirstImpactDent,V->MaximumDentCM,V->ObjectBodyHits,V->ObjectImpactMPS,SameRenderer,Renderer(V),ChangedVertices,MaximumMovementCM,SameTopology);
    State.FirstImpactPositions.Reset();
    State.WallActor->SetActorHiddenInGame(true);V->TestBrake=1;View(V);State.Next(4);
  }else if(State.Phase==4&&State.Time>.4f){Capture(*FString::Printf(TEXT("native-damage-v%d-object.png"),State.Car));State.Next(State.Car==8?40:5);
  }else if(State.Phase==40&&State.Time>.4f){
    if(auto* PC=UGameplayStatics::GetPlayerController(V,0))PC->SetViewTarget(V);
    V->SetGarage(true);C(TEXT("garage retains visible collision damage for condition and repair controls"),V->Garage&&V->DamageEnabled&&V->Damage>0&&Renderer(V));State.Next(41);
  }else if(State.Phase==41&&State.Time>.5f){Capture(TEXT("native-damage-garage-enabled.png"));State.Next(42);
  }else if(State.Phase==42&&State.Time>.4f){
    V->SetDamageEnabled(false,false);C(TEXT("garage free run toggle restores original body and full capacity"),V->Garage&&!V->DamageEnabled&&V->Damage==0&&V->Body->IsVisible()&&V->DamageDriveFactor()==1);State.Next(43);
  }else if(State.Phase==43&&State.Time>.4f){Capture(TEXT("native-damage-garage-free-run.png"));State.Next(44);
  }else if(State.Phase==44&&State.Time>.4f){V->SetGarage(false);View(V);State.Next(5);
  }else if(State.Phase==5&&State.Time>.4f){
    V->RepairDamage();C(TEXT("repair restores geometry health and full mechanical capacity"),V->Damage==0&&V->DeformedVertexCount==0&&V->Body->IsVisible()&&V->DamageDriveFactor()==1&&V->DamageBrakeFactor()==1);
    V->SetDamageEnabled(false,false);C(TEXT("free run disables damage and restores clean condition"),!V->DamageEnabled&&V->Damage==0&&V->DamageSteeringOffset()==0);
    Pose(V,State.Start,FRotator::ZeroRotator);State.WallActor->SetActorHiddenInGame(false);V->TestBrake=1;State.Next(6);
  }else if(State.Phase==6&&State.Time>1.1f){Launch(V);State.Next(7);
  }else if(State.Phase==7&&State.Time>3.5f){
    C(TEXT("free run retains real object collision and stopping"),V->ObjectBodyHits>0&&V->ObjectImpactMPS>2&&V->Chassis->GetPhysicsLinearVelocity().X<500,V->ObjectImpactMPS);
    C(TEXT("free run object impact cannot accumulate damage"),V->Damage==0&&V->DamageEventCount==0&&V->MaximumDentCM==0,V->Damage);
    C(TEXT("free run keeps clean original body visible"),V->Body->IsVisible()&&(!V->DamageBody||!V->DamageBody->IsVisible()));
    State.WallActor->SetActorHiddenInGame(true);V->TestBrake=1;View(V);State.Next(8);
  }else if(State.Phase==8&&State.Time>.4f){Capture(*FString::Printf(TEXT("native-damage-v%d-free-run.png"),State.Car));State.Next(9);
  }else if(State.Phase==9&&State.Time>.4f){
    State.Wall->SetCollisionEnabled(ECollisionEnabled::NoCollision);V->SetDamageEnabled(true,false);V->RepairDamage();
    C(TEXT("damage can be enabled again without pre-existing impairment"),V->DamageEnabled&&V->Damage==0&&V->DamageDriveFactor()==1);
    const FRotator R(0,0,180);const FQuat Q=R.Quaternion();const auto Bounds=V->Body->GetStaticMesh()->GetBounds();
    FVector Center=State.Start;float MinZ=100000;
    for(int X:{-1,1})for(int Y:{-1,1})for(int Z:{-1,1})MinZ=FMath::Min(MinZ,float(Q.RotateVector(Bounds.Origin+Bounds.BoxExtent*FVector(X,Y,Z)).Z));
    Center.Z=V->Terrain->Height(Center.X,Center.Y)-MinZ+135;
    Pose(V,Center,R);V->TestThrottle=V->TestSteer=V->TestBrake=0;State.RollSeen=false;State.Next(10);
  }else if(State.Phase==10){
    State.RollSeen|=V->GetActorUpVector().Z<-.8f;
    if(State.Time>4.5f){
      C(TEXT("roof trial actually enters overturned pose under gravity"),State.RollSeen,V->GetActorUpVector().Z);
      C(TEXT("roof trial creates real terrain body collision"),V->TerrainBodyHits>0&&V->TerrainImpactMPS>1.65f,V->TerrainImpactMPS);
      C(TEXT("rollover creates localized visible damage"),V->DamageEventCount>0&&V->DeformedVertexCount>100&&V->MaximumDentCM>.5f&&Renderer(V),V->MaximumDentCM);
      View(V);State.Next(11);
    }
  }else if(State.Phase==11&&State.Time>.4f){Capture(*FString::Printf(TEXT("native-damage-v%d-roof-rolled.png"),State.Car));State.Next(12);
  }else if(State.Phase==12&&State.Time>.4f){
    const float Before=V->Damage;const int Events=V->DamageEventCount;
    V->TeleportZone(1);V->TestBrake=1;
    C(TEXT("normal recovery retains visible and mechanical damage"),Before>0&&V->Damage==Before&&V->DamageEventCount==Events&&Renderer(V),V->Damage);
    State.Next(13);
  }else if(State.Phase==13&&State.Time>1.2f){View(V);State.Next(14);
  }else if(State.Phase==14&&State.Time>.4f){Capture(*FString::Printf(TEXT("native-damage-v%d-roof.png"),State.Car));State.Next(15);
  }else if(State.Phase==15&&State.Time>.4f){
    V->SetDamageEnabled(false,false);C(TEXT("disabling after rollover clears deformation and restores handling"),V->Damage==0&&V->DeformedVertexCount==0&&V->Body->IsVisible()&&V->DamageDriveFactor()==1&&V->DamageBrakeFactor()==1&&V->DamageSteeringOffset()==0);
    ++State.Car;State.Next(0);
  }
  return false;
}
}
