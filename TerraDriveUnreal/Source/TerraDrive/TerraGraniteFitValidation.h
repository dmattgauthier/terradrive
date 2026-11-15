#pragma once

#include "CoreMinimal.h"

class ATerraVehicle;

namespace TerraGraniteFitValidation {
bool Tick(ATerraVehicle* Vehicle,float Delta,
          TFunctionRef<void(const FString&,bool,float)> Check,
          TFunctionRef<void(const TCHAR*)> Capture);
}
