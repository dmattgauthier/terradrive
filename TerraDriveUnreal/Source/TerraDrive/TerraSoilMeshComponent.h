#pragma once
#include "ProceduralMeshComponent.h"
#include "TerraSoilMeshComponent.generated.h"

// Fine ground must keep a conservative visible volume during the overlap
// with its coarse replacement. The actual vertices and collision stay fixed.
UCLASS()
class TERRADRIVE_API UTerraSoilMeshComponent : public UProceduralMeshComponent {
  GENERATED_BODY()
public:
  virtual FBoxSphereBounds CalcBounds(const FTransform& LocalToWorld) const override;
};
