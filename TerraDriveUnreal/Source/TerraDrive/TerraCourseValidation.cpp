#include "TerraCourseValidation.h"
#include "TerraPauseMenu.h"
#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Engine/Engine.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Widgets/Input/SButton.h"

namespace TerraCourseValidation {
namespace {
constexpr int Quarry=8;
enum class EPhase : uint8 {Garage,Brief,Settle,QuarryDrive,Results,MudSettle,MudDrive,MudView,Roll,Recovered,Soak,Count};
const TCHAR* const PhaseNames[]={TEXT("garage"),TEXT("brief"),TEXT("settle"),TEXT("quarry"),TEXT("results"),
  TEXT("mudStart"),TEXT("deepMud"),TEXT("mudView"),TEXT("rollover"),TEXT("recovery"),TEXT("soak")};

struct FSession {
  TWeakObjectPtr<ATerraVehicle> Owner;
  TArray<FVector> Points;
  TArray<double> Frames[int(EPhase::Count)];
  double Started=0,PhaseStarted=0,Previous=0;
  float MudRut=0,PeakICE=0,PeakEV=0,PeakRumble=0,PeakImpact=0,PeakSlip=0;
  FVector MudStart=FVector::ZeroVector,RollStart=FVector::ZeroVector;
  int Closest=0,Seconds=600,Laps=0;
  bool IceAudio=false,EVAudible=false,Captured=false;
  EPhase Phase=EPhase::Garage;
  void Advance(EPhase Next,double Now){
    Phase=Next;PhaseStarted=Now;Captured=false;
    UE_LOG(LogTemp,Display,TEXT("TERRA_PLAYTEST phase=%s elapsed=%.1f"),PhaseNames[int(Phase)],Now-Started);
  }
} Run;

void Hold(ATerraVehicle& V){
  V.TestDriverInput=false;V.TestThrottle=V.TestSteer=0;V.TestBrake=1;
}

void Place(ATerraVehicle& V,FVector Point,const FRotator& Rotation){
  V.Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  V.Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  V.SetActorLocationAndRotation(Point,Rotation,false,nullptr,ETeleportType::TeleportPhysics);
  V.Chassis->WakeAllRigidBodies();
}

void DriveQuarry(ATerraVehicle& V){
  const FVector P=V.GetActorLocation();
  double Best=TNumericLimits<double>::Max();
  int Closest=Run.Closest;
  for(int I=FMath::Max(0,Run.Closest-3);I<FMath::Min(Run.Points.Num(),Run.Closest+12);++I){
    const double Distance=FVector::DistSquared2D(P,Run.Points[I]);
    if(Distance<Best){Best=Distance;Closest=I;}
  }
  Run.Closest=FMath::Max(Run.Closest,Closest);
  FVector Target=Run.Points[FMath::Min(Closest+3,Run.Points.Num()-1)];
  if(Closest>=Run.Points.Num()-4)
    Target+=(Run.Points.Last()-Run.Points[Run.Points.Num()-2]).GetSafeNormal2D()*1000;
  const float Error=FMath::FindDeltaAngleDegrees(V.GetActorRotation().Yaw,(Target-P).Rotation().Yaw);
  const float Lookahead=FMath::Max(3.f,float(FVector::Dist2D(Target,P)/100));
  const float Angle=FMath::Atan2(2*3.006f*FMath::Sin(FMath::DegreesToRadians(Error)),Lookahead);
  V.TestSteer=FMath::Clamp(Angle/FMath::DegreesToRadians(34)*(1+FMath::Abs(V.Speed)*.025f),-.75f,.75f);
  const float Desired=FMath::Abs(Error)>25?2.6f:4.f;
  V.TestThrottle=FMath::Clamp((Desired-V.Speed)*.18f,.02f,.55f);
  V.TestBrake=V.Speed>Desired+.6f?.32f:0;
}

TSharedRef<FJsonObject> FrameStats(TArray<double> Frames){
  auto Stats=MakeShared<FJsonObject>();
  Stats->SetNumberField(TEXT("frames"),Frames.Num());
  if(Frames.IsEmpty())return Stats;
  Frames.Sort();
  double Sum=0;
  int Over50=0,Over100=0;
  for(double MS:Frames){Sum+=MS;Over50+=MS>50;Over100+=MS>100;}
  Stats->SetNumberField(TEXT("averageFPS"),1000*Frames.Num()/Sum);
  Stats->SetNumberField(TEXT("meanFrameMS"),Sum/Frames.Num());
  Stats->SetNumberField(TEXT("p95FrameMS"),Frames[FMath::CeilToInt(.95*Frames.Num())-1]);
  Stats->SetNumberField(TEXT("p99FrameMS"),Frames[FMath::CeilToInt(.99*Frames.Num())-1]);
  Stats->SetNumberField(TEXT("maximumFrameMS"),Frames.Last());
  Stats->SetNumberField(TEXT("framesOver50MS"),Over50);
  Stats->SetNumberField(TEXT("framesOver100MS"),Over100);
  return Stats;
}

bool Finish(double Now,TFunctionRef<void(const FString&,bool,float)> Check){
  TArray<double> All;
  auto Phases=MakeShared<FJsonObject>();
  for(int I=0;I<int(EPhase::Count);++I){
    All.Append(Run.Frames[I]);
    Phases->SetObjectField(PhaseNames[I],FrameStats(Run.Frames[I]));
  }
  auto Stats=FrameStats(MoveTemp(All));
  Stats->SetObjectField(TEXT("phases"),Phases);
  Stats->SetNumberField(TEXT("elapsedSeconds"),Now-Run.Started);
  Stats->SetBoolField(TEXT("fixedClock"),false);
  Stats->SetNumberField(TEXT("soakQuarryRestarts"),Run.Laps);
  Stats->SetNumberField(TEXT("mudRutInches"),Run.MudRut*39.3701f);
  Stats->SetNumberField(TEXT("iceLoad"),Run.PeakICE);
  Stats->SetNumberField(TEXT("evLoad"),Run.PeakEV);
  Stats->SetNumberField(TEXT("gamepadCue"),Run.PeakRumble);
  Stats->SetNumberField(TEXT("impactCue"),Run.PeakImpact);
  Stats->SetNumberField(TEXT("slipCue"),Run.PeakSlip);
  Check(TEXT("sustained session uses real wall time"),Now-Run.Started>=Run.Seconds&&Run.Laps>0,Now-Run.Started);
  Check(TEXT("live ICE sound plays and responds to load"),Run.IceAudio&&Run.PeakICE>.12f,Run.PeakICE);
  Check(TEXT("live EV audio plays under propulsion load"),Run.EVAudible&&Run.PeakEV>.12f,Run.PeakEV);
  Check(TEXT("contact feedback responds to wheel slip and impact"),Run.PeakRumble>.25f&&Run.PeakImpact>.08f&&Run.PeakSlip>.25f,Run.PeakRumble);
  FString ResultPath,Json;
  FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),ResultPath);
  const bool Written=FJsonSerializer::Serialize(Stats,TJsonWriterFactory<>::Create(&Json))&&
    FFileHelper::SaveStringToFile(Json,*(FPaths::GetPath(ResultPath)/TEXT("quarry-playtest.json")));
  Check(TEXT("writes per-phase wall-clock frame times"),Written,Stats->GetNumberField(TEXT("averageFPS")));
  return true;
}
}

bool Tick(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const double Now=FPlatformTime::Seconds();
  if(Run.Owner.Get()!=V){
    Run={};Run.Owner=V;Run.Started=Run.Previous=Now;
    const bool Real=!FApp::UseFixedTimeStep()&&!GEngine->bUseFixedFrameRate;
    Check(TEXT("quarry playtest uses the real clock"),Real,0);
    if(!Real)return true;
    FParse::Value(FCommandLine::Get(),TEXT("TerraPlaytestSeconds="),Run.Seconds);
    Run.Seconds=FMath::Clamp(Run.Seconds,180,900);
    for(const auto& Entry:V->Terrain->Data->GetObjectField(TEXT("quarryTrail"))->GetArrayField(TEXT("samples"))){
      const auto P=Entry->AsObject();
      Run.Points.Emplace(P->GetNumberField(TEXT("x"))*100,P->GetNumberField(TEXT("y"))*100,P->GetNumberField(TEXT("z"))*100);
    }
    V->SelectVehicle(5);V->ResetUpgrades(false);V->SetGarage(true);Hold(*V);
    Run.Advance(EPhase::Garage,Now);
    return false;
  }
  Run.Frames[int(Run.Phase)].Add(1000*(Now-Run.Previous));Run.Previous=Now;
  const auto& Cue=V->DriveCue;
  if(Cue.Electric){Run.EVAudible|=V->DriveFeedbackPlaying();Run.PeakEV=FMath::Max(Run.PeakEV,Cue.Load);}
  else {Run.IceAudio|=V->DriveFeedbackPlaying();Run.PeakICE=FMath::Max(Run.PeakICE,Cue.Load);}
  Run.PeakRumble=FMath::Max(Run.PeakRumble,Cue.Rumble);
  Run.PeakSlip=FMath::Max(Run.PeakSlip,Cue.Slip);Run.PeakImpact=FMath::Max(Run.PeakImpact,Cue.Impact);
  const double Time=Now-Run.PhaseStarted;
  const auto& Route=V->Terrain->Routes[Quarry];
  switch(Run.Phase){
    case EPhase::Garage:{
      if(Time<2)return false;
      if(!Run.Captured){
        Check(TEXT("garage renders with the original Performante selected"),V->Garage&&V->VehicleIndex==5,0);
        Capture(TEXT("playtest-garage.png"));Run.Captured=true;return false;
      }
      V->SetGarage(false);V->SetPauseMenu(true);
      const auto Menu=V->GetPauseMenuWidget();
      if(Menu)Menu->ShowPage(3);
      if(const auto Button=Menu?Menu->ChallengeButton(Quarry):nullptr)Button->SimulateClick();
      const bool Brief=Menu&&Menu->ActivePage()==STerraPauseMenu::CourseBriefPageIndex&&V->PauseMenuOpen;
      Check(TEXT("selecting the quarry opens its brief"),Brief,0);
      if(!Brief)return true;
      Run.Advance(EPhase::Brief,Now);return false;
    }
    case EPhase::Brief:{
      if(Time<1.5)return false;
      if(!Run.Captured){Capture(TEXT("playtest-course-brief.png"));Run.Captured=true;return false;}
      const auto Menu=V->GetPauseMenuWidget();
      if(const auto Button=Menu?Menu->CourseStartButton():nullptr)Button->SimulateClick();
      const bool Started=!V->PauseMenuOpen&&V->RouteIndex==Quarry&&V->GateIndex==0;
      Check(TEXT("the start button drives the live quarry course"),Started,0);
      if(!Started)return true;
      Run.Advance(EPhase::Settle,Now);return false;
    }
    case EPhase::Settle:
      if(Time>2){Run.Closest=0;Run.Advance(EPhase::QuarryDrive,Now);}
      return false;
    case EPhase::QuarryDrive:{
      if(const auto Menu=V->GetPauseMenuWidget();Menu&&Menu->ActivePage()==STerraPauseMenu::CourseResultsPageIndex){
        Check(TEXT("stock Urus reaches every quarry gate cleanly"),V->GateIndex==Route.Gates.Num()&&
          V->Course.CleanGates==Route.Gates.Num()&&V->Course.Recoveries==0,V->GateIndex);
        Run.Advance(EPhase::Results,Now);return false;
      }
      if(V->Overturned||Time>160){
        Check(TEXT("stock Urus reaches every quarry gate cleanly"),false,V->GateIndex);return true;
      }
      DriveQuarry(*V);return false;
    }
    case EPhase::Results:{
      if(Time<2)return false;
      if(!Run.Captured){Capture(TEXT("playtest-course-results.png"));Run.Captured=true;return false;}
      const double Best=V->CourseBest(Quarry);
      const bool Saved=V->Course.RecordSaved;
      V->LoadCourseRecords();
      Check(TEXT("clean personal best survives loading the player save"),
        Saved&&Best>0&&FMath::Abs(V->CourseBest(Quarry)-Best)<.001,Best);
      const auto Menu=V->GetPauseMenuWidget();
      if(const auto Button=Menu?Menu->CourseRetryButton():nullptr)Button->SimulateClick();
      Check(TEXT("results retry resets the timer and gates and retains the record"),
        !V->PauseMenuOpen&&V->RouteIndex==Quarry&&V->GateIndex==0&&V->RouteTime==0&&V->CourseBest(Quarry)==Best,V->GateIndex);
      V->SetGarage(true);V->SelectVehicle(0);V->ResetUpgrades(false);
      V->SetUpgrade(TerraSim::Tires,3,false);V->SetUpgrade(TerraSim::Suspension,2,false);
      V->SetGarage(false);V->TeleportZone(3);V->FourDrive=V->LowRange=V->FrontLocked=V->RearLocked=true;
      Hold(*V);Run.Advance(EPhase::MudSettle,Now);return false;
    }
    case EPhase::MudSettle:{
      if(Time<1)return false;
      FVector P(-14800,-5100,0);P.Z=V->Terrain->Height(P.X,P.Y)+V->ExpectedRideHeight()*100+8;
      Place(*V,P,FRotator::ZeroRotator);
      Run.MudStart=P;
      Run.Advance(EPhase::MudDrive,Now);return false;
    }
    case EPhase::MudDrive:{
      if(Time<2)return false;
      V->TestBrake=0;V->TestThrottle=.65f;
      for(int I=0;I<V->WheelCount();++I)
        Run.MudRut=FMath::Max(Run.MudRut,V->WheelState[I].RutDepth);
      if(V->GetActorLocation().X< -6700&&Time<60)return false;
      Check(TEXT("equipped Wrangler crosses the wet basin under its own power"),
        V->GetActorLocation().X> -6700,(V->GetActorLocation().X-Run.MudStart.X)/30.48f);
      Check(TEXT("wet mud records physical tire ruts"),Run.MudRut>.025f,Run.MudRut*39.3701f);
      Capture(TEXT("playtest-deep-mud.png"));
      Hold(*V);Run.Advance(EPhase::MudView,Now);return false;
    }
    case EPhase::MudView:
      if(Time<.6)return false;
      V->SelectVehicle(4);V->ResetUpgrades(false);V->TeleportRoute(Quarry);Hold(*V);
      Run.Advance(EPhase::Roll,Now);return false;
    case EPhase::Roll:{
      if(Time<1.5)return false;
      if(Run.RollStart.IsZero()){
        Run.RollStart=V->GetActorLocation();
        FVector P=Run.RollStart+FVector(0,0,125);
        Place(*V,P,FRotator(0,V->GetActorRotation().Yaw,90));
      }
      if(Time<4.5)return false;
      if(!Run.Captured){
        Check(TEXT("side contact disables vehicle drive"),V->Overturned&&V->Throttle==0,V->GetActorUpVector().Z);
        Capture(TEXT("playtest-rollover.png"));Run.Captured=true;return false;
      }
      const FVector P=V->GetActorLocation();
      const bool Recovered=V->RecoverInPlace();
      Check(TEXT("recover in place keeps the active course and marks an assisted leg"),
        Recovered&&V->Course.Recoveries==1&&!V->Course.LegClean&&V->RouteIndex==Quarry&&FVector::Dist2D(P,V->GetActorLocation())<250,
        FVector::Dist2D(P,V->GetActorLocation())/30.48f);
      Run.Advance(EPhase::Recovered,Now);return false;
    }
    case EPhase::Recovered:{
      if(Time<2){Hold(*V);return false;}
      if(Time<6){V->TestBrake=0;V->TestThrottle=.30f;return false;}
      if(!Run.Captured){
        Check(TEXT("EV drives away after it lands upright"),V->GetActorUpVector().Z>.8f&&V->ContactCount>=2&&V->Speed>.6f,V->Speed);
        Capture(TEXT("playtest-recovered.png"));Run.Captured=true;return false;
      }
      Hold(*V);V->SetPauseMenu(true);
      const auto Menu=V->GetPauseMenuWidget();
      if(const auto Button=Menu?Menu->RestartRouteButton():nullptr)Button->SimulateClick();
      Check(TEXT("pause restart begins a fresh attempt"),!V->PauseMenuOpen&&V->RouteIndex==Quarry&&
        V->GateIndex==0&&V->Course.Recoveries==0,V->GateIndex);
      V->SelectVehicle(5);V->ResetUpgrades(false);V->TeleportRoute(Quarry);
      Run.Closest=0;Run.Advance(EPhase::Soak,Now);return false;
    }
    case EPhase::Soak:
      if(Now-Run.Started>=Run.Seconds&&Run.Laps>0)return Finish(Now,Check);
      if(Time>=40||V->Overturned){
        if(Time>=40&&V->GateIndex>=2)++Run.Laps;
        V->TeleportRoute(Quarry);Run.Closest=0;Run.Advance(EPhase::Soak,Now);
      }
      if(Time>2)DriveQuarry(*V);
      else Hold(*V);
      return false;
    case EPhase::Count:break;
  }
  return true;
}
}
