#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;

namespace TerraCourseValidation {
bool Tick(ATerraVehicle* Vehicle,TFunctionRef<void(const FString&,bool,float)> Check,
  TFunctionRef<void(const TCHAR*)> Capture);
}
