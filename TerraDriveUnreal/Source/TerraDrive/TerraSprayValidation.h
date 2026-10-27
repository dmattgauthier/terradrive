#pragma once
#include "CoreMinimal.h"
class ATerraVehicle;
namespace TerraSprayValidation {
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture);
}
