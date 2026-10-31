#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraFieldValidation {
bool Tick(ATerraVehicle*,float,TFunctionRef<void(const FString&,bool,float)>,TFunctionRef<void(const TCHAR*)>);
}
