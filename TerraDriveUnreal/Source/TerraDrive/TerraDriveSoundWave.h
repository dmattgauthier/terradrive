#pragma once
#include "HAL/CriticalSection.h"
#include "Sound/SoundWaveProcedural.h"
#include "TerraDriveFeedback.h"
#include "TerraDriveSoundWave.generated.h"

UCLASS(Transient)
class UTerraDriveSoundWave : public USoundWaveProcedural {
  GENERATED_BODY()
public:
  void SetDriveCue(const FTerraDriveCue& NewCue);
  int64 GetRenderedSamples() const { return RenderedSamples.Load(EMemoryOrder::Relaxed); }

protected:
  int32 OnGeneratePCMAudio(TArray<uint8>& OutAudio,int32 NumSamples) override;

private:
  FCriticalSection CueLock;
  FTerraDriveCue Cue;
  FTerraDriveSynth Synth;
  TAtomic<int64> RenderedSamples{0};
};
