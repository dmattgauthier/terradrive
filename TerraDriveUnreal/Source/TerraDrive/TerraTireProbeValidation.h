#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
// Native acceptance uses measured exported tire vertices, independently of
// the gameplay carcass approximation or its contact candidate selection.
namespace TerraTireProbeValidation {
  bool Load();
  bool Matches(const ATerraVehicle* Vehicle);
  TArray<FVector> ActorLocalPoints(const ATerraVehicle* Vehicle);
  float MinimumClearance(const ATerraVehicle* Vehicle);
}
