#include "TerraPlayerController.h"
#include "InputKeyEventArgs.h"

bool ATerraPlayerController::InputKey(const FInputKeyEventArgs& Params){
  // Releases and stick drift should keep the device the player last used.
  if(Params.Event==IE_Pressed||(Params.Event==IE_Axis&&FMath::Abs(Params.AmountDepressed)>.075f))
    bGamepadActive=Params.IsGamepad();
  return Super::InputKey(Params);
}
