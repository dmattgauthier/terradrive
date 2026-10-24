#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraRutValidation {
// Packaged, rendered fixtures. This does not replace the real driven-soil
// passes in the full regression suite.
bool Tick(ATerraVehicle *Vehicle,float Dt,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture);
}
