#pragma once
#include "CoreMinimal.h"

// Separate from vehicle builds so graphics changes never rewrite the garage save.
namespace TerraGraphics {
void Initialize();
int Preset();
void Select(int Mode, bool Persist=true);
bool Save(const FString &Path);
bool Load(const FString &Path);
float FrameLimit(bool Garage, bool Background);
void Tick(bool Garage, bool Background);
const TCHAR *Name();
}
