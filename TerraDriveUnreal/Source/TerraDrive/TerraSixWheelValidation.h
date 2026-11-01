#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraSixWheelValidation {
bool Tick(ATerraVehicle*,float,TFunctionRef<void(const FString&,bool,float)>,TFunctionRef<void(const TCHAR*)>);
}
