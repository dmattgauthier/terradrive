#include "TerraInterfaceValidation.h"
#include "TerraVehicle.h"
#include "TerraGameMode.h"
#include "TerraGarage.h"
#include "TerraPauseMenu.h"
#include "TerraControls.h"
#include "TerraGraphics.h"
#include "Components/BoxComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Input/Events.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SScrollBox.h"

namespace TerraInterfaceValidation {
namespace {
using A=TerraControls::Action;
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TerraSim::UpgradeSetup Builds[ATerraVehicle::VehicleCount];
  int Phase=0,Model=0,OriginalVehicle=0,OriginalGraphics=0;
  float Time=0,PausedRouteTime=0,MaximumCoupling=0,InitialShaftDifference=0;
  float MaximumPausedPositionDelta=0,MaximumPausedVelocityDelta=0;
  int PausedSamples=0;
  bool PausedRotationStable=true,PausedWorldStable=true,PausedRouteStable=true;
  double PausedWorldTime=0;
  FVector PausedPosition,PausedVelocity;
  FQuat PausedRotation;
  FString Directory;
} State;
FString File(const TCHAR* Name){return State.Directory/Name;}
FReply Key(STerraPauseMenu& Menu,FKey K){return Menu.OnPreviewKeyDown(FGeometry(),FKeyEvent(K,FModifierKeysState(),0,false,0,0));}
float ShaftDifference(ATerraVehicle* V){return .5f*(V->WheelState[0].Omega+V->WheelState[1].Omega-V->WheelState[2].Omega-V->WheelState[3].Omega);}
bool UpgradeRowVisible(const TSharedPtr<STerraGarage>& Garage,const TSharedPtr<SWidget>& Row){
  if(!Garage.IsValid()||!Row.IsValid()||!Garage->UpgradePartScrollBox().IsValid())return false;
  const auto& R=Row->GetCachedGeometry();const auto& S=Garage->UpgradePartScrollBox()->GetCachedGeometry();
  const auto RT=R.LocalToAbsolute(FVector2D::ZeroVector),RB=R.LocalToAbsolute(R.GetLocalSize());
  const auto ST=S.LocalToAbsolute(FVector2D::ZeroVector),SB=S.LocalToAbsolute(S.GetLocalSize());
  return R.GetLocalSize().Y>0&&RT.Y>=ST.Y-1&&RB.Y<=SB.Y+1;
}
void Stop(ATerraVehicle* V){
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  V->Speed=V->Throttle=V->Steer=0;V->TestThrottle=V->TestSteer=0;V->Brake=V->TestBrake=1;
  for(auto& W:V->WheelState)W.Omega=0;
}
bool WriteObject(const FString& Path,const TSharedPtr<FJsonObject>& Object){FString Json;return FJsonSerializer::Serialize(Object,TJsonWriterFactory<>::Create(&Json))&&FFileHelper::SaveStringToFile(Json,*Path);}
struct FStageButtons {int Total=0,Enabled=0;};
FStageButtons StageButtons(const TSharedPtr<SWidget>& Root){
  FStageButtons Result;
  TFunction<void(const TSharedRef<SWidget>&)> Visit=[&](const TSharedRef<SWidget>& Widget){
    if(Widget->GetType()==FName(TEXT("SButton"))){++Result.Total;if(Widget->IsEnabled())++Result.Enabled;}
    if(auto* Children=Widget->GetChildren())for(int I=0;I<Children->Num();++I)Visit(Children->GetChildAt(I));
  };
  if(Root.IsValid())Visit(Root.ToSharedRef());return Result;
}
bool InvalidControlFixture(ATerraVehicle* V,const TCHAR* Kind){
  FString Json;TSharedPtr<FJsonObject> Root;
  if(!FFileHelper::LoadFileToString(Json,*File(TEXT("controls-roundtrip.json")))||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid())return false;
  auto Bindings=Root->GetObjectField(TEXT("bindings"));
  if(FCString::Strcmp(Kind,TEXT("unknown"))==0)Bindings->SetStringField(TEXT("garage"),TEXT("NotARegisteredTerraKey"));
  if(FCString::Strcmp(Kind,TEXT("duplicate"))==0)Bindings->SetStringField(TEXT("garage"),TEXT("F"));
  if(FCString::Strcmp(Kind,TEXT("missing"))==0)Bindings->RemoveField(TEXT("garage"));
  if(FCString::Strcmp(Kind,TEXT("fractional"))==0)Root->SetNumberField(TEXT("version"),1.5);
  return WriteObject(File(TEXT("controls-invalid.json")),Root)&&!V->LoadControls(File(TEXT("controls-invalid.json")))&&V->ControlKey(A::Garage)==EKeys::B;
}
void Restore(ATerraVehicle* V){
  V->SetPauseMenu(false);V->SetGarage(true);
  for(int I=0;I<ATerraVehicle::VehicleCount;++I)V->Builds[I]=State.Builds[I];
  V->SelectVehicle(State.OriginalVehicle);V->LoadControls(File(TEXT("controls-before.json")));
  TerraGraphics::Select(State.OriginalGraphics,false);V->SetGarage(false);Stop(V);
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Report,TFunctionRef<void(const TCHAR*)> Capture){
  auto Check=[&](const FString& Name,bool Pass,float Value=0.f){Report(Name,Pass,Value);};
  auto* PC=Cast<APlayerController>(V->GetController());
  auto* HUD=PC?Cast<ATerraHUD>(PC->GetHUD()):nullptr;
  if(State.Vehicle.Get()!=V){
    State=FState();State.Vehicle=V;State.OriginalVehicle=V->VehicleIndex;State.OriginalGraphics=TerraGraphics::Preset();
    for(int I=0;I<ATerraVehicle::VehicleCount;++I)State.Builds[I]=V->Builds[I];
    FString ReportPath;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),ReportPath);
    State.Directory=ReportPath.IsEmpty()?FPaths::ProjectSavedDir()/TEXT("Validation/Interface"):FPaths::GetPath(ReportPath);
    Check(TEXT("interface fixture saves original control state to isolated evidence"),V->SaveControls(File(TEXT("controls-before.json"))));
    FString Actual=FPaths::ConvertRelativePathToFull(V->ControlsPath()),Expected=FPaths::ConvertRelativePathToFull(File(TEXT("controls.json")));
    FPaths::NormalizeFilename(Actual);FPaths::NormalizeFilename(Expected);
    Check(TEXT("interface controls persistence path is explicitly isolated from player files"),Actual.Equals(Expected,ESearchCase::IgnoreCase));
    Check(TEXT("native viewport owns the real driving HUD and controller"),PC&&HUD);
    if(!PC||!HUD)return true;
    V->SetGarage(false);State.Phase=1;
  }
  if(!PC||!HUD){Check(TEXT("interface controller and HUD remain valid"),false);Restore(V);return true;}
  State.Time+=FMath::Max(0.f,Dt);
  auto Next=[&](int Phase){State.Phase=Phase;State.Time=0;};
  auto Menu=V->GetPauseMenuWidget();
  switch(State.Phase){
  case 1:
    V->SetGarage(true);V->SelectVehicle(State.Model);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);Stop(V);Next(2);break;
  case 2:if(State.Time>.65f){
    const FString Label=FString::Printf(TEXT("HUD vehicle %d "),State.Model);
    int W=0,H=0;PC->GetViewportSize(W,H);
    const auto& Ids=HUD->VisibleStatusIds;
    Check(Label+TEXT("draws speed RPM drive PSI garage and pause status"),Ids.Contains(TEXT("speed"))&&Ids.Contains(TEXT("rpm"))&&Ids.Contains(TEXT("drive"))&&Ids.Contains(TEXT("pressure"))&&Ids.Contains(TEXT("garage"))&&Ids.Contains(TEXT("menu")),Ids.Num());
    Check(Label+TEXT("front locker card matches mechanical or virtual capability"),Ids.Contains(TEXT("frontLock"))==V->HasLocker(true));
    Check(Label+TEXT("rear locker card matches mechanical or virtual capability"),Ids.Contains(TEXT("rearLock"))==V->HasLocker(false));
    Check(Label+TEXT("energy gauge matches the active EV or ICE powertrain"),Ids.Contains(TEXT("battery"))==V->IsElectric()&&Ids.Contains(TEXT("fuel"))==!V->IsElectric());
    Check(Label+TEXT("center card distinguishes real center lock or rigid transfer"),Ids.Contains(TEXT("centerLock"))==(V->HasCenterLocker()||V->HasRigidTransfer()));
    Check(Label+TEXT("status stays in the top fifth of the actual viewport"),W>=1024&&H>=576&&HUD->LastStatusBottom>0&&HUD->LastStatusBottom<H*.2f,HUD->LastStatusBottom);
    Check(Label+TEXT("active drivetrain and configurable key labels are nonempty"),!V->DriveDescription().IsEmpty()&&!V->ControlLabel(A::Garage).IsEmpty()&&!V->ControlLabel(A::PressureDown).IsEmpty());
    Capture(*FString::Printf(TEXT("native-interface-hud-v%d.png"),State.Model));Next(3);
  }break;
  case 3:if(State.Time>.2f){if(++State.Model<ATerraVehicle::VehicleCount)Next(1);else Next(4);}break;
  case 4:
    V->SetGarage(true);V->SelectVehicle(2);V->ResetUpgrades(false);
    Check(TEXT("stock front-drive Civic cannot fit a center locker before four-wheel drive"),!V->CenterLockUpgradeAvailable()&&!V->HasCenterLocker());
    V->SetUpgrade(TerraSim::Drivetrain,1,false);V->FourDrive=true;
    Check(TEXT("Civic four-wheel-drive conversion makes the mechanical center upgrade available"),V->CenterLockUpgradeAvailable()&&V->DrivenWheel(0)&&V->DrivenWheel(2));
    V->SetUpgrade(TerraSim::CenterDifferential,3,false);V->SetUpgrade(TerraSim::Differentials,2,false);
    Check(TEXT("Civic center retrofit retains front and rear axle lockers and permanent AWD"),V->HasCenterLocker()&&V->HasLocker(true)&&V->HasLocker(false)&&V->DriveCapabilities().Permanent);
    V->SetGarage(false);V->TeleportZone(1);Stop(V);Next(5);break;
  case 5:if(State.Time>.5f){
    Check(TEXT("upgraded Civic draws all three distinct differential cards"),HUD->VisibleStatusIds.Contains(TEXT("frontLock"))&&HUD->VisibleStatusIds.Contains(TEXT("centerLock"))&&HUD->VisibleStatusIds.Contains(TEXT("rearLock")));
    Capture(TEXT("native-interface-civic-center-open.png"));Next(6);
  }break;
  case 6:if(State.Time>.2f){
    Stop(V);V->ToggleCenterLocker();V->ToggleLocker(false);V->ToggleLocker(true);
    Check(TEXT("Civic center lock engages through the same operation as player input"),V->CenterLockActive());
    Check(TEXT("Civic front and rear lockers engage independently alongside center lock"),V->FrontLocked&&V->RearLocked);
    Next(7);
  }break;
  case 7:if(State.Time>.5f){Capture(TEXT("native-interface-civic-three-locks.png"));Next(8);}break;
  case 8:if(State.Time>.2f){
    for(int I:{4,7}){
      V->SetGarage(true);V->SelectVehicle(I);V->ResetUpgrades(false);
      Check(FString::Printf(TEXT("independent-motor factory EV %d has no mechanical center shaft lock"),I),!V->HasCenterLocker()&&!V->HasRigidTransfer());
      Check(FString::Printf(TEXT("independent-motor factory EV %d disables incompatible center retrofit"),I),!V->CenterLockUpgradeAvailable());
      V->SetUpgrade(TerraSim::CenterDifferential,1,false);
      Check(FString::Printf(TEXT("independent-motor factory EV %d rejects fitting incompatible hardware"),I),V->UpgradeStage(TerraSim::CenterDifferential)==0&&!V->HasCenterLocker());
    }
    V->SelectVehicle(2);V->ResetUpgrades(false);V->SetUpgrade(TerraSim::Drivetrain,1,false);V->SetUpgrade(TerraSim::CenterDifferential,1,false);
    V->SetUpgrade(TerraSim::EVSwap,2,false);
    Check(TEXT("dual-motor swap leaves an existing center kit dormant without deleting its upgrade"),!V->HasCenterLocker()&&!V->CenterLockUpgradeAvailable()&&V->UpgradeStage(TerraSim::CenterDifferential)==1);
    V->SetUpgrade(TerraSim::EVSwap,1,false);
    Check(TEXT("single-motor mechanical 4WD swap can use the retained center kit"),V->HasCenterLocker()&&V->CenterLockUpgradeAvailable());
    V->SelectVehicle(8);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);Stop(V);V->LowRange=true;
    Check(TEXT("G63 retains all three factory mechanical lockers without buying an upgrade"),V->HasCenterLocker()&&V->HasLocker(true)&&V->HasLocker(false)&&V->UpgradeStage(TerraSim::CenterDifferential)==0);
    V->ToggleCenterLocker();V->ToggleLocker(false);V->ToggleLocker(true);
    Check(TEXT("G63 factory center front and rear locks can be active together"),V->CenterLockActive()&&V->FrontLocked&&V->RearLocked);
    Next(9);
  }break;
  case 9:if(State.Time>.55f){Capture(TEXT("native-interface-g63-three-locks.png"));Next(10);}break;
  case 10:if(State.Time>.2f){
    V->ResetUpgrades(false);V->TeleportZone(1);Stop(V);V->CenterLocked=false;V->FrontLocked=V->RearLocked=V->LowRange=false;V->TestBrake=V->Brake=0;
    // One deliberate shaft-speed disturbance, then the real wheel/contact
    // solver coasts freely. Its magnitude keeps the constraint observable
    // even at the simulation's largest supported 0.1-second tire step.
    V->WheelState[0].Omega=120;V->WheelState[1].Omega=122;V->WheelState[2].Omega=2;V->WheelState[3].Omega=4;
    State.InitialShaftDifference=FMath::Abs(ShaftDifference(V));State.MaximumCoupling=0;Next(11);
  }break;
  case 11:
    State.MaximumCoupling=FMath::Max(State.MaximumCoupling,FMath::Abs(V->LastCenterCouplingNm));
    if(State.Time>.4f){
      Check(TEXT("unlocked mechanical center adds no front-rear shaft constraint torque"),State.MaximumCoupling<.01f,State.MaximumCoupling);
      Capture(TEXT("native-interface-center-open-motion.png"));Next(12);
    }break;
  case 12:if(State.Time>.2f){
    V->TeleportZone(1);Stop(V);V->CenterLocked=false;V->ToggleCenterLocker();
    Check(TEXT("factory center locks at rest before the shaft-speed disturbance"),V->CenterLockActive());
    V->TestBrake=V->Brake=0;V->WheelState[0].Omega=120;V->WheelState[1].Omega=122;V->WheelState[2].Omega=2;V->WheelState[3].Omega=4;
    State.InitialShaftDifference=FMath::Abs(ShaftDifference(V));State.MaximumCoupling=0;Next(13);
  }break;
  case 13:
    State.MaximumCoupling=FMath::Max(State.MaximumCoupling,FMath::Abs(V->LastCenterCouplingNm));
    if(State.Time>.4f){
      Check(TEXT("locked center spends actual tire-solver reaction torque under unequal axle speed"),FMath::IsFinite(State.MaximumCoupling)&&State.MaximumCoupling>1,State.MaximumCoupling);
      Check(TEXT("locked center reduces the seeded front-rear mean shaft-speed difference"),FMath::IsFinite(ShaftDifference(V))&&FMath::Abs(ShaftDifference(V))<State.InitialShaftDifference,FMath::Abs(ShaftDifference(V)));
      Check(TEXT("center constraint does not secretly activate either axle locker"),!V->FrontLocked&&!V->RearLocked);
      Capture(TEXT("native-interface-center-locked-motion.png"));Next(14);
    }break;
  case 14:if(State.Time>.25f){
    V->SelectVehicle(0);V->ResetUpgrades(false);V->TeleportRoute(0);Stop(V);V->TestBrake=0;V->Throttle=.8f;V->Steer=.4f;V->Brake=0;
    V->Chassis->SetPhysicsLinearVelocity(V->GetActorForwardVector()*300);V->RouteTime=12.3f;
    const bool Handled=V->HandleMenuKey(EKeys::Escape);
    Check(TEXT("driving Escape handler opens the real pause menu instead of quitting"),Handled&&V->PauseMenuOpen&&UGameplayStatics::IsGamePaused(V));
    Check(TEXT("pause entry clears driving demand without deleting physical momentum"),V->Throttle==0&&V->Steer==0&&V->Brake==0&&V->Chassis->GetPhysicsLinearVelocity().Size()>250);
    State.PausedPosition=V->GetActorLocation();State.PausedRotation=V->GetActorQuat();State.PausedVelocity=V->Chassis->GetPhysicsLinearVelocity();
    State.PausedWorldTime=V->GetWorld()->GetTimeSeconds();State.PausedRouteTime=V->RouteTime;
    UE_LOG(LogTemp,Display,TEXT("TERRA_PAUSE_REQUEST position=%s velocity=%s worldTime=%.9f routeTime=%.9f"),
      *State.PausedPosition.ToString(),*State.PausedVelocity.ToString(),State.PausedWorldTime,State.PausedRouteTime);
    Next(150);
  }break;
  case 150:{
    // UWorld caches its pause decision before TG_PrePhysics. A pause requested
    // inside that tick does not cancel the frame's scheduled Chaos step. Start
    // the frozen-interval comparison on the following, fully paused frame.
    const FVector Position=V->GetActorLocation(),Velocity=V->Chassis->GetPhysicsLinearVelocity();
    UE_LOG(LogTemp,Display,TEXT("TERRA_PAUSE_FENCE requestPositionDeltaCM=%.9f requestVelocityDeltaCMPS=%.9f position=%s velocity=%s worldTime=%.9f routeTime=%.9f paused=%d"),
      (Position-State.PausedPosition).GetAbsMax(),(Velocity-State.PausedVelocity).GetAbsMax(),*Position.ToString(),*Velocity.ToString(),V->GetWorld()->GetTimeSeconds(),V->RouteTime,UGameplayStatics::IsGamePaused(V));
    State.PausedPosition=Position;State.PausedVelocity=Velocity;
    State.MaximumPausedPositionDelta=State.MaximumPausedVelocityDelta=0;State.PausedSamples=0;
    State.PausedRotationStable=V->GetActorQuat().Equals(State.PausedRotation,.0001f);
    State.PausedWorldStable=UGameplayStatics::IsGamePaused(V)&&V->GetWorld()->GetTimeSeconds()==State.PausedWorldTime;
    State.PausedRouteStable=V->RouteIndex==0&&V->RouteTime==State.PausedRouteTime;Next(15);
  }break;
  case 15:{
    const FVector Position=V->GetActorLocation(),Velocity=V->Chassis->GetPhysicsLinearVelocity();
    const float PositionDelta=(Position-State.PausedPosition).GetAbsMax(),VelocityDelta=(Velocity-State.PausedVelocity).GetAbsMax();
    State.MaximumPausedPositionDelta=FMath::Max(State.MaximumPausedPositionDelta,PositionDelta);
    State.MaximumPausedVelocityDelta=FMath::Max(State.MaximumPausedVelocityDelta,VelocityDelta);++State.PausedSamples;
    State.PausedRotationStable&=V->GetActorQuat().Equals(State.PausedRotation,.0001f);
    State.PausedWorldStable&=UGameplayStatics::IsGamePaused(V)&&V->GetWorld()->GetTimeSeconds()==State.PausedWorldTime;
    State.PausedRouteStable&=V->RouteIndex==0&&V->RouteTime==State.PausedRouteTime;
    UE_LOG(LogTemp,Display,TEXT("TERRA_PAUSE_SAMPLE sample=%d intervalSeconds=%.9f positionDeltaCM=%.9f velocityDeltaCMPS=%.9f position=%s velocity=%s worldTime=%.9f routeTime=%.9f paused=%d"),
      State.PausedSamples,State.Time,PositionDelta,VelocityDelta,*Position.ToString(),*Velocity.ToString(),V->GetWorld()->GetTimeSeconds(),V->RouteTime,UGameplayStatics::IsGamePaused(V));
    if(State.Time>.7f){
      Check(TEXT("pause freezes actual chassis position throughout fully paused frames"),State.PausedSamples>=2&&State.MaximumPausedPositionDelta<=.01f,State.MaximumPausedPositionDelta);
      Check(TEXT("pause freezes actual chassis rotation"),State.PausedRotationStable);
      Check(TEXT("pause preserves stored linear momentum throughout fully paused frames"),State.PausedSamples>=2&&State.MaximumPausedVelocityDelta<=.01f,State.MaximumPausedVelocityDelta);
      Check(TEXT("pause freezes active challenge clock"),State.PausedRouteStable);
      Check(TEXT("pause freezes world simulation time while the interface still renders"),State.PausedWorldStable&&Menu.IsValid()&&HUD->VisibleStatusIds.IsEmpty());
      Capture(TEXT("native-interface-pause-home.png"));Next(16);
    }
  }break;
  case 16:if(State.Time>.25f){if(!Menu.IsValid()){Check(TEXT("pause widget remains valid for settings"),false);Restore(V);return true;}Menu->ShowPage(1);Next(17);}break;
  case 17:if(State.Time>.4f){
    Check(TEXT("controls page opens inside pause while world remains frozen"),Menu.IsValid()&&Menu->ActivePage()==1&&UGameplayStatics::IsGamePaused(V));
    Capture(TEXT("native-interface-controls-default.png"));Next(18);
  }break;
  case 18:if(State.Time>.25f){
    FString Error;const FKey GarageBefore=V->ControlKey(A::Garage);
    Menu->BeginRebind(A::Garage);const bool CancelHandled=Key(*Menu,EKeys::Escape).IsEventHandled();
    Check(TEXT("Escape cancels key capture without leaving controls or changing the binding"),CancelHandled&&!Menu->IsRebinding()&&Menu->ActivePage()==1&&V->ControlKey(A::Garage)==GarageBefore&&V->PauseMenuOpen);
    Menu->BeginRebind(A::Garage);const bool BoundHandled=Key(*Menu,EKeys::B).IsEventHandled();
    Check(TEXT("actual Slate key capture changes garage to B and persists the key"),BoundHandled&&!Menu->IsRebinding()&&V->ControlKey(A::Garage)==EKeys::B&&V->ControlLabel(A::Garage)==TEXT("B"));
    Menu->BeginRebind(A::FourDrive);const FKey FourBefore=V->ControlKey(A::FourDrive);Key(*Menu,EKeys::B);
    Check(TEXT("duplicate key capture keeps the prior drive key and offers retry"),Menu->IsRebinding()&&V->ControlKey(A::FourDrive)==FourBefore&&V->ControlKey(A::Garage)==EKeys::B&&!Menu->BindingMessage().IsEmpty());
    Check(TEXT("reserved Escape cannot replace a driving control"),!V->RebindControl(A::Forward,EKeys::Escape,Error,false)&&V->ControlKey(A::Forward)==TerraControls::DefaultKey(A::Forward));
    Check(TEXT("fixed directional alternate cannot be stolen by an unrelated action"),!V->RebindControl(A::FourDrive,EKeys::Up,Error,false)&&V->ControlKey(A::FourDrive)==FourBefore);
    Check(TEXT("gamepad key cannot overwrite keyboard controls"),!V->RebindControl(A::FourDrive,EKeys::Gamepad_FaceButton_Top,Error,false)&&V->ControlKey(A::FourDrive)==FourBefore);
    Key(*Menu,EKeys::Escape);
    const FKey BeforeForward=V->ControlKey(A::Forward),BeforeCrawl=V->ControlKey(A::Crawl),BeforeDescent=V->ControlKey(A::DescentAssist);
    const bool HintKeys=V->RebindControl(A::Forward,EKeys::E,Error,false)&&V->RebindControl(A::Crawl,EKeys::H,Error,false)&&V->RebindControl(A::DescentAssist,EKeys::O,Error,false);
    bool CrawlHint=false,DescentHint=false;
    for(int I=0;I<V->Terrain->Routes.Num();++I){
      const auto Hint=V->Terrain->Routes[I].Hint;
      if(Hint.Contains(TEXT("Shift+W"))){V->TeleportRoute(I);CrawlHint=V->Notice.Contains(TEXT("H+E"))&&!V->Notice.Contains(TEXT("Shift+W"));}
      if(Hint.Contains(TEXT("K descent assist"))){V->TeleportRoute(I);DescentHint=V->Notice.Contains(TEXT("O descent assist"))&&!V->Notice.Contains(TEXT("K descent assist"));}
    }
    Check(TEXT("cooked crawl trail help uses current forward and crawl bindings"),HintKeys&&CrawlHint);
    Check(TEXT("cooked descent trail help uses the current descent-assist binding"),HintKeys&&DescentHint);
    const bool HintsRestored=V->RebindControl(A::Forward,BeforeForward,Error,false)&&V->RebindControl(A::Crawl,BeforeCrawl,Error,false)&&V->RebindControl(A::DescentAssist,BeforeDescent,Error,false);
    V->TeleportRoute(0);
    Check(TEXT("successful control save writes the full rebound map"),HintsRestored&&V->SaveControls(File(TEXT("controls-roundtrip.json"))));
    Check(TEXT("resetting defaults restores the standard garage key"),V->ResetControls(false)&&V->ControlKey(A::Garage)==TerraControls::DefaultKey(A::Garage));
    Check(TEXT("saved custom bindings reload independently of defaults"),V->LoadControls(File(TEXT("controls-roundtrip.json")))&&V->ControlKey(A::Garage)==EKeys::B);
    for(const TCHAR* Kind:{TEXT("unknown"),TEXT("duplicate"),TEXT("missing"),TEXT("fractional")})
      Check(FString::Printf(TEXT("invalid %s control data rejects atomically"),Kind),InvalidControlFixture(V,Kind));
    Next(19);
  }break;
  case 19:if(State.Time>.4f){Capture(TEXT("native-interface-controls-rebound.png"));Next(191);}break;
  case 191:if(State.Time>.25f){
    if(Menu->ControlsScrollBox().IsValid()&&Menu->ControlRow(A::CenterLock).IsValid())
      Menu->ControlsScrollBox()->ScrollDescendantIntoView(Menu->ControlRow(A::CenterLock),false,EDescendantScrollDestination::Center);
    Next(192);
  }break;
  case 192:if(State.Time>.5f){
    Check(TEXT("controls list scrolls actual center differential binding into view"),Menu->ControlsScrollBox().IsValid()&&Menu->ControlRow(A::CenterLock).IsValid()&&Menu->ControlsScrollBox()->GetScrollOffset()>0);
    Capture(TEXT("native-interface-controls-differentials.png"));Next(20);
  }break;
  case 20:if(State.Time>.25f){
    Key(*Menu,EKeys::Escape);Check(TEXT("Escape from controls returns to pause home"),Menu->ActivePage()==0&&V->PauseMenuOpen);
    Menu->ShowPage(2);TerraGraphics::Select(2,false);Next(21);
  }break;
  case 21:if(State.Time>.5f){
    Check(TEXT("graphics page opens without unpausing the game"),Menu->ActivePage()==2&&UGameplayStatics::IsGamePaused(V));
    const auto* Scale=IConsoleManager::Get().FindConsoleVariable(TEXT("r.ScreenPercentage"));
    Check(TEXT("graphics selection applies the actual renderer preset"),Scale&&FMath::IsNearlyEqual(Scale->GetFloat(),100.f)&&TerraGraphics::Preset()==2);
    Check(TEXT("graphics settings save separately from keyboard layout"),TerraGraphics::Save(File(TEXT("graphics-roundtrip.json"))));
    TerraGraphics::Select(0,false);
    Check(TEXT("graphics round trip restores selected preset"),TerraGraphics::Load(File(TEXT("graphics-roundtrip.json")))&&TerraGraphics::Preset()==2);
    const bool BadWritten=FFileHelper::SaveStringToFile(TEXT("{\"version\":1,\"preset\":9}"),*File(TEXT("graphics-invalid.json")));
    Check(TEXT("malformed graphics selection preserves active preset"),BadWritten&&!TerraGraphics::Load(File(TEXT("graphics-invalid.json")))&&TerraGraphics::Preset()==2);
    Capture(TEXT("native-interface-pause-graphics.png"));Next(22);
  }break;
  case 22:if(State.Time>.3f){
    Key(*Menu,EKeys::Escape);Check(TEXT("Escape from graphics returns to pause home"),Menu->ActivePage()==0&&V->PauseMenuOpen);
    Key(*Menu,EKeys::Escape);
    Check(TEXT("Escape from pause home resumes play instead of quitting"),!V->PauseMenuOpen&&!UGameplayStatics::IsGamePaused(V)&&!Menu->ExitWasRequested());
    Check(TEXT("resume clears held steering throttle and brake demands"),V->Throttle==0&&V->Steer==0&&V->Brake==0);
    Check(TEXT("custom garage binding survives a menu close"),V->ControlKey(A::Garage)==EKeys::B);
    V->TestThrottle=V->TestSteer=0;V->TestBrake=1;TerraGraphics::Select(State.OriginalGraphics,false);Next(23);
  }break;
  case 23:if(State.Time>.5f){
    Check(TEXT("resumed status bar reads the rebound garage key"),V->ControlLabel(A::Garage)==TEXT("B")&&HUD->VisibleStatusIds.Contains(TEXT("garage")));
    Capture(TEXT("native-interface-hud-rebound-key.png"));Next(24);
  }break;
  case 24:if(State.Time>.25f){
    Check(TEXT("reset defaults persists the complete standard layout"),V->ResetControls()&&V->ControlKey(A::Garage)==TerraControls::DefaultKey(A::Garage)&&V->LoadControls(V->ControlsPath()));
    V->SetGarage(true);Next(25);
  }break;
  case 25:if(State.Time>.5f){
    const auto Garage=V->GetGarageWidget();const bool Handled=Garage.IsValid()&&Garage->OnPreviewKeyDown(FGeometry(),FKeyEvent(EKeys::Escape,FModifierKeysState(),0,false,0,0)).IsEventHandled();
    Check(TEXT("Escape in the garage opens the same pause menu"),Handled&&V->PauseMenuOpen&&UGameplayStatics::IsGamePaused(V));Next(26);
  }break;
  case 26:if(State.Time>.5f){Capture(TEXT("native-interface-pause-from-garage.png"));Next(27);}break;
  case 27:if(State.Time>.25f){
    Menu=V->GetPauseMenuWidget();if(!Menu.IsValid()){Check(TEXT("exit action has a valid pause menu"),false);Restore(V);return true;}
    Menu->RequestExit();
    Check(TEXT("Exit Game button uses an explicit quit action"),Menu->ExitWasRequested());
    Check(TEXT("validation suppresses actual quit until results can be written"),V->AutoTest&&V->PauseMenuOpen&&UGameplayStatics::IsGamePaused(V));
    Next(28);
  }break;
  case 28:if(State.Time>.3f){
    V->SetPauseMenu(false);V->SetGarage(true);V->SelectVehicle(2);V->ResetUpgrades(false);
    V->SetUpgrade(TerraSim::Drivetrain,1,false);V->SetUpgrade(TerraSim::CenterDifferential,3,false);
    if(const auto Garage=V->GetGarageWidget())Garage->ShowUpgradePart(TerraSim::CenterDifferential);
    Next(29);
  }break;
  case 29:if(State.Time>.5f){
    const auto Garage=V->GetGarageWidget();const auto Row=Garage.IsValid()?Garage->UpgradePartWidget(TerraSim::CenterDifferential):nullptr;
    const auto Buttons=StageButtons(Row);
    Check(TEXT("compatible converted Civic shows the fitted stage-three center upgrade row"),Row.IsValid()&&V->UpgradeStage(TerraSim::CenterDifferential)==3&&V->HasCenterLocker()&&V->CenterLockUpgradeAvailable());
    Check(TEXT("compatible center upgrade row enables its stock and three real stage buttons"),Buttons.Total==4&&Buttons.Enabled==4,Buttons.Enabled);
    Check(TEXT("compatible center upgrade row is fully inside the visible scroll viewport"),UpgradeRowVisible(Garage,Row));
    Capture(TEXT("native-interface-center-upgrade.png"));Next(30);
  }break;
  case 30:if(State.Time>.25f){
    V->SelectVehicle(7);V->ResetUpgrades(false);
    if(const auto Garage=V->GetGarageWidget())Garage->ShowUpgradePart(TerraSim::CenterDifferential);
    Next(31);
  }break;
  case 31:if(State.Time>.5f){
    const auto Garage=V->GetGarageWidget();const auto Row=Garage.IsValid()?Garage->UpgradePartWidget(TerraSim::CenterDifferential):nullptr;
    const auto Buttons=StageButtons(Row);
    Check(TEXT("independent-motor G580 shows its stock incompatible center upgrade row"),Row.IsValid()&&V->UpgradeStage(TerraSim::CenterDifferential)==0&&!V->HasCenterLocker()&&!V->CenterLockUpgradeAvailable());
    Check(TEXT("incompatible center upgrade row enables only the stock stage button"),Buttons.Total==4&&Buttons.Enabled==1,Buttons.Enabled);
    Check(TEXT("incompatible center upgrade row is fully inside the visible scroll viewport"),UpgradeRowVisible(Garage,Row));
    Capture(TEXT("native-interface-center-incompatible.png"));Next(32);
  }break;
  case 32:if(State.Time>.3f){Restore(V);Check(TEXT("interface fixture completes and restores prior runtime setup"),!V->PauseMenuOpen&&!UGameplayStatics::IsGamePaused(V)&&V->VehicleIndex==State.OriginalVehicle);return true;}break;
  default:Check(TEXT("interface fixture has a valid phase"),false);Restore(V);return true;
  }
  return false;
}
}
