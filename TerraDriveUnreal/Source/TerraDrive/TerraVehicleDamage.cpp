#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "StaticMeshResources.h"

struct FTerraDamageVisualSection {
  TArray<FVector> Original,Positions,Normals;
  TArray<int32> Triangles;
  TArray<FVector2D> UV;
  TArray<FProcMeshTangent> Tangents;
  float LampDamage=0;
  int MaterialIndex=0;
  bool Glass=false;
};
struct FTerraDamageVisualCache {
  TArray<FTerraDamageVisualSection> Sections;
  FVector ScarCenters[16];float ScarRadii[16]={};int ScarCursor=0;
};

bool ATerraVehicle::PrepareDamageMesh(){
  if(DamageVisualCache.IsValid())return true;
  UStaticMesh* Mesh=Body?Body->GetStaticMesh():nullptr;
  auto Fail=[&](const TCHAR* Reason){Notice=TEXT("Damage unavailable: this vehicle body needs reimporting");
    UE_LOG(LogTemp,Error,TEXT("TERRA_DAMAGE_MESH_UNAVAILABLE model=%s reason=%s"),*VehicleName,Reason);return false;};
  if(!Mesh||!Mesh->bAllowCPUAccess){
    return Fail(TEXT("missing mesh or cooked CPU access"));
  }
  const auto* Render=Mesh->GetRenderData();
  if(!Render||!Render->LODResources.IsValidIndex(0))return Fail(TEXT("missing cooked LOD render data"));
  auto Cache=MakeShared<FTerraDamageVisualCache>();
  const int Count=Mesh->GetNumSections(0);if(Count<=0)return Fail(TEXT("body has no sections"));
  const auto& LOD=Render->LODResources[0];const auto& Buffers=LOD.VertexBuffers;
  const auto Indices=LOD.IndexBuffer.GetArrayView();const int VertexCount=Buffers.PositionVertexBuffer.GetNumVertices();
  if(VertexCount<=0||Buffers.StaticMeshVertexBuffer.GetNumVertices()!=VertexCount||Indices.Num()==0)return Fail(TEXT("cooked CPU buffers are empty"));
  // Dense section remapping avoids a hash lookup/allocation for every triangle
  // index in the general-purpose extraction helper. Tags permit shared source
  // vertices across sections without clearing a full vertex map per section.
  TArray<int32> VertexMap,VertexSection;VertexMap.SetNumUninitialized(VertexCount);VertexSection.Init(-1,VertexCount);
  Cache->Sections.SetNum(Count);
  for(int I=0;I<Count;++I){
    auto& S=Cache->Sections[I];const auto& Section=LOD.Sections[I];
    const uint64 End=uint64(Section.FirstIndex)+uint64(Section.NumTriangles)*3;
    if(End>uint64(Indices.Num()))return Fail(TEXT("section indices exceed cooked buffer"));
    const int Reserve=FMath::Min(uint32(VertexCount),Section.MaxVertexIndex-Section.MinVertexIndex+1);
    S.Positions.Reserve(Reserve);S.Normals.Reserve(Reserve);S.UV.Reserve(Reserve);S.Tangents.Reserve(Reserve);S.Triangles.Reserve(Section.NumTriangles*3);
    for(uint32 Index=Section.FirstIndex;Index<End;++Index){const uint32 Source=Indices[Index];
      if(Source>=uint32(VertexCount))return Fail(TEXT("invalid section vertex index"));
      if(VertexSection[Source]!=I){
        VertexSection[Source]=I;VertexMap[Source]=S.Positions.Num();
        S.Positions.Add(FVector(Buffers.PositionVertexBuffer.VertexPosition(Source)));
        const FVector4 TangentZ=FVector4(Buffers.StaticMeshVertexBuffer.VertexTangentZ(Source));
        S.Normals.Add(FVector(TangentZ));
        S.UV.Add(Buffers.StaticMeshVertexBuffer.GetNumTexCoords()?FVector2D(Buffers.StaticMeshVertexBuffer.GetVertexUV(Source,0)):FVector2D::ZeroVector);
        const FVector4 TangentX=FVector4(Buffers.StaticMeshVertexBuffer.VertexTangentX(Source));
        S.Tangents.Add(FProcMeshTangent(FVector(TangentX),TangentZ.W<0));
      }
      S.Triangles.Add(VertexMap[Source]);
    }
    if(S.Positions.IsEmpty()||S.Triangles.IsEmpty()||S.Normals.Num()!=S.Positions.Num()||S.Tangents.Num()!=S.Positions.Num())return Fail(TEXT("body section extraction failed"));
    // EXP roof/solar topology is already prepared by the offline exporter.
    // Collision handling only copies the cooked buffers and applies the dent.
    S.Original=S.Positions;
    S.MaterialIndex=Render->LODResources[0].Sections[I].MaterialIndex;
    if(auto* M=Body->GetMaterial(S.MaterialIndex))S.Glass=M->GetName().Contains(TEXT("glass"),ESearchCase::IgnoreCase);
  }
  auto Create=[&](const TCHAR* Name){auto* C=NewObject<UProceduralMeshComponent>(this,Name);C->SetupAttachment(Body);
    C->SetRelativeTransform(FTransform::Identity);C->SetCollisionEnabled(ECollisionEnabled::NoCollision);C->SetCanEverAffectNavigation(false);
    C->bUseAsyncCooking=false;C->SetMobility(EComponentMobility::Movable);C->RegisterComponent();return C;};
  if(!DamageBody)DamageBody=Create(TEXT("ImpactDeformedCoachwork"));
  if(!DamageScars){DamageScars=Create(TEXT("ImpactScratchesAndGlassCracks"));DamageScars->SetCastShadow(false);}
  DamageBody->ClearAllMeshSections();DamageScars->ClearAllMeshSections();
  for(int I=0;I<Count;++I){const auto& S=Cache->Sections[I];
    // The actual dynamic lamp instances are shared so brake/reverse still work.
    DamageBody->SetMaterial(I,Body->GetMaterial(S.MaterialIndex));
  }
  DamageVisualCache=Cache;DamageBody->SetVisibility(true);DamageBody->SetHiddenInGame(false);
  DamageScars->SetVisibility(true);DamageScars->SetHiddenInGame(false);
  Body->SetVisibility(false,false);
  return true;
}

void ATerraVehicle::RepairDamage(){
  StructuralDamage=TerraSim::DamageState();Damage=0;DamageEventCount=DeformedVertexCount=0;MaximumDentCM=0;
  DamageVisualCache.Reset();
  if(DamageBody){DamageBody->ClearAllMeshSections();DamageBody->SetVisibility(false);}
  if(DamageScars){DamageScars->ClearAllMeshSections();DamageScars->SetVisibility(false);}
  if(Body)Body->SetVisibility(true,false);
  UpdateLamps();
}
void ATerraVehicle::SetDamageEnabled(bool Enabled,bool Persist){
  DamageEnabled=Enabled;
  if(!Enabled)RepairDamage();
  Notice=Enabled?TEXT("Damage on: impacts can dent the body and reduce performance"):
    TEXT("Free run: damage off, vehicle repaired");
  if(Persist&&!AutoTest)SaveGarage(GaragePath());
}
FString ATerraVehicle::DamageDescription()const{
  if(!DamageEnabled)return TEXT("FREE RUN | damage off | clean vehicle");
  return FString::Printf(TEXT("Condition %.0f%% | drive %.0f%% | brakes %.0f%% | %d %s"),
    (1-Damage)*100,DamageDriveFactor()*100,DamageBrakeFactor()*100,DamageEventCount,DamageEventCount==1?TEXT("impact"):TEXT("impacts"));
}
float ATerraVehicle::DamageDriveFactor()const{return DamageEnabled?TerraSim::DamageDrive(StructuralDamage,IsElectric()):1.f;}
float ATerraVehicle::DamageBrakeFactor()const{return DamageEnabled?TerraSim::DamageBraking(StructuralDamage):1.f;}
float ATerraVehicle::DamageSteeringOffset()const{return DamageEnabled&&!Overturned?TerraSim::DamageSteering(StructuralDamage)*FMath::Clamp(FMath::Abs(Speed)/4.f,0.f,1.f):0.f;}

void ATerraVehicle::RegisterDamageImpact(FVector Impulse,const FHitResult& Hit,bool Ground){
  if(!DamageEnabled||Garage||!Body||!Body->GetStaticMesh()||!GetWorld())return;
  const FTransform Transform=Body->GetComponentTransform();
  const FVector Local=Transform.InverseTransformPosition(Hit.ImpactPoint);
  const FBoxSphereBounds Bounds=Body->GetStaticMesh()->GetBounds();
  const FVector Q=(Local-Bounds.Origin)/Bounds.BoxExtent.ComponentMax(FVector(1));
  TerraSim::DamageImpact I;I.DeltaV=FMath::Abs(FVector::DotProduct(Impulse,Hit.ImpactNormal.GetSafeNormal()))/FMath::Max(1.f,Chassis->GetMass()*100);
  I.Time=GetWorld()->GetTimeSeconds();I.X=Local.X;I.Y=Local.Y;I.Z=Local.Z;I.Protection=Tuning.Damage;
  I.Ground=Ground;I.Upright=GetActorUpVector().Z>.65f;I.Zone=TerraSim::DamageRegion(Q.X,Q.Y,Q.Z);
  auto Candidate=StructuralDamage;const auto R=TerraSim::AccumulateDamage(Candidate,I);if(!R.Accepted)return;
  const double DamageStarted=FPlatformTime::Seconds();
  if(!PrepareDamageMesh())return;
  const bool FirstDent=DamageBody->GetNumSections()==0;
  StructuralDamage=Candidate;Damage=TerraSim::DamageAmount(StructuralDamage);DamageEventCount=StructuralDamage.Events;
  // A later dent can move a previously scratched panel. Remove only scars
  // intersecting that region, then create a new surface-projected replacement.
  for(int Scar=0;Scar<16;++Scar)if(DamageVisualCache->ScarRadii[Scar]>0&&
      FVector::Dist(DamageVisualCache->ScarCenters[Scar],Local)<R.RadiusCM+DamageVisualCache->ScarRadii[Scar]){
    DamageScars->ClearMeshSection(Scar);DamageVisualCache->ScarRadii[Scar]=0;
  }
  FVector Inward=Transform.InverseTransformVectorNoScale(Hit.ImpactNormal).GetSafeNormal();
  const FVector ToCenter=(Bounds.Origin-Local).GetSafeNormal();
  if(Inward.IsNearlyZero()||FVector::DotProduct(Inward,ToCenter)<.1f)Inward=ToCenter;
  int NearestSection=-1,NearestVertex=-1;float NearestDistance=FLT_MAX;int Changed=0;
  for(int Section=0;Section<DamageVisualCache->Sections.Num();++Section){
    auto& S=DamageVisualCache->Sections[Section];bool ChangedSection=false;
    for(int V=0;V<S.Original.Num();++V){
      const float Distance=FVector::Dist(S.Original[V],Local);
      if(Distance<NearestDistance){NearestDistance=Distance;NearestSection=Section;NearestVertex=V;}
      const float Weight=TerraSim::DentWeight(Distance,R.RadiusCM);if(Weight<=0)continue;
      FVector Offset=S.Positions[V]-S.Original[V]+Inward*(R.DepthCM*Weight);
      Offset=Offset.GetClampedToMaxSize(24.f);const FVector Next=S.Original[V]+Offset;
      if(!S.Positions[V].Equals(Next,.005f)){
        // Transform the imported smooth normal with the inverse-transpose of
        // this radial dent's Jacobian. This keeps UV seams/hard edges intact
        // and is O(vertices); the library tangent generator searches coincident
        // vertices quadratically and is unsuitable for these large bodies.
        const float T=1-Distance/R.RadiusCM;
        const FVector Gradient=(S.Original[V]-Local).GetSafeNormal()*(-6*T*(1-T)*R.DepthCM/R.RadiusCM);
        const float Determinant=1+FVector::DotProduct(Gradient,Inward);
        if(S.Normals.IsValidIndex(V)&&FMath::Abs(Determinant)>.15f){
          const FVector N=(S.Normals[V]-Gradient*(FVector::DotProduct(Inward,S.Normals[V])/Determinant)).GetSafeNormal();
          S.Normals[V]=N;
          if(S.Tangents.IsValidIndex(V)){FVector Tangent=S.Tangents[V].TangentX;
            Tangent+=Inward*FVector::DotProduct(Gradient,Tangent);
            S.Tangents[V].TangentX=(Tangent-N*FVector::DotProduct(Tangent,N)).GetSafeNormal();}
        }
        S.Positions[V]=Next;ChangedSection=true;++Changed;MaximumDentCM=FMath::Max(MaximumDentCM,float(Offset.Size()));
      }
    }
    // On the first impact upload the already deformed geometry once, rather
    // than creating a pristine copy and immediately uploading changed sections.
    if(FirstDent)DamageBody->CreateMeshSection(Section,S.Positions,S.Triangles,S.Normals,S.UV,TArray<FColor>(),S.Tangents,false);
    else if(ChangedSection)DamageBody->UpdateMeshSection(Section,S.Positions,S.Normals,S.UV,TArray<FColor>(),S.Tangents);
    if(ChangedSection){
      if(Cast<UMaterialInstanceDynamic>(DamageBody->GetMaterial(Section)))S.LampDamage=FMath::Max(S.LampDamage,R.Severity);
    }
  }
  DeformedVertexCount=0;
  for(const auto& S:DamageVisualCache->Sections)for(int IVertex=0;IVertex<S.Positions.Num();++IVertex)
    if(!S.Positions[IVertex].Equals(S.Original[IVertex],.05f))++DeformedVertexCount;
  // Small, bounded surface scars supplement the actual dents. Glass gets a
  // fractured star; painted surfaces get short scrape strokes. No particles or
  // detached rigid bodies are spawned and collision hulls stay stable.
  if(NearestSection>=0&&NearestDistance<R.RadiusCM){
    const auto& S=DamageVisualCache->Sections[NearestSection];const FVector N=S.Normals[NearestVertex].GetSafeNormal();
    const FVector ScarAnchor=S.Positions[NearestVertex]+N*.22f;
    const FVector A=FVector::CrossProduct(N,FMath::Abs(N.Z)<.9f?FVector::UpVector:FVector::ForwardVector).GetSafeNormal();
    const FVector B=FVector::CrossProduct(N,A).GetSafeNormal();TArray<FVector> P,Normals;TArray<int32> T;TArray<FVector2D> UV;
    const int Lines=S.Glass?7:5;const float Length=5+R.Severity*18;
    TArray<int32> Patch;
    for(int Tri=0;Tri<S.Triangles.Num();Tri+=3)for(int K=0;K<3;++K)
      if(FVector::DistSquared(S.Positions[S.Triangles[Tri+K]],ScarAnchor)<FMath::Square(Length*2)){Patch.Add(Tri);break;}
    auto OnSurface=[&](FVector Point){FVector Best=ScarAnchor,Normal=N;double BestDistance=DBL_MAX;
      for(int Tri:Patch){const int X=S.Triangles[Tri],Y=S.Triangles[Tri+1],Z=S.Triangles[Tri+2];
        const FVector Closest=FMath::ClosestPointOnTriangleToPoint(Point,S.Positions[X],S.Positions[Y],S.Positions[Z]);
        const double Distance=FVector::DistSquared(Point,Closest);
        if(Distance<BestDistance){BestDistance=Distance;Best=Closest;Normal=(S.Normals[X]+S.Normals[Y]+S.Normals[Z]).GetSafeNormal();}}
      return Best+Normal*.22f;};
    for(int L=0;L<Lines;++L){const float Angle=S.Glass?L*2*PI/Lines:float(L%2)*.13f;
      const FVector D=A*FMath::Cos(Angle)+B*FMath::Sin(Angle),Side=FVector::CrossProduct(N,D)*.13f;
      const FVector Start=S.Glass?ScarAnchor:ScarAnchor+B*(L-2)*.8f;
      const FVector End=Start+D*Length*(.65f+.07f*(L%4));const int Base=P.Num();
      P.Append({OnSurface(Start-Side),OnSurface(Start+Side),OnSurface(End+Side),OnSurface(End-Side)});T.Append({Base,Base+1,Base+2,Base,Base+2,Base+3});
      for(int K=0;K<4;++K){Normals.Add(N);UV.Add(FVector2D(K%2,K/2));}
    }
    int Scar=DamageVisualCache->ScarCursor++%16;for(int K=0;K<16;++K)if(DamageVisualCache->ScarRadii[K]==0){Scar=K;break;}
    DamageVisualCache->ScarCenters[Scar]=S.Original[NearestVertex];DamageVisualCache->ScarRadii[Scar]=Length*2;
    DamageScars->CreateMeshSection(Scar,P,T,Normals,UV,TArray<FColor>(),TArray<FProcMeshTangent>(),false);
    DamageScars->SetMaterial(Scar,LoadObject<UMaterialInterface>(nullptr,S.Glass?TEXT("/Game/Materials/Native_Chrome"):TEXT("/Game/Materials/Native_RunningGearRubber")));
  }
  UpdateDamageVisuals();
  UE_LOG(LogTemp,Display,TEXT("TERRA_DAMAGE_IMPACT vehicle=%d ground=%d zone=%d deltaV=%.3f severity=%.3f events=%d changed=%d totalVertices=%d maxDentCM=%.3f health=%.3f cpuMs=%.3f"),
    VehicleIndex,Ground,int(I.Zone),I.DeltaV,R.Severity,DamageEventCount,Changed,DeformedVertexCount,MaximumDentCM,1-Damage,(FPlatformTime::Seconds()-DamageStarted)*1000);
}
void ATerraVehicle::UpdateDamageVisuals(){
  if(!DamageEnabled||!DamageVisualCache.IsValid())return;
  for(int I=0;I<DamageVisualCache->Sections.Num();++I){const auto& S=DamageVisualCache->Sections[I];if(S.LampDamage<=0)continue;
    if(auto* M=Cast<UMaterialInstanceDynamic>(DamageBody->GetMaterial(I))){
      const float Base=BrakeLamps.Contains(M)?BrakeLampLevel:ReverseLamps.Contains(M)?ReverseLampLevel:-1;
      if(Base>=0)M->SetScalarParameterValue(TEXT("TerraLamp"),Base*(1-FMath::Clamp(S.LampDamage*1.7f,0.f,.95f)));
    }
  }
}
