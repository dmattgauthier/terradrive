#include "TerraSoilMeshComponent.h"

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
