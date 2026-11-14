#include "TerraRockCrawlValidation.h"
#include "TerraPauseMenu.h"
#include "TerraVehicle.h"
#include "Widgets/Input/SButton.h"

namespace TerraRockCrawlValidation {
namespace {
constexpr int RouteIndex=17;
constexpr float CrawlDemand=.28f;

enum class EPhase { Menu, Settle, Drive, Hold };

struct FTrial {
  int32 Gates=0, RockFrames=0, CrossAxleFrames=0, LockedFrames=0, MovingFrames=0;
  float Progress=0, Pitch=0, MaxLaneError=0, PeakWheelDriveNm=0, FinishTime=0;
  bool Upright=true, Captured=false;
};
struct FRun {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  FTrial Trials[3];
  EPhase Phase=EPhase::Menu;
  int32 Index=0;
  float Time=0;
  FVector Forward,Side;
  bool Complete=false;

  void Advance(EPhase Next){Phase=Next;Time=0;}
} Run;

const TCHAR* Trials[]={TEXT("4H open"),TEXT("4L open"),TEXT("4L locked")};
const TCHAR* TrialPictures[]={TEXT("rock-crawl-high-open.png"),TEXT("rock-crawl-low-open.png"),TEXT("rock-crawl-low-locked.png")};

void Brake(ATerraVehicle* V){
  V->TestDriverInput=false;
  V->TestThrottle=V->TestSteer=0;
  V->TestBrake=1;
}
}

bool Tick(ATerraVehicle* V,float Delta,
          TFunctionRef<void(const FString&,bool,float)> Check,
          TFunctionRef<void(const TCHAR*)> Capture){
  auto* Terrain=V->Terrain.Get();
  if(Run.Vehicle.Get()!=V){
    Run=FRun{};
    Run.Vehicle=V;
    const bool Valid=Terrain->Routes.IsValidIndex(RouteIndex);
    Check(TEXT("new hard rock crawl has a native route"),Valid,Terrain->Routes.Num());
    if(!Valid)return true;
    const auto& R=Terrain->Routes[RouteIndex];
    Run.Forward=FRotator(0,R.Yaw,0).Vector();
    Run.Side=FVector::CrossProduct(FVector::UpVector,Run.Forward);
    V->SetGarage(true);V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarage(false);
    V->SetEnergyUsageEnabled(false,false);Terrain->SetRain(false);
    Brake(V);
    V->SetPauseMenu(true);
    if(const auto Menu=V->GetPauseMenuWidget())Menu->ShowPage(3);
  }

  const auto& R=Terrain->Routes[RouteIndex];
  auto& Trial=Run.Trials[Run.Index];
  const bool Low=Run.Index>0, Locked=Run.Index==2;
  Run.Time+=Delta;

  switch(Run.Phase){
    case EPhase::Menu:{
      if(!Trial.Captured&&Run.Time>.35f){Capture(TEXT("rock-crawl-menu.png"));Trial.Captured=true;}
      if(Run.Time<.65f)return false;
      const auto Menu=V->GetPauseMenuWidget();
      const auto Button=Menu.IsValid()?Menu->ChallengeButton(RouteIndex):nullptr;
      const bool Enabled=Button.IsValid()&&Button->IsEnabled()&&Menu->ActivePage()==3;
      if(Enabled)Button->SimulateClick();
      const bool Started=Enabled&&!V->PauseMenuOpen&&V->RouteIndex==RouteIndex&&V->GateIndex==0&&
        FVector::Dist2D(V->GetActorLocation(),R.Spawn)<1;
      Check(TEXT("opens the rock crawl through the pause menu with marked gates"),
        Started&&R.Gates.Num()>=5&&R.Gates.Num()==R.GateNotes.Num(),R.Gates.Num());
      if(!Started){V->SetPauseMenu(false);return true;}
      Trial.Captured=false;
      Run.Advance(EPhase::Settle);
      return false;
    }
    case EPhase::Settle:{
      if(Run.Time<1.5f)return false;
      V->LowRange=Low;
      V->FourDrive=true;
      V->FrontLocked=V->RearLocked=false;
      if(Locked){V->ToggleLocker(false);V->ToggleLocker(true);}
      const bool Setup=V->DrivenWheel(0)&&V->DrivenWheel(2)&&V->Direction==1&&V->ContactCount>=2&&
        FMath::Abs(V->Speed)<.5f&&V->FrontLocked==Locked&&V->RearLocked==Locked&&
        (Low?V->EffectiveLowRatio()>1.5f:V->EffectiveLowRatio()==1);
      Check(FString(Trials[Run.Index])+TEXT(" starts settled in the requested configuration"),Setup,V->EffectiveLowRatio());
      Run.Advance(EPhase::Drive);
      return false;
    }
    case EPhase::Hold:{
      if(Run.Time<.6f)return false;
      if(Locked)break;
      ++Run.Index;
      Terrain->ResetSoil();
      V->TeleportRoute(RouteIndex);
      Brake(V);
      Run.Advance(EPhase::Settle);
      return false;
    }
    case EPhase::Drive:{
      const FVector Position=V->GetActorLocation(), Offset=Position-R.Spawn;
      const float Progress=FVector::DotProduct(Offset,Run.Forward);
      const float Lane=FVector::DotProduct(Offset,Run.Side);
      const float Aim=R.Yaw-FMath::RadiansToDegrees(FMath::Atan2(Lane,450.f));
      const float Error=FMath::FindDeltaAngleDegrees(V->GetActorRotation().Yaw,Aim);
      Trial.Progress=FMath::Max(Trial.Progress,Progress);
      Trial.Pitch=FMath::Max(Trial.Pitch,float(V->GetActorRotation().Pitch));
      Trial.MaxLaneError=FMath::Max(Trial.MaxLaneError,FMath::Abs(Lane));
      Trial.Gates=V->GateIndex;
      Trial.Upright&=!V->Overturned&&V->GetActorUpVector().Z>.63f;
      const auto* W=V->WheelState;
      int RockSupports=0;
      float DriveNm=0;
      for(int I=0;I<4;++I){
        if(W[I].ContactValid&&W[I].Load>50&&W[I].Ground.Surface==4)++RockSupports;
        DriveNm+=FMath::Abs(V->LastWheelDriveNm[I]);
      }
      if(RockSupports>=2&&V->TestThrottle>.23f&&FMath::Abs(V->Speed)<1.2f)
        Trial.PeakWheelDriveNm=FMath::Max(Trial.PeakWheelDriveNm,DriveNm);
      if(RockSupports>=2)++Trial.RockFrames;
      if(Progress>350){
        const float Front=FMath::Min(W[0].Load,W[1].Load)/FMath::Max(1.f,W[0].Load+W[1].Load);
        const float Rear=FMath::Min(W[2].Load,W[3].Load)/FMath::Max(1.f,W[2].Load+W[3].Load);
        if(RockSupports>=2&&Front<.10f&&Rear<.10f)++Trial.CrossAxleFrames;
        if(FMath::Abs(V->Speed)>.25f){
          ++Trial.MovingFrames;
          if(FMath::IsNearlyEqual(W[0].Omega,W[1].Omega,.01f)&&FMath::IsNearlyEqual(W[2].Omega,W[3].Omega,.01f))
            ++Trial.LockedFrames;
        }
      }

      if(int(Run.Time/3.f)!=int((Run.Time-Delta)/3.f))
        UE_LOG(LogTemp,Display,TEXT("TERRA_ROCK_CRAWL_PROGRESS mode=%s t=%.1f gates=%d alongCM=%.1f laneCM=%.1f speed=%.3f pitch=%.2f driveNm=%.1f loads=%.1f/%.1f/%.1f/%.1f"),
          Trials[Run.Index],Run.Time,Trial.Gates,Progress,Lane,V->Speed,V->GetActorRotation().Pitch,
          DriveNm,W[0].Load,W[1].Load,W[2].Load,W[3].Load);

      // All three runs use the same steering, crawl throttle ceiling and
      // speed controller. A player can use a different line or more throttle.
      V->TestSteer=FMath::Clamp(Error/25.f,-.60f,.60f);
      V->TestThrottle=FMath::Clamp(.18f+(1.20f-V->Speed)*.64f,0.f,CrawlDemand);
      V->TestBrake=FMath::Clamp((V->Speed-1.45f)*.34f,0.f,1.f);
      if(!Trial.Captured&&Locked&&RockSupports>=2&&V->GetActorRotation().Pitch>15&&Progress>600){
        Capture(TrialPictures[Run.Index]);Trial.Captured=true;
      }
      if(Trial.Gates==R.Gates.Num()||Run.Time>58.f||!Trial.Upright||FMath::Abs(Lane)>430||Progress<-400){
        const FString Label=Trials[Run.Index];
        Trial.FinishTime=Run.Time;
        UE_LOG(LogTemp,Display,TEXT("TERRA_ROCK_CRAWL mode=%s gates=%d progressCM=%.2f pitch=%.2f laneErrorCM=%.2f slowTorqueNm=%.2f rockFrames=%d crossAxleFrames=%d lockFrames=%d movingFrames=%d seconds=%.3f terrainHits=%d objectHits=%d"),
            *Label,Trial.Gates,Trial.Progress,Trial.Pitch,Trial.MaxLaneError,Trial.PeakWheelDriveNm,
            Trial.RockFrames,Trial.CrossAxleFrames,Trial.LockedFrames,Trial.MovingFrames,Run.Time,V->TerrainBodyHits,V->ObjectBodyHits);
        Check(Label+TEXT(" encounters real rock under loaded tires"),Trial.RockFrames>=6,Trial.RockFrames);
        Check(Label+TEXT(" stays in the lane and upright"),Trial.Upright&&Trial.MaxLaneError<R.GateWidth*50,Trial.MaxLaneError);
        if(!Trial.Captured){Capture(TrialPictures[Run.Index]);Trial.Captured=true;}
        if(Locked){
          Run.Complete=Trial.Gates==R.Gates.Num()&&V->Notice==R.Name+TEXT(" complete");
        }
        Brake(V);
        Run.Advance(EPhase::Hold);
      }
      return false;
    }
  }

  const auto& High=Run.Trials[0];
  const auto& LowOpen=Run.Trials[1];
  Check(TEXT("low range increases applied wheel torque at crawl speed"),
        High.PeakWheelDriveNm>100&&LowOpen.PeakWheelDriveNm>High.PeakWheelDriveNm*1.25f,
        LowOpen.PeakWheelDriveNm-High.PeakWheelDriveNm);
  Check(TEXT("low range improves open-axle progress at matched crawl demand"),
        LowOpen.Progress>High.Progress+100||LowOpen.Gates>High.Gates,LowOpen.Progress-High.Progress);
  Check(TEXT("locked trial climbs a steep rock grade"),
        Trial.Pitch>19.f,Trial.Pitch);
  Check(TEXT("staggered shelves unload one wheel on each axle"),
        Trial.CrossAxleFrames>=3||LowOpen.CrossAxleFrames>=3,FMath::Max(Trial.CrossAxleFrames,LowOpen.CrossAxleFrames));
  const float LockedFraction=Trial.LockedFrames/float(FMath::Max(1,Trial.MovingFrames));
  Check(TEXT("both locks couple their wheel speeds while driving"),
        LockedFraction>.98f,LockedFraction);
  const float LockTimeSaved=LowOpen.FinishTime-Trial.FinishTime;
  Check(TEXT("locking both axles improves the matched low-range climb"),
        Trial.Gates>LowOpen.Gates||(Trial.Gates==R.Gates.Num()&&LowOpen.Gates==R.Gates.Num()&&LockTimeSaved>3),
        LockTimeSaved);
  Check(TEXT("stock Wrangler in low range with both axle locks completes the crawl"),
        Run.Complete,Trial.Gates);
  Capture(TEXT("rock-crawl-finish.png"));
  Run.Advance(EPhase::Menu);
  return true;
}
}
