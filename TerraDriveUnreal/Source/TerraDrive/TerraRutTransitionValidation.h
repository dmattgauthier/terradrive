#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraRutTransitionValidation {
bool Tick(ATerraVehicle*,float,TFunctionRef<void(const FString&,bool,float)>,TFunctionRef<void(const TCHAR*)>);
}
