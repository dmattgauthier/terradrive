#pragma once
#include "CoreMinimal.h"

struct FTerraDriveCue {
  float RPM=0,Load=0,Rolling=0,Slip=0,Impact=0,Rumble=0;
  uint8 Surface=0;
  bool Electric=false;
};

struct FTerraDriveSynth {
  void Render(const FTerraDriveCue& Cue,int16* Output,int Count);
  static constexpr int Rate=24000;
private:
  uint32 NoiseSeed=0x37d191efu;
  float EnginePhase=0,GearPhase=0,ImpactPhase=0;
  float EngineHz=0,MotorHz=0,Level=0,TireLevel=0,SlipLevel=0,Thump=0,NoiseBed=0;
};
