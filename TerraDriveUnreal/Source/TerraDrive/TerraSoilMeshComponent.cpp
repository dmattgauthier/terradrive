#include "TerraSoilMeshComponent.h"
#include "PhysicsEngine/BodySetup.h"
#include "Chaos/TriangleMeshImplicitObject.h"
#include "Interfaces/Interface_CollisionDataProvider.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "ProfilingDebugging/CpuProfilerTrace.h"

bool UTerraSoilMeshComponent::LegacyDense() const {
  return FParse::Param(FCommandLine::Get(),TEXT("TerraValidate"))&&
    FParse::Param(FCommandLine::Get(),TEXT("TerraLegacyDenseSoilCollision"));
}
bool UTerraSoilMeshComponent::GetPhysicsTriMeshData(FTriMeshCollisionData* Data,bool All){
  if(!Super::GetPhysicsTriMeshData(Data,All))return false;
  if(LegacyDense())return true;
  // Only complete fine tiles: coarse terrain holes and partially constructed
  // multi-material sections retain the stock provider until construction ends.
  constexpr int Width=65,Vertices=Width*Width,FullTriangles=64*64*2;
  if(Data->Indices.Num()!=FullTriangles)return true;
  FineSection=-1;UMaterialInterface* Material=nullptr;int Offset=0,FirstOffset=0;
  for(int S=0;S<GetNumSections();++S)if(const auto* Section=GetProcMeshSection(S);Section&&Section->bEnableCollision){
    if(Section->ProcVertexBuffer.Num()!=Vertices)return true;
    if(FineSection<0){FineSection=S;FirstOffset=Offset;Material=GetMaterial(S);}
    else if(GetMaterial(S)!=Material)return true;
    Offset+=Section->ProcVertexBuffer.Num();
  }
  if(FineSection<0)return true;
  const auto* Section=GetProcMeshSection(FineSection);
  auto H=[&](int X,int Y){return double(Section->ProcVertexBuffer[Y*Width+X].Position.Z);};
  if(CollisionCells.empty())CollisionCells=TerraSim::BuildSoilCollisionCells(64,H,TerraSim::SoilCollisionBuildErrorCM);
  else TerraSim::RefineSoilCollisionCells(CollisionCells,H,TerraSim::SoilCollisionBuildErrorCM);
  const auto Triangles=TerraSim::SoilCollisionTriangles(CollisionCells,Width);
  const uint16 PhysicalMaterial=Data->MaterialIndices.IsEmpty()?0:Data->MaterialIndices[0];
  Data->Indices.Reset(Triangles.size());Data->MaterialIndices.Reset(Triangles.size());
  for(const auto& T:Triangles){FTriIndices I;I.v0=T[0]+FirstOffset;I.v1=T[1]+FirstOffset;I.v2=T[2]+FirstOffset;Data->Indices.Add(I);Data->MaterialIndices.Add(PhysicalMaterial);}
  // Preserve stock vertex ordering/count: UpdateTriMeshVertices can then
  // refit this smaller topology in place without a new shape or BVH cook.
  UploadedHeights.SetNum(Vertices);for(int I=0;I<Vertices;++I)UploadedHeights[I]=Section->ProcVertexBuffer[I].Position.Z;
  UploadedTopologyErrorCM=TerraSim::SoilCollisionErrorBound(CollisionCells,[&](int X,int Y){return double(UploadedHeights[Y*Width+X]);});
  AdaptiveDataReady=true;
  return true;
}
void UTerraSoilMeshComponent::UpdateSoilSurface(int32 S,const TArray<FVector>& V,const TArray<FVector>& N,
    const TArray<FVector2D>& UV,const TArray<FLinearColor>& C){
  if(LegacyDense()){UpdateMeshSection_LinearColor(S,V,N,UV,C,{},false);return;}
  auto* Section=GetProcMeshSection(S);if(!Section)return;
  // Change the display buffers without refitting every collision section.
  // The live body stays enabled; commit once after every section is updated.
  TGuardValue<bool> DisplayOnly(Section->bEnableCollision,false);
  UpdateMeshSection_LinearColor(S,V,N,UV,C,{},false);
}
void UTerraSoilMeshComponent::CommitSoilCollision(){
  TRACE_CPUPROFILER_EVENT_SCOPE(TerraCommitSoilCollision);
  if(LegacyDense())return;
  if(FineSection<0)for(int S=0;S<GetNumSections();++S)if(auto* P=GetProcMeshSection(S);P&&P->bEnableCollision&&P->ProcVertexBuffer.Num()==65*65){FineSection=S;break;}
  auto* Section=GetProcMeshSection(FineSection);if(!Section||Section->ProcVertexBuffer.Num()!=65*65)return;
  auto H=[&](int X,int Y){return double(Section->ProcVertexBuffer[Y*65+X].Position.Z);};
  if(AdaptiveDataReady&&UploadedHeights.Num()==65*65){
    const double Error=TerraSim::SoilCollisionUploadedErrorBound(64,UploadedTopologyErrorCM,
        [&](int X,int Y){return double(UploadedHeights[Y*65+X]);},H);
    if(Error<=TerraSim::SoilCollisionErrorCM)return;
  }
  const bool Refined=CollisionCells.empty()||TerraSim::RefineSoilCollisionCells(CollisionCells,H,TerraSim::SoilCollisionBuildErrorCM);
  if(Refined||!AdaptiveDataReady){
    // Refinement is synchronous: no old coarse collision is allowed to lag
    // outside the stated height bound while an asynchronous cook is pending.
    TGuardValue<bool> Immediate(bUseAsyncCooking,false);
    const FProcMeshSection Copy=*Section;SetProcMeshSection(FineSection,Copy);
    return;
  }
  if(!BodyInstance.IsValidBodyInstance())return; // Initial cook still installing.
  TArray<FVector> Positions;
  for(int S=0;S<GetNumSections();++S)if(const auto* P=GetProcMeshSection(S);P&&P->bEnableCollision)
    for(const auto& V:P->ProcVertexBuffer)Positions.Add(V.Position);
  BodyInstance.UpdateTriMeshVertices(Positions);
  UploadedHeights.SetNum(65*65);for(int I=0;I<UploadedHeights.Num();++I)UploadedHeights[I]=Section->ProcVertexBuffer[I].Position.Z;
  UploadedTopologyErrorCM=TerraSim::SoilCollisionErrorBound(CollisionCells,[&](int X,int Y){return double(UploadedHeights[Y*65+X]);});
}
int32 UTerraSoilMeshComponent::LiveCollisionTriangles() const {
  int32 Count=0;if(ProcMeshBodySetup&&BodyInstance.IsValidBodyInstance())for(const auto& M:ProcMeshBodySetup->TriMeshGeometries)if(M)Count+=M->Elements().GetNumTriangles();return Count;
}
double UTerraSoilMeshComponent::CollisionHeightErrorCM() const {
  if(LegacyDense()||CollisionCells.empty())return 0;
  const auto* Section=const_cast<UTerraSoilMeshComponent*>(this)->GetProcMeshSection(FineSection);
  if(!Section||Section->ProcVertexBuffer.Num()!=65*65)return 0;
  if(UploadedHeights.Num()!=65*65)return TNumericLimits<double>::Max();
  return TerraSim::SoilCollisionUploadedErrorBound(64,UploadedTopologyErrorCM,
      [&](int X,int Y){return double(UploadedHeights[Y*65+X]);},
      [&](int X,int Y){return double(Section->ProcVertexBuffer[Y*65+X].Position.Z);});
}

FBoxSphereBounds UTerraSoilMeshComponent::CalcBounds(const FTransform& LocalToWorld) const {
  FBoxSphereBounds Result=Super::CalcBounds(LocalToWorld);
  // A nearly planar box can be hidden by the preceding coarse ground's
  // occlusion result after that ground is removed. A metre of air above and
  // below each 4 m tile avoids that false rejection without disabling global
  // occlusion or widening its horizontal culling footprint.
  Result.BoxExtent.Z+=100.f;
  Result.SphereRadius=Result.BoxExtent.Size();
  return Result;
}
