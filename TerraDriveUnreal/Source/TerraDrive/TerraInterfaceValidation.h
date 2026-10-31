#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraInterfaceValidation {
bool Tick(ATerraVehicle* Vehicle,float RealDelta,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture);
}
