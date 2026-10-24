#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraRutDriveValidation {
// Real motor-driven trials, appended to the synthetic swept-footprint suite.
bool Tick(ATerraVehicle *Vehicle,float Dt,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture);
}
