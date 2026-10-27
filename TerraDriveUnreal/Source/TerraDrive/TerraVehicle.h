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
class URectLightComponent;
class UMaterialInstanceDynamic;
class UPhysicalMaterial;
class UProceduralMeshComponent;
struct FTerraWheel {
  float Omega = 0, Rotation = 0, Load = 0, Slip = 0, Distance = .4f,
        Pressure = 35;
  FVector Contact, Center;
  FTerraSample Ground;
  FVector ForceForward, ForceSide, PointVelocity;
  float LongSpeed = 0, LateralSpeed = 0, Angle = 0, Grip = 0,
        Footprint = .14f, RutDepth = 0, FrictionLimit = 0;
  bool ContactValid = false, Constructed = false;
  FVector LastSoil=FVector::ZeroVector,LastSoilForward=FVector::ForwardVector;
  float SoilLoad=0,SoilSlip=0,LastSoilLoad=0,LastSoilSlip=0;
  bool SoilConnected=false;
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
  UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> FrontCollision;
  UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> RearCollision;
  UPROPERTY(VisibleAnywhere) TObjectPtr<UProceduralMeshComponent> CoachworkCollision;
  int CoachworkHullCount=0;
  bool CoachworkCollisionReady=false;
  FString CoachworkCollisionSource;
  UPROPERTY() TObjectPtr<UPhysicalMaterial> UndertrayMaterial;
  UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Body;
  UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> CameraArm;
  UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
  UPROPERTY() TObjectPtr<ATerraWorld> Terrain;
  UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> Wheels;
  UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> Rims;
  UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> HubDetails;
  UPROPERTY() TArray<TObjectPtr<URectLightComponent>> GarageLights;
  UPROPERTY() TArray<TObjectPtr<UInstancedStaticMeshComponent>> SprayMeshes;
  UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> SuspensionParts;
  UPROPERTY() TObjectPtr<UStaticMeshComponent> Protection;
  UPROPERTY() TObjectPtr<UStaticMeshComponent> TrailEquipment;
  FTerraWheel WheelState[4];
  FString VehicleName, SurfaceName, Notice;
  float Mass = 2100, Speed = 0, RPM = 700, Steer = 0, Throttle = 0, Brake = 0,
        Pressure = 35, Damage = 0, WinchTension = 0;
  bool Tracks = false, FourDrive = true, LowRange = false,
       WinchAttached = false, Reeling = false, Garage = false;
  bool FrontLocked = false, RearLocked = false, Overturned = false,
       DescentAssist = false;
  int ContactCount = 0, RouteIndex = -1, GateIndex = 0;
  int TerrainBodyHits=0,ObjectBodyHits=0;
  float TerrainImpactMPS=0,ObjectImpactMPS=0;
  float RouteTime = 0, LastTireForceN = 0;
  FString RouteStatus;
  int SprayEmitted = 0, SprayExpired = 0;
  float SprayTravelCM = 0;
  int SprayCount() const { return Parcels.Num(); }
  int VehicleIndex = 0, Zone = 0, Gear = 0, Direction = 1, EngineUpgrade = 0,
      LiftUpgrade = 0;
  bool AutoTest = false, Initialized = false;
  float TestThrottle = 0, TestSteer = 0, TestBrake = 0;
  bool TestDriverInput=false, TestForward=false, TestReverse=false, TestStop=false;
  bool TestMarkCamera=false;
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
  void OrbitGarageCamera(float YawDelta,float PitchDelta);
  void ZoomGarageCamera(float Steps);
  void SetGarageView(int View);
  void UpdateWheelVisuals();
  FVector GarageViewState() const { return FVector(GarageYaw,GaragePitch,GarageDistance); }
  float ExpectedRideHeight() const { return CG+Tuning.Lift+Radius-Number(TEXT("tireRadius"),.42f); }
  float BumpTravel(bool Front) const;
  void ResetContactTelemetry() { TerrainBodyHits=ObjectBodyHits=0;TerrainImpactMPS=ObjectImpactMPS=0;NextBodyDiagnosticTime=0; }
  static constexpr int VehicleCount=6;
  TerraSim::UpgradeSetup Builds[VehicleCount];
  UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> BrakeLamps;
  UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> ReverseLamps;
  float BrakeLampLevel=0,ReverseLampLevel=0;
  void UpdateLamps();
  void ConfigureLamps();
  TerraSim::UpgradeTuning Tuning;

private:
  void ConfigureCoachworkCollision();
  float NextBodyDiagnosticTime=0;
  TSharedPtr<FJsonObject> Spec;
  TArray<FTerraParcel> Parcels;
  FVector Anchor;
  FVector PreviousRoutePosition;
  bool NearCamera = false;
  bool ReverseReleaseRequired=false;
  float GarageYaw=145,GaragePitch=-12,GarageDistance=1050;
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
  void CreateVisualDetails();
  void UpdateVisualDetails();
  void SaveSetup();
  void UpdateRoute(float Dt);
};
