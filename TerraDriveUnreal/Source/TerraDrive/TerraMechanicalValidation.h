#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraMechanicalValidation {
bool Tick(ATerraVehicle* Vehicle,float Dt,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture);
}
