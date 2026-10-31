#pragma once
#include "CoreMinimal.h"
#include "InputCoreTypes.h"

namespace TerraControls {
enum class Action : uint8 {
  Forward, Reverse, SteerLeft, SteerRight, HoldBrake, Garage, Recover,
  NextChallenge, Tracks, FourDrive, LowRange, FrontLock, RearLock, CenterLock,
  PressureUp, PressureDown, Crawl, DescentAssist, Rain, ResetTerrain,
  WinchAttach, WinchReel, CameraOrbit, CameraNear,
  Region1, Region2, Region3, Region4, Region5, Region6, Region7, Region8, Region9,
  Count
};
constexpr int Count = int(Action::Count);
const TCHAR* Name(Action A);
const TCHAR* Title(Action A);
const TCHAR* AlternateDescription(Action A);
FKey DefaultKey(Action A);
FString KeyLabel(FKey Key);
bool ValidAction(Action A);

struct Bindings {
  Bindings() { Reset(); }
  void Reset();
  FKey Key(Action A) const;
  bool Assign(Action A,FKey NewKey,FString& Error);
  bool Load(const FString& Path);
  bool Save(const FString& Path) const;
private:
  FKey Keys[Count];
};
}
