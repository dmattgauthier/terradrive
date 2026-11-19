#include "TerraDriveFeedback.h"
#include "TerraVehicle.h"
#include "Components/AudioComponent.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "TerraDriveSoundWave.h"
#include "TerraPlayerController.h"
#include "Misc/ScopeLock.h"

namespace {
constexpr float RoadTexture[]={.74f,.25f,.59f,.65f,1.f,.61f,.49f};
constexpr float RoadTone[]={.12f,.29f,.038f,.068f,.23f,.092f,.075f};

void AdvancePhase(float& Phase,float Frequency){
  Phase+=Frequency*(2*UE_PI/FTerraDriveSynth::Rate);
  if(Phase>=2*UE_PI)Phase-=2*UE_PI;
}
}

void FTerraDriveSynth::Render(const FTerraDriveCue& Cue,int16* Output,int Count){
  // Cycle frequency for a four-stroke engine. Four firing pairs produce the
  // V8 exhaust order; the lower harmonics carry the uneven bank pulses.
  const float CycleHz=FMath::Clamp(Cue.RPM/120.f,0.f,160.f);
  const float TargetMotor=48+FMath::Clamp(Cue.RPM*.048f,0.f,900.f);
  const float TargetLevel=Cue.Electric
    ?.19f*FMath::Clamp(Cue.Load*.65f+Cue.RPM/12000.f,0.f,1.f)
    :Cue.RPM>0?.075f+.20f*Cue.Load:0;
  const float SlipTarget=Cue.Slip*(Cue.Surface==1?.15f:.10f);
  const float RollingTarget=Cue.Rolling*RoadTexture[Cue.Surface]*.125f;
  const float NoiseRate=RoadTone[Cue.Surface];
  Thump=FMath::Max(Thump,Cue.Impact*.36f);
  for(int I=0;I<Count;++I){
    EngineHz+=(CycleHz-EngineHz)*.0017f;
    MotorHz+=(TargetMotor-MotorHz)*.0018f;
    Level+=(TargetLevel-Level)*.0024f;
    TireLevel+=(RollingTarget-TireLevel)*.0034f;
    SlipLevel+=(SlipTarget-SlipLevel)*.0034f;
    AdvancePhase(EnginePhase,EngineHz);
    AdvancePhase(GearPhase,MotorHz);
    AdvancePhase(ImpactPhase,62+35*Thump);
    NoiseSeed=1664525u*NoiseSeed+1013904223u;
    const float Noise=float(NoiseSeed>>16)*(1.f/32768)-1.f;
    NoiseBed+=(Noise-NoiseBed)*NoiseRate;
    const float Propulsion=Cue.Electric
      ?.68f*FMath::Sin(GearPhase)+.21f*FMath::Sin(2*GearPhase)+.11f*FMath::Sin(3*GearPhase)
      :.36f*FMath::Sin(8*EnginePhase)+.24f*FMath::Sin(4*EnginePhase)+.20f*FMath::Sin(2*EnginePhase)+
       .17f*FMath::Sin(12*EnginePhase)+.14f*Cue.Load*FMath::Sin(16*EnginePhase);
    const float Tread=TireLevel*(.88f*NoiseBed+.12f*Noise);
    const float Breakaway=SlipLevel*(Cue.Surface==1?.54f*FMath::Sin(GearPhase*4)+.46f*Noise:NoiseBed+.38f*Noise);
    const float Contact=Thump*(.72f*FMath::Sin(ImpactPhase)+.28f*Noise);
    Thump*=.9985f;
    Output[I]=int16(FMath::Clamp(Level*Propulsion+Tread+Breakaway+Contact,-1.f,1.f)*32760);
  }
}

void UTerraDriveSoundWave::SetDriveCue(const FTerraDriveCue& NewCue){
  FScopeLock Lock(&CueLock);
  const float UnplayedImpact=Cue.Impact;
  Cue=NewCue;
  Cue.Impact=FMath::Max(Cue.Impact,UnplayedImpact);
}

int32 UTerraDriveSoundWave::OnGeneratePCMAudio(TArray<uint8>& OutAudio,int32 NumSamples){
  FTerraDriveCue Snapshot;
  {
    FScopeLock Lock(&CueLock);
    Snapshot=Cue;
    Cue.Impact=0;
  }
  // The mixer requests a full block even when the game thread misses a frame.
  OutAudio.SetNumUninitialized(NumSamples*sizeof(int16),EAllowShrinking::No);
  Synth.Render(Snapshot,reinterpret_cast<int16*>(OutAudio.GetData()),NumSamples);
  RenderedSamples+=NumSamples;
  return NumSamples;
}

void ATerraVehicle::UpdateDriveFeedback(float Dt){
  if(!DriveAudio&&(!GEngine||!GEngine->UseSound())&&AutoTest)return;
  const bool Electric=IsElectric();
  float SurfaceLoads[UE_ARRAY_COUNT(RoadTexture)]={};
  float SlipWork=0,TotalLoad=0,PeakCompression=0,MaximumSpeed=0;
  for(int I=0;I<WheelCount();++I){
    const auto& W=WheelState[I];
    if(!W.ContactValid||W.Load<=0||W.Ground.Surface>=UE_ARRAY_COUNT(RoadTexture))continue;
    const float ContactSpeed=FMath::Abs(W.LongSpeed);
    const float Sliding=FMath::Abs(W.Slip)*FMath::Max(2.f,ContactSpeed)+.42f*FMath::Abs(W.LateralSpeed);
    SurfaceLoads[W.Ground.Surface]+=W.Load;
    TotalLoad+=W.Load;
    SlipWork+=W.Load*FMath::Clamp(Sliding/5.f,0.f,1.f);
    MaximumSpeed=FMath::Max(MaximumSpeed,ContactSpeed);
    PeakCompression=FMath::Max(PeakCompression,W.Load);
  }
  uint8 Surface=DriveCue.Surface;
  for(uint8 I=0;I<UE_ARRAY_COUNT(RoadTexture);++I)
    if(SurfaceLoads[I]>SurfaceLoads[Surface])Surface=I;
  const float Rolling=FMath::Clamp(FMath::Sqrt(MaximumSpeed/22.f),0.f,1.f);
  const float Slip=TotalLoad>0?SlipWork/TotalLoad:0.f;
  const float Compression=FMath::Clamp((PeakCompression-LastFeedbackLoad)/FMath::Max(1.f,Mass*19.62f),0.f,1.f);
  LastFeedbackLoad=PeakCompression;
  const float Impact=FMath::Max(PendingFeedbackImpact,Compression*(SpawnCooldown<=0?.30f:0.f));
  const float Load=HasPropulsionEnergy()?FMath::Clamp(Throttle*.72f+Throttle*TotalLoad/FMath::Max(1.f,Mass*9.81f)*.28f,0.f,1.f):0.f;
  DriveCue={HasPropulsionEnergy()?RPM:0.f,Load,Rolling,Slip,Impact,
    FMath::Clamp(Rolling*RoadTexture[Surface]*.17f+Slip*.31f+Impact*.8f,0.f,1.f),Surface,Electric};

  if(!DriveAudio&&GEngine&&GEngine->UseSound()&&GetWorld()->GetAudioDeviceRaw()){
    DriveAudio=NewObject<UAudioComponent>(this);
    DriveAudio->bAutoActivate=false;
    DriveAudio->bAllowSpatialization=false;
    DriveAudio->SetVolumeMultiplier(.64f);
    DriveAudio->RegisterComponent();
  }
  if(DriveAudio){
    if(!DriveWave){
      DriveWave=NewObject<UTerraDriveSoundWave>(this);
      DriveWave->SetSampleRate(FTerraDriveSynth::Rate);
      DriveWave->NumChannels=1;
      DriveWave->Duration=INDEFINITELY_LOOPING_DURATION;
      DriveAudio->SetSound(DriveWave);
    }
    DriveWave->SetDriveCue(DriveCue);
    if(!DriveAudio->IsPlaying())DriveAudio->Play();
  }
  PendingFeedbackImpact*=FMath::Exp(-Dt*22.f);

  FeedbackInterval-=Dt;
  if(FeedbackInterval>0||DriveCue.Rumble<.028f)return;
  if(auto* PC=Cast<ATerraPlayerController>(GetController());PC&&PC->UsesGamepad()){
    DriveRumbleHandle=PC->PlayDynamicForceFeedback(DriveCue.Rumble,.10f,true,false,false,true);
    FeedbackInterval=.10f;
  }
}

bool ATerraVehicle::DriveFeedbackPlaying()const{
  return DriveAudio&&DriveAudio->IsPlaying();
}

int64 ATerraVehicle::DriveFeedbackRenderedSamples()const{
  return DriveWave?DriveWave->GetRenderedSamples():0;
}

void ATerraVehicle::StopDriveFeedback(){
  if(DriveAudio&&DriveWave){
    DriveAudio->Stop();
    // The mixer may still finish an old request after Stop. Resume with a
    // fresh wave whose synthesis state belongs to its own playback.
    DriveAudio->SetSound(nullptr);
    DriveWave=nullptr;
  }
  if(auto* PC=Cast<APlayerController>(GetController());PC&&DriveRumbleHandle)
    PC->PlayDynamicForceFeedback(0,0,false,false,false,false,EDynamicForceFeedbackAction::Stop,DriveRumbleHandle);
  DriveRumbleHandle=0;
  DriveCue={};
  PendingFeedbackImpact=LastFeedbackLoad=FeedbackInterval=0;
}
