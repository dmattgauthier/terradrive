#include "TerraChallengeValidation.h"
#include "TerraVehicle.h"
#include "TerraPauseMenu.h"
#include "Components/StaticMeshComponent.h"
#include "Widgets/Input/SButton.h"

namespace TerraChallengeValidation {
namespace {
constexpr int FirstRoute=14;
constexpr int CourseCount=3;
constexpr uint8 Surfaces[]={0,5,6};
constexpr float TargetSpeed[]={3.3f,5.8f,3.7f};

struct FRun {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  int32 Course=0;
  float Time=0, MaximumError=0, MaxArticulation=0;
  float MinimumPitch=0,MaximumPitch=0;
  int32 SupportedFrames=0, SurfaceFrames=0, MovingFrames=0;
  bool MenuOpened=false, Started=false, Captured=false, Upright=true, Finishing=false;
} Run;

void Brake(ATerraVehicle* Vehicle){
  Vehicle->TestSteer=Vehicle->TestThrottle=0;
  Vehicle->TestBrake=1;
}
}

bool Tick(ATerraVehicle* Vehicle,float Delta,
          TFunctionRef<void(const FString&,bool,float)> Check,
          TFunctionRef<void(const TCHAR*)> Capture){
  auto* World=Vehicle->Terrain.Get();
  if(Run.Vehicle.Get()!=Vehicle){
    Run=FRun{};
    Run.Vehicle=Vehicle;
    const bool Complete=World->Routes.Num()>=FirstRoute+CourseCount;
    Check(TEXT("all three terrain challenges appear after the existing routes"),Complete,World->Routes.Num());
    if(!Complete)return true;
    Vehicle->SetGarage(true);
    Vehicle->SelectVehicle(0);
    Vehicle->ResetUpgrades(false);
    Vehicle->SetGarage(false);
    Vehicle->SetEnergyUsageEnabled(false,false);
  }

  if(Run.Finishing){
    Run.Time+=Delta;
    if(Run.Time<.5f)return false;
    const int32 Next=Run.Course+1;
    if(Next==CourseCount)return true;
    Run=FRun{};
    Run.Vehicle=Vehicle;
    Run.Course=Next;
  }

  const auto& Route=World->Routes[FirstRoute+Run.Course];
  auto Test=[&](const TCHAR* Name,bool Pass,float Value){
    Check(Route.Name+TEXT(" ")+Name,Pass,Value);
  };
  if(!Run.Started){
    const int32 Index=FirstRoute+Run.Course;
    if(!Run.MenuOpened){
      Vehicle->SetPauseMenu(true);
      if(const auto Menu=Vehicle->GetPauseMenuWidget())Menu->ShowPage(3);
      Run.MenuOpened=true;
      return false;
    }
    Run.Time+=Delta;
    if(Run.Course==0&&Run.Time<.6f){
      if(!Run.Captured&&Run.Time>=.4f){
        Capture(TEXT("terrain-challenges-menu.png"));
        Run.Captured=true;
      }
      return false;
    }
    const auto Menu=Vehicle->GetPauseMenuWidget();
    const auto Button=Menu.IsValid()?Menu->ChallengeButton(Index):nullptr;
    const bool StartEnabled=Button.IsValid()&&Button->IsEnabled()&&Menu->ActivePage()==3;
    if(StartEnabled)Button->SimulateClick();
    const bool Travelled=StartEnabled&&!Vehicle->PauseMenuOpen&&Vehicle->RouteIndex==Index&&
      Vehicle->GateIndex==0&&FVector::Dist2D(Vehicle->GetActorLocation(),Route.Spawn)<1;
    Test(TEXT("starts from the challenge menu with six gates"),Travelled&&Route.Gates.Num()==6&&
      Route.GateNotes.Num()==6,Route.Gates.Num());
    if(!Travelled){Vehicle->SetPauseMenu(false);return true;}
    if(Route.Zone==7){
      const double Floor=World->Height(Route.Spawn.X,Route.Spawn.Y);
      const double SnowRise=Floor-Route.Spawn.Z;
      const double TravelError=Vehicle->GetActorLocation().Z-(Floor+Vehicle->ExpectedRideHeight()*100+16);
      Test(TEXT("route travel starts above the live snow surface"),SnowRise>5&&FMath::Abs(TravelError)<.1,SnowRise);
      Vehicle->SetGarage(true);
      const double GarageError=Vehicle->GetActorLocation().Z-(Floor+Vehicle->ExpectedRideHeight()*100);
      Test(TEXT("garage entry uses the live snow height"),Vehicle->Garage&&FMath::Abs(GarageError)<.1,GarageError);
      const double TreadHeight=Vehicle->Wheels[0]->GetComponentLocation().Z-Vehicle->TireDiameter()*2.54/2;
      Test(TEXT("garage preview tread rests at the snow datum"),FMath::Abs(TreadHeight-Floor)<.1,TreadHeight-Floor);
      Vehicle->SetUpgrade(TerraSim::Suspension,1,false);
      const double UpgradeError=Vehicle->GetActorLocation().Z-(Floor+Vehicle->ExpectedRideHeight()*100);
      Test(TEXT("garage suspension upgrade retains the same ground height"),
        Vehicle->UpgradeStage(TerraSim::Suspension)==1&&FMath::Abs(UpgradeError)<.1,UpgradeError);
      Vehicle->ResetUpgrades(false);
      const double PreviewZ=Vehicle->GetActorLocation().Z;
      Vehicle->SetGarage(false);
      const double ResumeError=Vehicle->GetActorLocation().Z-PreviewZ;
      Test(TEXT("garage exit resumes from the grounded preview pose"),
        !Vehicle->Garage&&Vehicle->RouteIndex==Index&&FMath::Abs(ResumeError)<.1,ResumeError);
      Vehicle->TeleportRoute(Index);
    }
    Brake(Vehicle);
    Run.Started=true;
    Run.Captured=false;
    Run.Time=0;
  }
  Run.Time+=Delta;
  if(Run.Time<1.5f)return false;

  const auto Position=Vehicle->GetActorLocation();
  const float Speed=Vehicle->Speed;
  // Aim down the staked corridor, looking a few metres ahead.
  const float CrossTrack=float(Route.Spawn.Y-Position.Y);
  const float Heading=FMath::RadiansToDegrees(FMath::Atan2(CrossTrack,400.f));
  const float Error=FMath::FindDeltaAngleDegrees(Vehicle->GetActorRotation().Yaw,Heading);
  Vehicle->TestSteer=FMath::Clamp(Error/25.f,-.75f,.75f);
  Vehicle->TestThrottle=FMath::Clamp(.13f+(TargetSpeed[Run.Course]-Speed)*.24f,0.f,.90f);
  Vehicle->TestBrake=FMath::Clamp((Speed-TargetSpeed[Run.Course]-.25f)*.30f,0.f,1.f);
  Run.MaximumError=FMath::Max(Run.MaximumError,FMath::Abs(CrossTrack));
  Run.Upright&=Vehicle->GetActorUpVector().Z>.6f&&!Vehicle->Overturned;
  if(Speed>1){
    ++Run.MovingFrames;
    const float Pitch=Vehicle->GetActorRotation().Pitch;
    Run.MinimumPitch=FMath::Min(Run.MinimumPitch,Pitch);
    Run.MaximumPitch=FMath::Max(Run.MaximumPitch,Pitch);
    if(Vehicle->ContactCount>=2)++Run.SupportedFrames;
    int32 ExpectedContacts=0;
    for(int32 Wheel=0;Wheel<Vehicle->WheelCount();++Wheel){
      const auto& State=Vehicle->WheelState[Wheel];
      if(State.ContactValid&&State.Load>50&&State.Ground.Surface==Surfaces[Run.Course])++ExpectedContacts;
    }
    if(ExpectedContacts>=2)++Run.SurfaceFrames;
    const auto& W=Vehicle->WheelState;
    Run.MaxArticulation=FMath::Max(Run.MaxArticulation,float(FMath::Abs(W[0].Distance-W[1].Distance)));
  }
  if(!Run.Captured&&Position.X>Route.Spawn.X+2100){
    Capture(*FString::Printf(TEXT("terrain-challenge-%d-obstacle.png"),Run.Course));
    Run.Captured=true;
  }
  if(Vehicle->GateIndex==Route.Gates.Num()||Run.Time>65.f||!Run.Upright||FMath::Abs(CrossTrack)>900||Position.X>Route.Gates.Last().X+800){
    const float Supported=Run.SupportedFrames/float(FMath::Max(1,Run.MovingFrames));
    const float ExpectedSurface=Run.SurfaceFrames/float(FMath::Max(1,Run.MovingFrames));
    Test(TEXT("drives through all gates in order"),Vehicle->GateIndex==Route.Gates.Num(),Vehicle->GateIndex);
    Test(TEXT("shows the correct completion notice"),Vehicle->Notice==Route.Name+TEXT(" complete"),0);
    Test(TEXT("keeps an upright vehicle within the marked lane"),Run.Upright&&Run.MaximumError<350,Run.MaximumError);
    Test(TEXT("maintains real tire support through the obstacles"),Supported>.88f,Supported);
    Test(TEXT("loads the intended terrain under the tires"),ExpectedSurface>.80f,ExpectedSurface);
    if(Run.Course==1)
      Test(TEXT("climbs and descends the sand rollers"),Run.MinimumPitch<-4.f&&Run.MaximumPitch>4.f,
        Run.MaximumPitch-Run.MinimumPitch);
    else
      Test(TEXT("articulates the front axle over the terrain"),Run.MaxArticulation>.07f,Run.MaxArticulation);
    Brake(Vehicle);
    Capture(*FString::Printf(TEXT("terrain-challenge-%d-finish.png"),Run.Course));
    Run.Finishing=true;
    Run.Time=0;
  }
  return false;
}
}
