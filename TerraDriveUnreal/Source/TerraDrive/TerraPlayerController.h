#pragma once
#include "GameFramework/PlayerController.h"
#include "TerraPlayerController.generated.h"

UCLASS()
class ATerraPlayerController : public APlayerController {
  GENERATED_BODY()
public:
  bool InputKey(const FInputKeyEventArgs& Params) override;
  bool UsesGamepad() const { return bGamepadActive; }

private:
  bool bGamepadActive=false;
};
