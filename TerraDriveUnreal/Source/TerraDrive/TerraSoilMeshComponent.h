#pragma once
#include "ProceduralMeshComponent.h"
#include "TerraSoilCollision.h"
#include "TerraSoilMeshComponent.generated.h"

// Fine ground must keep a conservative visible volume during the overlap
// with its coarse replacement. Render/tire samples retain the fine grid;
// the independent collision triangulation has a conservative vertical bound.
UCLASS()
class TERRADRIVE_API UTerraSoilMeshComponent : public UProceduralMeshComponent {
  GENERATED_BODY()
public:
  virtual FBoxSphereBounds CalcBounds(const FTransform& LocalToWorld) const override;
  virtual bool GetPhysicsTriMeshData(FTriMeshCollisionData* Data,bool All) override;
  void UpdateSoilSurface(int32 Section,const TArray<FVector>& Vertices,const TArray<FVector>& Normals,
    const TArray<FVector2D>& UV,const TArray<FLinearColor>& Colors);
  void CommitSoilCollision();
  int32 LiveCollisionTriangles() const;
  int32 LiveCollisionVertices() const;
  double CollisionHeightErrorCM() const;
private:
  std::vector<TerraSim::SoilCollisionCell> CollisionCells;
  TArray<float> UploadedHeights;
  TArray<int32> CollisionVertexToFine;
  double UploadedTopologyErrorCM=0;
  int32 FineSection=-1;
  bool AdaptiveDataReady=false;
  bool LegacyDense() const;
  bool LegacyLayout() const;
};
