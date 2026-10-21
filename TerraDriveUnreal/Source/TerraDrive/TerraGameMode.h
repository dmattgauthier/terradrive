#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/HUD.h"
#include "TerraGameMode.generated.h"
UCLASS()
class TERRADRIVE_API ATerraHUD : public AHUD {
  GENERATED_BODY()
public:
  virtual void DrawHUD() override;
};
UCLASS()
class TERRADRIVE_API ATerraGameMode : public AGameModeBase {
  GENERATED_BODY()
public:
  ATerraGameMode();
  virtual void BeginPlay() override;
  virtual void Tick(float Dt) override;

private:
  float TestTime = 0, StageTime = 0;
  int Stage = 0;
  FVector Start;
  float OpenProgress = 0, MaxProgress = 0;
  float StockUpgradeSpeed = 0, StockUpgradeDistance = 0;
  float StockFootprint = 0, StockTerrainGrip = 0;
  bool InvertedContactSeen = false;
  TArray<FString> Results;
  bool Captured = false;
  void FinishValidation();
};
