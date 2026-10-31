#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/HUD.h"
#include "TerraGameMode.generated.h"
class UBoxComponent;
class ACameraActor;
UCLASS()
class TERRADRIVE_API ATerraHUD : public AHUD {
  GENERATED_BODY()
public:
  virtual void DrawHUD() override;
  // Recorded by the actual draw pass for native viewport/layout acceptance.
  TArray<FString> VisibleStatusIds;
  float LastStatusBottom=0;
private:
  FString LastNotice;
  double NoticeChangedAt=0;
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
  bool LockerDriving=false;
  float LockerDriveTime=0,LockerPeakLateral=0,LockerOpenPeakLateral=0,LockerPeakYaw=0;
  int LockerSampleSecond=-1;
  float LockerBodyEdge=0,LockerTireEdge=0,LockerClearance=10000,LockerOpenClearance=10000;
  int LockerGeometrySamples=0,LockerOpenGeometrySamples=0;
  int LockerPostSamples=0,LockerOpenPostSamples=0,LockerPostOverlaps=0,LockerOpenPostOverlaps=0;
  TArray<FVector> LockerPostBases;
  bool LockerGeometryFinite=true,LockerOpenGeometryFinite=true;
  FVector LockerWorstPosition=FVector::ZeroVector;
  FRotator LockerWorstRotation=FRotator::ZeroRotator;
  float StockUpgradeSpeed = 0, StockUpgradeDistance = 0;
  float StockFootprint = 0, StockTerrainGrip = 0;
  bool InvertedContactSeen = false;
  int BrakeVehicle=0,ModelVehicle=0,ModelView=0;
  float BrakeEntrySpeed=0,StockRideHeight=0;
  UPROPERTY() TObjectPtr<UBoxComponent> BrakeRamp;
  FVector GarageCameraBefore;
  TArray<FString> Results;
  bool Captured = false;
  int SoilScenario=0;
  TArray<TWeakObjectPtr<class UInstancedStaticMeshComponent>> RockViews;
  double RenderSampleStart=0,RenderSampleSeconds=0;
  int RenderFrames=0;
  float TrailMaximumError=0;
  int TrailClosestSample=0;
  TArray<FVector> SoilProbes;
  UPROPERTY() TObjectPtr<ACameraActor> SoilCamera;
  void FinishValidation();
};
