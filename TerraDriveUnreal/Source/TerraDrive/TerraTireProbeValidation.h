#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
// Native acceptance uses measured exported tire vertices, independently of
// the gameplay carcass approximation or its contact candidate selection.
namespace TerraTireProbeValidation {
  struct FMeshEnvelope { double RadiusCM=0,HalfWidthCM=0; };
  bool Load();
  bool Matches(const ATerraVehicle* Vehicle);
  FMeshEnvelope MeshEnvelope(const ATerraVehicle* Vehicle);
  TArray<FVector> ActorLocalPoints(const ATerraVehicle* Vehicle);
  float MinimumClearance(const ATerraVehicle* Vehicle);
}
