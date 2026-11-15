#pragma once

#include "CoreMinimal.h"

class ATerraVehicle;

class FTerraRolloverBodyProbes {
public:
  bool Load(const FString& Path);
  const TArray<FVector>* Find(const ATerraVehicle* Vehicle) const;
  static float DropHeight(const ATerraVehicle* Vehicle,const TArray<FVector>& Points,const FVector& Center,const FQuat& Rotation);
  static float MinimumClearance(const ATerraVehicle* Vehicle,const TArray<FVector>& Points);

private:
  TMap<FName,TArray<FVector>> MeshPoints;
};
