#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraGardenValidation {bool Tick(ATerraVehicle*,float,TFunctionRef<void(const FString&,bool,float)>,TFunctionRef<void(const TCHAR*)>);}
