#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraQuarryPerformanceValidation {
bool Tick(ATerraVehicle* Vehicle,float DeltaSeconds,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture);
}
