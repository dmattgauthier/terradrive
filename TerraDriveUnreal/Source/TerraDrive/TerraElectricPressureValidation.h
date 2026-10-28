#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;

namespace TerraElectricPressureValidation {
// Called by the existing validation report/exit path. It drives the real pawn
// and world; it never opens an editor, cooks assets or writes a user save.
bool Tick(ATerraVehicle* Vehicle,float Dt,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture);
}
