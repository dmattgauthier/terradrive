#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "TerraWorld.h"
#include "TerraUpgrades.h"
#include "TerraVehicle.generated.h"
class UBoxComponent;
class UStaticMeshComponent;
class USpringArmComponent;
class UCameraComponent;
class UInstancedStaticMeshComponent;
class STerraGarage;
struct FTerraWheel {
  float Omega = 0, Rotation = 0, Load = 0, Slip = 0, Distance = .4f,
        Pressure = 35;
  FVector Contact, Center;
  FTerraSample Ground;
  FVector ForceForward, ForceSide, PointVelocity;
  float LongSpeed = 0, LateralSpeed = 0, Angle = 0;
  bool ContactValid = false, Constructed = false;
};
struct FTerraParcel {
  FVector P, V;
  float Age = 0, Life = 2, Radius = 2;
  uint8 Kind = 0;
};
UCLASS()
class TERRADRIVE_API ATerraVehicle : public APawn {
  GENERATED_BODY()
public:
  ATerraVehicle();
  virtual void BeginPlay() override;
  virtual void Tick(float Dt) override;
  void SelectVehicle(int Index);
  void TeleportZone(int Index);
  void TeleportRoute(int Index);
  void ToggleLocker(bool Front);
  UFUNCTION()
  void OnBodyHit(UPrimitiveComponent *Hit, UPrimitiveComponent *Other,
                 FVector Impulse, const FHitResult &Result);
  // Actual OnComponentHit includes the other actor argument.
  UFUNCTION()
  void BodyHit(UPrimitiveComponent *Hit, AActor *OtherActor,
               UPrimitiveComponent *Other, FVector Impulse,
               const FHitResult &Result);
  UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Chassis;
  UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> RoofCollision;
  UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Body;
  UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> CameraArm;
  UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
  UPROPERTY() TObjectPtr<ATerraWorld> Terrain;
  UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> Wheels;
  UPROPERTY() TArray<TObjectPtr<UInstancedStaticMeshComponent>> SprayMeshes;
  FTerraWheel WheelState[4];
  FString VehicleName, SurfaceName, Notice;
  float Mass = 2100, Speed = 0, RPM = 700, Steer = 0, Throttle = 0, Brake = 0,
        Pressure = 35, Damage = 0, WinchTension = 0;
  bool Tracks = false, FourDrive = true, LowRange = false,
       WinchAttached = false, Reeling = false, Garage = false;
  bool FrontLocked = false, RearLocked = false, Overturned = false,
       DescentAssist = false;
  int ContactCount = 0, RouteIndex = -1, GateIndex = 0;
  float RouteTime = 0, LastTireForceN = 0;
  FString RouteStatus;
  int SprayEmitted = 0, SprayExpired = 0;
  float SprayTravelCM = 0;
  int SprayCount() const { return Parcels.Num(); }
  int VehicleIndex = 0, Zone = 0, Gear = 0, Direction = 1, EngineUpgrade = 0,
      LiftUpgrade = 0;
  bool AutoTest = false, Initialized = false;
  float TestThrottle = 0, TestSteer = 0, TestBrake = 0;
  void SetTracks(bool Enabled);
  void SetGarage(bool Open);
  void SetUpgrade(int Part, int Stage, bool Persist = true);
  void ResetUpgrades(bool Persist = true);
  void ApplyUpgrades();
  bool LoadGarage(const FString &Path);
  bool SaveGarage(const FString &Path) const;
  FString GaragePath() const;
  FString UpgradeEffect(int Part) const;
  FString UpgradeName(int Part) const;
  FString UpgradeDescription(int Part) const;
  int UpgradeStage(int Part) const { return Builds[VehicleIndex].Stage[Part]; }
  bool HasElectrical() const { return VehicleIndex != 2; }
  float PowerHP() const { return Power/745.7f*Tuning.Power*Tuning.ElectricalPower; }
  float SuspensionTravel() const { return .46f+Tuning.Travel; }
  float TireDiameter() const { return Radius*200/2.54f; }
  float GripMultiplier() const { return Tuning.Grip; }
  float WheelInertia() const { return 3*Tuning.WheelInertia; }
  float ImpactDamage(float Impulse) const;
  TerraSim::UpgradeSetup Builds[5];
  TerraSim::UpgradeTuning Tuning;

private:
  TSharedPtr<FJsonObject> Spec;
  TArray<FTerraParcel> Parcels;
  FVector Anchor;
  FVector PreviousRoutePosition;
  bool NearCamera = false;
  TSharedPtr<STerraGarage> GarageWidget;
  int LastVehicle = 0;
  float TireVisualScale = 1, WidthVisualScale = 1, Droop = .16f;
  float WinchLength = 0, ReverseHold = 0, SpawnCooldown = 1, CameraYaw = 0,
        CameraPitch = -16, SoilTimer = 0, SprayBudget[4] = {0, 0, 0, 0};
  float Radius = .42f, Width = .285f, Wheelbase = 3, Track = 1.63f, CG = .76f,
        FrontWeight = .53f, Spring = 32000, Damping = 3900, Rest = .41f,
        Power = 210000;
  float Number(const TCHAR *Name, float Default = 0) const;
  void Input(float Dt);
  void Simulate(float Dt);
  void UpdateSpray(float Dt);
  void SaveSetup();
  void UpdateRoute(float Dt);
};
