#pragma once
#include "CoreMinimal.h"
#include "TerraWorld.h"

class ATerraVehicle;
class UPrimitiveComponent;
class UWorld;

// Adapter for the complete authored winter level.  It queries the scene's
// own collision instead of projecting the proving ground's height field.
namespace TerraWinter {
bool IsActive(const UWorld *World);
bool Initialize(ATerraWorld &Terrain);
float Height(UWorld *World,float X,float Y);
FTerraSample Sample(UWorld *World,FVector Point);
FTerraSupport Support(UWorld *World,FVector Mount,FVector Up,float RadiusCM,
    float MinCM,float MaxCM,const AActor *Ignore);
bool OutsideBounds(const UWorld *World,FVector Point);
float SpawnYaw(const UWorld *World,int Zone);
void Travel(ATerraVehicle *Vehicle);
void RestoreTravel(ATerraVehicle *Vehicle);
}
