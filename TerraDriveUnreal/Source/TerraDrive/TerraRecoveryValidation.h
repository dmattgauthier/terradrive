#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraRecoveryValidation {
bool Tick(ATerraVehicle*,float,TFunctionRef<void(const FString&,bool,float)>,TFunctionRef<void(const TCHAR*)>);
bool TickGrave(ATerraVehicle*,float,TFunctionRef<void(const FString&,bool,float)>,TFunctionRef<void(const TCHAR*)>);
}