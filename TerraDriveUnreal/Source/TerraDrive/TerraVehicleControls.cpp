#include "TerraVehicle.h"
#include "TerraPauseMenu.h"
#include "TerraGarage.h"
#include "TerraGraphics.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"

FString ATerraVehicle::ControlsPath()const{
  FString Path=FPaths::ProjectSavedDir()/(AutoTest?TEXT("Validation/controls-settings.json"):TEXT("controls-settings.json"));
  FParse::Value(FCommandLine::Get(),TEXT("TerraControls="),Path);return Path;
}
bool ATerraVehicle::LoadControls(const FString& Path){return Controls.Load(Path);}
bool ATerraVehicle::SaveControls(const FString& Path)const{return Controls.Save(Path);}
bool ATerraVehicle::ResetControls(bool Persist){
  const auto Before=Controls;Controls.Reset();
  if(Persist&&!SaveControls(ControlsPath())){Controls=Before;return false;}return true;
}
bool ATerraVehicle::RebindControl(TerraControls::Action Action,FKey Key,FString& Error,bool Persist){
  const auto Before=Controls;
  if(!Controls.Assign(Action,Key,Error))return false;
  if(Persist&&!SaveControls(ControlsPath())){Controls=Before;Error=TEXT("Controls could not be saved. The previous binding has been kept.");return false;}
  return true;
}
bool ATerraVehicle::ControlDown(TerraControls::Action Action)const{
  const auto* PC=Cast<APlayerController>(GetController());return PC&&PC->IsInputKeyDown(ControlKey(Action));
}
bool ATerraVehicle::ControlPressed(TerraControls::Action Action)const{
  const auto* PC=Cast<APlayerController>(GetController());return PC&&PC->WasInputKeyJustPressed(ControlKey(Action));
}
bool ATerraVehicle::HandleMenuKey(FKey Key){
  if(Key==EKeys::Escape){SetPauseMenu(true);return true;}
  if(Key==EKeys::Tab||Key==ControlKey(TerraControls::Action::Garage)){SetGarage(!Garage);return true;}
  return false;
}
void ATerraVehicle::SetPauseMenu(bool Open){
  if(Open==PauseMenuOpen)return;
  auto* PC=Cast<APlayerController>(GetController());
  if(!PC||!GEngine||!GEngine->GameViewport)return;
  if(Open){
    // Preserve velocities and pose: pausing is not a hidden brake or recovery.
    if(!PC->SetPause(true)){Notice=TEXT("Pause is unavailable right now");return;}
    Throttle=Brake=Steer=0;Reeling=false;
    PauseMenuWidget=SNew(STerraPauseMenu).Vehicle(this);
    GEngine->GameViewport->AddViewportWidgetContent(PauseMenuWidget.ToSharedRef(),100);
    PauseMenuOpen=true;PC->bShowMouseCursor=true;
    if(!AutoTest)SaveGarage(GaragePath());
    TerraGraphics::Tick(true,false);
    FInputModeUIOnly Mode;Mode.SetWidgetToFocus(PauseMenuWidget).SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);PC->SetInputMode(Mode);
    FSlateApplication::Get().SetKeyboardFocus(PauseMenuWidget);
  }else{
    if(PauseMenuWidget.IsValid())GEngine->GameViewport->RemoveViewportWidgetContent(PauseMenuWidget.ToSharedRef());
    PauseMenuWidget.Reset();PauseMenuOpen=false;
    PC->FlushPressedKeys();RequireControlRelease=true;
    ReverseHold=0;ReverseReleaseRequired=false;Throttle=Brake=Steer=0;Reeling=false;
    PC->SetPause(false);
    TerraGraphics::Tick(Garage,false);
    if(Garage&&GarageWidget.IsValid()){
      PC->bShowMouseCursor=true;FInputModeGameAndUI Mode;Mode.SetWidgetToFocus(GarageWidget).SetHideCursorDuringCapture(false).SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);PC->SetInputMode(Mode);
      FSlateApplication::Get().SetKeyboardFocus(GarageWidget);
    }else{
      PC->bShowMouseCursor=false;PC->SetInputMode(FInputModeGameOnly());FSlateApplication::Get().SetAllUserFocusToGameViewport();
    }
  }
}
