#include "TerraEnergyLockValidation.h"
#include "TerraVehicle.h"
#include "TerraGarage.h"
#include "TerraPauseMenu.h"
#include "TerraGameMode.h"
#include "Components/BoxComponent.h"
#include "Engine/OverlapResult.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "Input/Events.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "CollisionQueryParams.h"
#include "CollisionShape.h"

namespace TerraEnergyLockValidation {
namespace {
struct FTrial {int Car,Swap;bool Front,Rear,Air,Empty;int Direction;};
const FTrial Trials[]={
  {6,3,true,true,false,false,1},{6,3,true,true,false,false,-1},
  {6,3,true,false,false,false,1},{6,3,false,true,false,false,1},
  {6,3,false,false,false,false,1},{6,3,true,true,true,false,1},
  {7,0,true,true,false,false,1},{4,0,true,true,false,false,1},
  {6,2,true,true,false,false,1},{6,1,true,true,false,false,1},
  {6,0,true,true,false,false,1},{6,3,false,false,false,true,1},{2,0,false,false,false,true,1}};
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  int Phase=0,Trial=0,Samples=0,AirSamples=0,Loaded=0;
  float Time=0,MaxError[2]={},OpenDifference[2]={},PeakDrive=0,PeakSpeed=0,StartEnergy=0;
  bool Finite=true,Found=false;
  FVector Road;
  FString Directory;
} State;
FString File(const TCHAR* Name){return State.Directory/Name;}
bool Write(const TSharedPtr<FJsonObject>& Root,const TCHAR* Name){
  FString Text;return FJsonSerializer::Serialize(Root.ToSharedRef(),TJsonWriterFactory<>::Create(&Text))&&FFileHelper::SaveStringToFile(Text,*File(Name));
}
bool HasText(const TSharedRef<SWidget>& W,const FString& Text){
  if(W->GetType()==FName(TEXT("STextBlock"))&&StaticCastSharedRef<STextBlock>(W)->GetText().ToString()==Text)return true;
  if(auto* C=W->GetChildren())for(int I=0;I<C->Num();++I)if(HasText(C->GetChildAt(I),Text))return true;
  return false;
}
TSharedPtr<SButton> Button(const TSharedRef<SWidget>& W,const FString& Text){
  if(W->GetType()==FName(TEXT("SButton"))&&HasText(W,Text))return StaticCastSharedRef<SButton>(W);
  if(auto* C=W->GetChildren())for(int I=0;I<C->Num();++I){auto Found=Button(C->GetChildAt(I),Text);if(Found.IsValid())return Found;}
  return nullptr;
}
bool Inside(const TSharedPtr<SWidget>& Root,const TSharedPtr<SWidget>& W){
  if(!Root.IsValid()||!W.IsValid())return false;
  const auto& R=Root->GetCachedGeometry();const auto& G=W->GetCachedGeometry();
  const auto Low=R.AbsoluteToLocal(G.LocalToAbsolute(FVector2D::ZeroVector)),High=R.AbsoluteToLocal(G.LocalToAbsolute(G.GetLocalSize()));
  return G.GetLocalSize().X>0&&G.GetLocalSize().Y>0&&Low.X>=-1&&Low.Y>=-1&&High.X<=R.GetLocalSize().X+1&&High.Y<=R.GetLocalSize().Y+1;
}
void Stop(ATerraVehicle* V){
  V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
}
bool ClearRoad(ATerraVehicle* V,FVector P){
  auto* T=V->Terrain.Get();const float H=T->Height(P.X,P.Y);
  FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraEnergyRoad),false,V);
  for(int X=-800;X<=2400;X+=400)for(int Y:{-600,0,600}){
    FVector Q=P+FVector(X,Y,0);const auto G=T->Sample(Q);const auto B=T->SurfaceBlend(Q.X,Q.Y);
    if(G.Surface!=1||B.Weight[1]<.97f||G.Normal.Z<.995f||FMath::Abs(G.Height-H)>60)return false;
    Q.Z=G.Height+260;
    if(V->GetWorld()->OverlapBlockingTestByChannel(Q,FQuat::Identity,ECC_WorldStatic,FCollisionShape::MakeBox(FVector(210,210,240)),Params))return false;
  }
  return true;
}
void SaveChecks(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check){
  for(int I=0;I<9;++I){V->PressureProfiles[I]=30+I;V->BatteryProfiles[I]=.3f+I*.05f;V->FuelProfiles[I]=.2f+I*.06f;}
  V->PressureTarget=V->PressureProfiles[V->VehicleIndex];V->BatterySOC=V->BatteryProfiles[V->VehicleIndex];V->FuelFraction=V->FuelProfiles[V->VehicleIndex];
  V->SetEnergyUsageEnabled(false,false);V->DamageEnabled=false;
  Check(TEXT("energy v8 record writes to isolated fixture"),V->SaveGarage(File(TEXT("energy-v8.json"))),7);
  FString Text;TSharedPtr<FJsonObject> Root;
  bool Read=FFileHelper::LoadFileToString(Text,*File(TEXT("energy-v8.json")))&&FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Root)&&Root.IsValid();
  V->EnergyUsageEnabled=true;
  bool Round=Read&&V->LoadGarage(File(TEXT("energy-v8.json")))&&!V->EnergyUsageEnabled&&!V->DamageEnabled;
  for(int I=0;I<9;++I)Round&=FMath::Abs(V->FuelProfiles[I]-(.2f+I*.06f))<.000001f&&FMath::Abs(V->BatteryProfiles[I]-(.3f+I*.05f))<.000001f;
  Check(TEXT("v8 round trip preserves all nine independent fuel charge and unlimited settings"),Round,9);
  if(!Read){Check(TEXT("energy save fixture decoded"),false,0);return;}
  const float OriginalFuel=V->FuelProfiles[0];
  auto Fuel=Root->GetArrayField(TEXT("fuelLevels"));Fuel[0]=MakeShared<FJsonValueNumber>(1.1);Root->SetArrayField(TEXT("fuelLevels"),Fuel);
  Check(TEXT("out of range fuel is rejected atomically without changing consumption mode or profiles"),Write(Root,TEXT("energy-bad-fuel.json"))&&!V->LoadGarage(File(TEXT("energy-bad-fuel.json")))&&!V->EnergyUsageEnabled&&V->FuelProfiles[0]==OriginalFuel,1.1f);
  Fuel[0]=MakeShared<FJsonValueString>(TEXT("empty"));Root->SetArrayField(TEXT("fuelLevels"),Fuel);
  Check(TEXT("nonnumeric fuel rejects atomically"),Write(Root,TEXT("energy-bad-type.json"))&&!V->LoadGarage(File(TEXT("energy-bad-type.json")))&&!V->EnergyUsageEnabled&&V->FuelProfiles[0]==OriginalFuel,0);
  Fuel[0]=MakeShared<FJsonValueString>(TEXT("0.25"));Root->SetArrayField(TEXT("fuelLevels"),Fuel);
  Check(TEXT("numeric text cannot be coerced into a v8 fuel value"),Write(Root,TEXT("energy-numeric-text.json"))&&!V->LoadGarage(File(TEXT("energy-numeric-text.json")))&&!V->EnergyUsageEnabled&&V->FuelProfiles[0]==OriginalFuel,0);
  Root->RemoveField(TEXT("fuelLevels"));
  Check(TEXT("incomplete v8 record cannot silently reset fuel"),Write(Root,TEXT("energy-missing.json"))&&!V->LoadGarage(File(TEXT("energy-missing.json"))),0);
  // Restore the valid fixture before testing the setting's type separately.
  FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Root);Root->SetStringField(TEXT("energyUsageEnabled"),TEXT("off"));
  Check(TEXT("invalid consumption setting rejects atomically"),Write(Root,TEXT("energy-bad-setting.json"))&&!V->LoadGarage(File(TEXT("energy-bad-setting.json")))&&!V->EnergyUsageEnabled&&V->FuelProfiles[0]==OriginalFuel,0);
  FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Root);
  for(const TCHAR* Key:{TEXT("builds"),TEXT("pressureTargets"),TEXT("batteryCharge"),TEXT("fuelLevels")}){auto A=Root->GetArrayField(Key);A.SetNum(9);Root->SetArrayField(Key,A);}
  Root->SetNumberField(TEXT("version"),6);Root->RemoveField(TEXT("energyUsageEnabled"));
  bool Legacy=Write(Root,TEXT("energy-v6.json"))&&V->LoadGarage(File(TEXT("energy-v6.json")))&&V->EnergyUsageEnabled&&!V->DamageEnabled;
  for(int I=0;I<9;++I)Legacy&=V->FuelProfiles[I]==.75f&&FMath::Abs(V->BatteryProfiles[I]-(.3f+I*.05f))<.000001f&&V->PressureProfiles[I]==30+I;
  Check(TEXT("v6 migration retains charge pressure builds and damage while adding fuel at seventy five percent"),Legacy,6);
  V->LoadGarage(File(TEXT("energy-v8.json")));
  for(int I=0;I<9;++I){
    V->SelectVehicle(I);V->BatterySOC=.23f;V->FuelFraction=.31f;
    const bool EV=V->IsElectric();const float Other=EV?V->FuelFraction:V->BatterySOC;
    bool Service=V->CanServiceEnergy()&&V->ServiceEnergy(false)&&(EV?V->BatterySOC:V->FuelFraction)==1&&(EV?V->FuelFraction:V->BatterySOC)==Other;
    Check(FString::Printf(TEXT("garage service vehicle %d restores only its active energy source"),I),Service,I);
  }
  V->SelectVehicle(6);V->SetUpgrade(TerraSim::EVSwap,3,false);V->BatterySOC=.41f;
  V->SetUpgrade(TerraSim::EVSwap,1,false);V->SetUpgrade(TerraSim::EVSwap,3,false);
  Check(TEXT("changing conversion motor count does not refill the battery"),V->BatterySOC==.41f,V->BatterySOC);
  V->SetEnergyUsageEnabled(true,false);
}
void Configure(ATerraVehicle* V){
  const auto& T=Trials[State.Trial];Stop(V);V->SetGarage(true);V->SelectVehicle(T.Car);V->ResetUpgrades(false);
  V->SetUpgrade(TerraSim::EVSwap,T.Swap,false);V->SetUpgrade(TerraSim::Drivetrain,3,false);V->SetUpgrade(TerraSim::Differentials,2,false);
  V->SetEnergyUsageEnabled(true,false);V->BatterySOC=V->FuelFraction=.7f;V->FourDrive=true;V->LowRange=false;V->FrontLocked=V->RearLocked=false;
  State.Samples=State.AirSamples=State.Loaded=0;State.PeakDrive=State.PeakSpeed=0;State.Finite=true;
  for(int A=0;A<2;++A)State.MaxError[A]=State.OpenDifference[A]=0;
}
void Record(ATerraVehicle* V){
  ++State.Samples;if(V->ContactCount>=3)++State.Loaded;if(V->ContactCount==0)++State.AirSamples;
  float Drive=0;for(int I=0;I<4;++I){Drive+=FMath::Abs(V->LastWheelDriveNm[I]);State.Finite&=FMath::IsFinite(V->WheelState[I].Omega);}
  State.PeakDrive=FMath::Max(State.PeakDrive,Drive);State.PeakSpeed=FMath::Max(State.PeakSpeed,FMath::Abs(V->Speed));
  for(int A=0;A<2;++A){const float E=FMath::Abs(V->WheelState[A*2].Omega-V->WheelState[A*2+1].Omega);State.MaxError[A]=FMath::Max(State.MaxError[A],E);State.OpenDifference[A]=FMath::Max(State.OpenDifference[A],E);}
  State.Finite&=!V->GetActorLocation().ContainsNaN()&&V->GetActorUpVector().Z>.8f;
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(State.Vehicle.Get()!=V){
    State=FState();State.Vehicle=V;FString Report;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);
    State.Directory=FPaths::GetPath(Report)/TEXT("EnergyFixtures");IFileManager::Get().MakeDirectory(*State.Directory,true);
    Stop(V);V->SetGarage(true);SaveChecks(V,Check);
    const FVector Origin=V->Terrain->Spawns[1]-FVector(600,600,0);float Best=FLT_MAX;
    for(int X=-30;X<=30;++X)for(int Y=-30;Y<=30;++Y){const float Cost=X*X+Y*Y;if(Cost>=Best)continue;
      const FVector P=Origin+FVector(X*200,Y*200,0);if(ClearRoad(V,P)){State.Road=P;Best=Cost;State.Found=true;}}
    Check(TEXT("locker trials find a continuous flat pavement corridor without scenery"),State.Found,Best);
    if(!State.Found)return true;
  }
  State.Time+=FMath::Clamp(Dt,0.f,.1f);
  auto Next=[&](int P){State.Phase=P;State.Time=0;};
  if(State.Trial<int(UE_ARRAY_COUNT(Trials))){
    const auto T=Trials[State.Trial];const FString Label=FString::Printf(TEXT("axle trial %d car %d swap %d "),State.Trial,T.Car,T.Swap);
    if(State.Phase==0){Configure(V);Next(1);}
    else if(State.Phase==1&&State.Time>.15f){V->SetGarage(false);V->TeleportZone(1);Stop(V);Next(2);}
    else if(State.Phase==2&&State.Time>1.1f){
      FVector P=State.Road;P.Z=V->Terrain->Height(P.X,P.Y)+V->ExpectedRideHeight()*100+5;
      V->SetActorLocationAndRotation(P,FRotator::ZeroRotator,false,nullptr,ETeleportType::TeleportPhysics);Stop(V);
      for(auto& W:V->WheelState)W=FTerraWheel();Next(3);
    }else if(State.Phase==3&&State.Time>1.f){
      Check(Label+TEXT("settles with upright loaded tires on actual pavement"),V->ContactCount>=3&&V->GetActorUpVector().Z>.9f&&V->Terrain->Sample(V->GetActorLocation()).Surface==1,V->ContactCount);
      Stop(V);V->LowRange=true;V->Direction=T.Direction;
      if(T.Rear)V->ToggleLocker(false);if(T.Front)V->ToggleLocker(true);
      Check(Label+TEXT("requested front and rear lock controls engage separately"),V->FrontLocked==T.Front&&V->RearLocked==T.Rear,0);
      if(T.Air){V->SetActorLocation(V->GetActorLocation()+FVector(0,0,1200),false,nullptr,ETeleportType::TeleportPhysics);for(int I=0;I<4;++I)V->WheelState[I].Omega=I%2?2:18;}
      if(T.Empty)V->BatterySOC=V->FuelFraction=0;
      State.StartEnergy=V->IsElectric()?V->BatterySOC:V->FuelFraction;
      V->TestThrottle=.45f;V->TestSteer=T.Air?0:.55f;V->TestBrake=0;Next(4);
    }else if(State.Phase==4){
      if(State.Time>.2f)Record(V);
      if(State.Time>1.6f){
        Check(Label+TEXT("actual drive solver remains finite over repeated ticks"),State.Finite&&State.Samples>=8,State.Samples);
        for(int A=0;A<2;++A)if(A==0?T.Front:T.Rear)Check(Label+(A?TEXT("rear locked wheels keep identical signed angular speed"):TEXT("front locked wheels keep identical signed angular speed")),State.MaxError[A]<.0001f,State.MaxError[A]);
        if(!T.Front&&!T.Rear&&!T.Empty)Check(Label+TEXT("unlocked quad motors retain differential wheel speeds while turning"),State.OpenDifference[0]>.02f&&State.OpenDifference[1]>.02f,State.OpenDifference[0]);
        if(T.Air)Check(Label+TEXT("virtual locks synchronize seeded unequal wheel speeds with all wheels airborne"),State.AirSamples>=8,State.AirSamples);
        else Check(Label+TEXT("measurement contains actual loaded ground contact"),State.Loaded>=8,State.Loaded);
        Check(Label+TEXT("propulsion follows active energy availability"),T.Empty?State.PeakDrive<.001f:State.PeakDrive>100,State.PeakDrive);
        if(State.Trial==0||State.Trial==10){const float Level=V->IsElectric()?V->BatterySOC:V->FuelFraction;
          Check(Label+TEXT("actual acceleration consumes the active battery or fuel supply"),Level<State.StartEnergy,Level-State.StartEnergy);}
        Capture(*FString::Printf(TEXT("energy-lock-trial-%02d.png"),State.Trial));
        if(T.Empty){V->SetEnergyUsageEnabled(false,false);State.PeakDrive=0;Next(6);}
        else{V->TestThrottle=0;V->TestSteer=0;V->TestBrake=1;State.Samples=0;for(float& E:State.MaxError)E=0;Next(5);}
      }
    }else if(State.Phase==5){
      if(State.Time>.15f)Record(V);
      if(State.Time>1){
        for(int A=0;A<2;++A)if(A==0?T.Front:T.Rear)Check(Label+(A?TEXT("rear lock stays coupled through service braking and regen"):TEXT("front lock stays coupled through service braking and regen")),State.Samples>=8&&State.MaxError[A]<.0001f,State.MaxError[A]);
        ++State.Trial;Next(0);
      }
    }else if(State.Phase==6){
      if(State.Time>.2f)Record(V);
      if(State.Time>1.2f){
        Check(Label+TEXT("unlimited mode restores real drive from empty without adding fuel or charge"),State.PeakDrive>100&&V->BatterySOC==0&&V->FuelFraction==0&&V->HasPropulsionEnergy(),State.PeakDrive);
        Capture(*FString::Printf(TEXT("energy-unlimited-%d.png"),T.Car));++State.Trial;Next(0);
      }
    }
    return false;
  }
  if(State.Phase==0){
    Stop(V);V->SetGarage(true);V->SelectVehicle(2);V->ResetUpgrades(false);V->FuelFraction=.52f;V->SetEnergyUsageEnabled(true,false);V->SetGarage(false);Stop(V);Next(10);
  }else if(State.Phase==10&&State.Time>1){
    const float Before=V->FuelFraction;V->AdvanceEnergyForValidation(60);
    Check(TEXT("ICE idling drains fuel without wheel propulsion"),V->FuelFraction<Before&&V->LastFuelGPH>0,V->FuelFraction-Before);
    Check(TEXT("energy service cannot be invoked from active driving"),!V->CanServiceEnergy()&&!V->ServiceEnergy(false),0);
    V->Chassis->SetPhysicsLinearVelocity(FVector(300,0,0));V->SetPauseMenu(true);Next(11);
  }else if(State.Phase==11&&State.Time>.3f){
    Check(TEXT("pause does not make a moving vehicle eligible for refueling"),!V->CanServiceEnergy()&&!V->ServiceEnergy(false),V->Chassis->GetPhysicsLinearVelocity().Size()/100);
    V->SetPauseMenu(false);Stop(V);V->SetGarage(true);Capture(TEXT("energy-garage-fuel.png"));Next(12);
  }else if(State.Phase==12&&State.Time>.5f){
    auto Garage=V->GetGarageWidget();auto Service=Garage.IsValid()?Button(Garage.ToSharedRef(),TEXT("FILL FUEL TANK")):nullptr;
    auto Toggle=Garage.IsValid()?Button(Garage.ToSharedRef(),TEXT("FUEL / CHARGE USE: ON")):nullptr;
    Check(TEXT("garage energy service and unlimited buttons fit fully inside the native viewport"),Inside(Garage,Service)&&Inside(Garage,Toggle),0);
    if(Service.IsValid())Service->SimulateClick();
    Check(TEXT("real garage fill button refuels the active ICE vehicle"),Service.IsValid()&&Service->IsEnabled()&&V->FuelFraction==1,V->FuelFraction);
    if(Toggle.IsValid())Toggle->SimulateClick();
    Check(TEXT("real garage unlimited button saves mode without refilling other energy"),Toggle.IsValid()&&!V->EnergyUsageEnabled&&V->FuelFraction==1,V->FuelFraction);
    V->SetEnergyUsageEnabled(true,false);
    V->SelectVehicle(6);V->SetUpgrade(TerraSim::EVSwap,3,false);V->BatterySOC=.48f;V->SetGarage(false);Stop(V);Next(13);
  }else if(State.Phase==13&&State.Time>1){
    const float Before=V->BatterySOC;V->LastElectricDrawW=350;V->LastRegenPowerW=0;
    for(int I=0;I<3600;++I)V->AdvanceEnergyForValidation(1.f/60);
    Check(TEXT("EV accessory demand accumulates at sixty Hz without float rounding away idle consumption"),V->BatterySOC<Before,V->BatterySOC-Before);
    V->SetPauseMenu(true);Next(14);
  }else if(State.Phase==14&&State.Time>.5f){
    Stop(V);auto Menu=V->GetPauseMenuWidget();auto Service=Menu.IsValid()?Button(Menu.ToSharedRef(),TEXT("CHARGE TO 100%")):nullptr;
    if(Service.IsValid())Service->SimulateClick();
    Check(TEXT("real pause menu charge button recharges a stopped upright EV"),Service.IsValid()&&Service->IsEnabled()&&V->BatterySOC==1,V->BatterySOC);
    auto Toggle=Menu.IsValid()?Button(Menu.ToSharedRef(),TEXT("FUEL / CHARGE USE: ON")):nullptr;
    Check(TEXT("pause energy service and unlimited buttons fit fully inside the native viewport"),Inside(Menu,Service)&&Inside(Menu,Toggle),0);
    if(Toggle.IsValid())Toggle->SimulateClick();
    Check(TEXT("real pause unlimited button disables charge usage"),Toggle.IsValid()&&!V->EnergyUsageEnabled,V->BatterySOC);
    Capture(TEXT("energy-pause-service.png"));Next(15);
  }else if(State.Phase==15&&State.Time>.5f){V->SetPauseMenu(false);return true;}
  return false;
}
}
