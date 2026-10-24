#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraWinterValidation {
// Called only for -TerraWinterOnly, from the native validation game mode.
// Results live across OpenLevel so entry and return exercise real travel.
bool Tick(ATerraVehicle *Vehicle,float DeltaSeconds,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture);
}
