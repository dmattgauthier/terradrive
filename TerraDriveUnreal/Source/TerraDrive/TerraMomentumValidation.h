#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;

// Native-only regression probes. The caller owns the normal validation
// report/exit path; this helper only drives the real pawn and Chaos world.
namespace TerraMomentumValidation {
bool Tick(ATerraVehicle *Vehicle,float Dt,
    TFunctionRef<void(const FString&,bool,float)> Check);
}
