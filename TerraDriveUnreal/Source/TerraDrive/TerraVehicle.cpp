#include "TerraVehicle.h"
#include "ProceduralMeshComponent.h"
#include "TerraSimCore.h"
#include "TerraContact.h"
#include "TerraCenter.h"
#include "TerraTandem.h"
#include "TerraDriving.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "DrawDebugHelpers.h"
#include "Engine/World.h"
#include "Engine/OverlapResult.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/Parse.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "PhysicalMaterials/PhysicalMaterial.h"
#include "PhysicsEngine/BodyInstance.h"
#include "PhysicsEngine/PhysicsSettings.h"
#include "ProfilingDebugging/CpuProfilerTrace.h"

float ATerraVehicle::Number(const TCHAR *Name, float Default) const {
  double N = Default;
  if (Spec)
    Spec->TryGetNumberField(Name, N);
  return N;
}
ATerraVehicle::ATerraVehicle() {
  PrimaryActorTick.bCanEverTick = true;
  PrimaryActorTick.TickGroup = TG_PrePhysics;
  Chassis = CreateDefaultSubobject<UBoxComponent>(TEXT("ChaosChassis"));
  RootComponent = Chassis;
  Chassis->InitBoxExtent(FVector(190, 83, 24));
  Chassis->SetCollisionProfileName(TEXT("PhysicsActor"));
  Chassis->SetSimulatePhysics(true);
  Chassis->SetNotifyRigidBodyCollision(true);
  Chassis->SetLinearDamping(.02f);
  Chassis->SetAngularDamping(.6f);
  Chassis->SetUseCCD(true);
  RoofCollision = CreateDefaultSubobject<UBoxComponent>(TEXT("CabinCollision"));
  RoofCollision->SetupAttachment(Chassis);
  RoofCollision->InitBoxExtent(FVector(120,65,45));
  RoofCollision->SetRelativeLocation(FVector(0,0,40));
  RoofCollision->SetCollisionProfileName(TEXT("PhysicsActor"));
  RoofCollision->BodyInstance.bAutoWeld = true;
  // Vehicle mass already includes the cabin. Its extra collision shape must
  // not add an automatically computed second mass to the welded rigid body.
  RoofCollision->BodyInstance.SetMassOverride(.001f,true);
  FrontCollision=CreateDefaultSubobject<UBoxComponent>(TEXT("FrontApproachCollision"));
  FrontCollision->SetupAttachment(Chassis);
  FrontCollision->SetCollisionProfileName(TEXT("PhysicsActor"));
  FrontCollision->SetNotifyRigidBodyCollision(true);
  FrontCollision->BodyInstance.bAutoWeld=true;
  FrontCollision->BodyInstance.SetMassOverride(.001f,true);
  RearCollision=CreateDefaultSubobject<UBoxComponent>(TEXT("RearDepartureCollision"));
  RearCollision->SetupAttachment(Chassis);
  RearCollision->SetCollisionProfileName(TEXT("PhysicsActor"));
  RearCollision->SetNotifyRigidBodyCollision(true);
  RearCollision->BodyInstance.bAutoWeld=true;
  RearCollision->BodyInstance.SetMassOverride(.001f,true);
  CoachworkCollision=CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("CoachworkCollision"));
  CoachworkCollision->SetupAttachment(Chassis);
  CoachworkCollision->SetCollisionProfileName(TEXT("PhysicsActor"));
  CoachworkCollision->SetNotifyRigidBodyCollision(true);
  CoachworkCollision->bUseComplexAsSimpleCollision=false;
  CoachworkCollision->bUseAsyncCooking=false;
  CoachworkCollision->BodyInstance.bAutoWeld=true;
  CoachworkCollision->BodyInstance.SetMassOverride(.001f,true);
  CoachworkCollision->SetHiddenInGame(true);
  Body = CreateDefaultSubobject<UStaticMeshComponent>(
      TEXT("OriginalVehicleModel"));
  Body->SetupAttachment(Chassis);
  Body->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
  Body->SetCollisionResponseToAllChannels(ECR_Ignore);
  Protection=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("UpgradeArmor"));
  Protection->SetupAttachment(Chassis);
  Protection->SetCollisionEnabled(ECollisionEnabled::NoCollision);
  TrailEquipment=CreateDefaultSubobject<UStaticMeshComponent>(TEXT("TrailEquipment"));
  TrailEquipment->SetupAttachment(Chassis);
  TrailEquipment->SetCollisionEnabled(ECollisionEnabled::NoCollision);
  for (int I = 0; I < 4; I++) {
    auto *W = CreateDefaultSubobject<UStaticMeshComponent>(
        *FString::Printf(TEXT("Wheel%d"), I));
    W->SetupAttachment(Chassis);
    W->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Wheels.Add(W);
    auto *Rim=CreateDefaultSubobject<UStaticMeshComponent>(*FString::Printf(TEXT("FactoryRim%d"),I));
    Rim->SetupAttachment(Chassis);Rim->SetCollisionEnabled(ECollisionEnabled::NoCollision);Rims.Add(Rim);
  }
  CameraArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("ChaseArm"));
  CameraArm->SetupAttachment(Chassis);
  // Keep the chase horizon upright when the physics chassis pitches or rolls.
  // With relative rotation, the spring arm's inherit flags reinterpret a world
  // rotation as local angles and can put the camera below sloping terrain.
  CameraArm->SetUsingAbsoluteRotation(true);
  CameraArm->TargetArmLength = 1150;
  CameraArm->SetRelativeLocation(FVector(0, 0, 110));
  CameraArm->bInheritPitch = false;
  CameraArm->bInheritRoll = false;
  CameraArm->bInheritYaw = false;
  CameraArm->bEnableCameraLag = true;
  CameraArm->CameraLagSpeed = 5;
  CameraArm->ProbeSize = 18;
  Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
  Camera->SetupAttachment(CameraArm, USpringArmComponent::SocketName);
  Camera->FieldOfView = 64;
  AutoPossessPlayer = EAutoReceiveInput::Player0;
}
void ATerraVehicle::BeginPlay() {
  Super::BeginPlay();
  for (TActorIterator<ATerraWorld> I(GetWorld()); I; ++I) {
    Terrain = *I;
    break;
  }
  Chassis->OnComponentHit.AddDynamic(this, &ATerraVehicle::BodyHit);
  FrontCollision->OnComponentHit.AddDynamic(this,&ATerraVehicle::BodyHit);
  RearCollision->OnComponentHit.AddDynamic(this,&ATerraVehicle::BodyHit);
  CoachworkCollision->OnComponentHit.AddDynamic(this,&ATerraVehicle::BodyHit);
  AutoTest = FParse::Param(FCommandLine::Get(), TEXT("TerraValidate"));
  LoadControls(ControlsPath());
  // Tires supply terrain grip. A grounded metal/plastic undertray should
  // slide over a crest rather than behaving like a second high-friction tire.
  // Normal collision impulses remain active against terrain and solid props.
  UndertrayMaterial=NewObject<UPhysicalMaterial>(this,TEXT("UndertraySlidingMaterial"));
  UndertrayMaterial->Friction=.10f;UndertrayMaterial->StaticFriction=.12f;
  UndertrayMaterial->bOverrideFrictionCombineMode=true;
  UndertrayMaterial->FrictionCombineMode=EFrictionCombineMode::Min;
  UndertrayMaterial->Restitution=0;
  Chassis->SetPhysMaterialOverride(UndertrayMaterial);
  FrontCollision->SetPhysMaterialOverride(UndertrayMaterial);
  RearCollision->SetPhysMaterialOverride(UndertrayMaterial);
  RoofCollision->SetPhysMaterialOverride(UndertrayMaterial);
  CoachworkCollision->SetPhysMaterialOverride(UndertrayMaterial);
  CreateVisualDetails();
  SelectVehicle(0);
  TeleportZone(0);
  auto *Sphere = LoadObject<UStaticMesh>(
      nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
  auto *Cube=LoadObject<UStaticMesh>(nullptr,TEXT("/Engine/BasicShapes/Cube.Cube"));
  auto *Clod=LoadObject<UStaticMesh>(nullptr,TEXT("/Game/Meshes/detail_soil_clod"));
  FString Names[] = {TEXT("mud"), TEXT("water"), TEXT("snow"), TEXT("sand"),TEXT("stone"),TEXT("grass")};
  for (const FString &N : Names) {
    auto *M = NewObject<UInstancedStaticMeshComponent>(this);
    M->SetupAttachment(RootComponent);
    M->SetAbsolute(true, true, true);
    M->SetStaticMesh(N==TEXT("grass")?Cube:(N==TEXT("mud")||N==TEXT("stone"))&&Clod?Clod:Sphere);
    M->SetMaterial(0, LoadObject<UMaterialInterface>(
                          nullptr, *(TEXT("/Game/Materials/Spray_") + N)));
    M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    M->SetMobility(EComponentMobility::Movable);
    M->SetCastShadow(false);
    M->RegisterComponent();
    M->SetWorldTransform(FTransform::Identity);
    SprayMeshes.Add(M);
  }
  if (auto *PC = Cast<APlayerController>(GetController())) {
    PC->SetViewTarget(this);
    PC->bShowMouseCursor = false;
  }
}
void ATerraVehicle::SelectVehicle(int Index, bool StoreCurrentProfile) {
  if (!Terrain || !Terrain->Data)
    return;
  auto &List = Terrain->Data->GetArrayField(TEXT("vehicles"));
  const int PreviousRoute = RouteIndex;
  Terrain->BreakTireMarks();
  if(StoreCurrentProfile&&Spec.IsValid()&&Initialized){
    PressureProfiles[VehicleIndex]=PressureTarget;
    BatteryProfiles[VehicleIndex]=BatterySOC;
    FuelProfiles[VehicleIndex]=FuelFraction;
  }
  VehicleIndex = (Index + List.Num()) % List.Num();
  Spec = List[VehicleIndex]->AsObject();
  ResizeWheelComponents();
  VehicleName = Spec->GetStringField(TEXT("name"));
  FString Asset = Spec->GetStringField(TEXT("asset"));
  Body->SetStaticMesh(LoadObject<UStaticMesh>(
      nullptr, *(TEXT("/Game/Meshes/") + Asset + TEXT("_body"))));
  ConfigureLamps();
  Protection->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,*(TEXT("/Game/Meshes/")+Asset+TEXT("_armor"))));
  TrailEquipment->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,*(TEXT("/Game/Meshes/")+Asset+TEXT("_equipment"))));
  Mass = Number(TEXT("mass"), 2100);
  Radius = Number(TEXT("tireRadius"), .42);
  Width = Number(TEXT("tireWidth"), .285);
  Wheelbase = Number(TEXT("wheelbase"), 3);
  Track = Number(TEXT("track"), 1.63);
  CG = Number(TEXT("cgHeight"), .76);
  FrontWeight = Number(TEXT("frontWeightFraction"), .53);
  Power = Number(TEXT("powerHP"), 285) * 745.7f;
  auto Suspension = Spec->GetObjectField(TEXT("suspension"));
  Spring = Suspension->GetNumberField(TEXT("springRate"));
  Damping = Suspension->GetNumberField(TEXT("damping"));
  Rest = Suspension->GetNumberField(TEXT("restLength"));
  Pressure = PressureTarget=PressureProfiles[VehicleIndex]>0?PressureProfiles[VehicleIndex]:Number(TEXT("stockPSIFront"),Number(TEXT("stockPSI"),35));
  BatterySOC=BatteryProfiles[VehicleIndex];TireAirRequested=false;LastRegenPowerW=0;
  FuelFraction=FuelProfiles[VehicleIndex];LastFuelGPH=LastElectricDrawW=0;
  BatteryEnergyRemainder=FuelEnergyRemainder=0;
  for(int I=0;I<MaxWheels;++I)LastWheelDriveNm[I]=LastWheelRegenNm[I]=0;
  const float Length=Number(TEXT("bodyLength"),Number(TEXT("length"),4.8f));
  const float HalfWidth=Number(TEXT("bodyWidthM"),Number(TEXT("width"),1.8f))*.42f;
  const float HalfHeight=VehicleIndex==5?CG-Number(TEXT("clearance"),.158f):.22f;
  const float BellyLength=FMath::Min(Length*.36f,Wheelbase*.54f);
  Chassis->SetBoxExtent(FVector(BellyLength,HalfWidth,HalfHeight)*100);
  // The central undertray ends near the axles. Raised approach/departure
  // boxes retain full-length object collisions without a square low bumper
  // catching a gentle hill before the front tire reaches it.
  const float End=Length*.46f,EndStart=BellyLength-.08f;
  const float Rise=FMath::Min(.16f,HalfHeight*.55f);
  for(int I=0;I<2;++I){
    auto *C=I==0?FrontCollision.Get():RearCollision.Get();
    const float BodyEnd=Number(I==0?TEXT("bodyFrontEndM"):TEXT("bodyRearEndM"),End);
    C->SetBoxExtent(FVector(FMath::Max(.05f,(BodyEnd-EndStart)*.5f),HalfWidth,HalfHeight-Rise*.5f)*100);
    C->SetRelativeLocation(FVector((I==0?1.f:-1.f)*(BodyEnd+EndStart)*.5f,0,Rise*.5f)*100);
  }
  Chassis->SetMassOverrideInKg(NAME_None, Mass);
  RoofCollision->SetBoxExtent(FVector(Number(TEXT("length"),4.8)*.30f,
      Number(TEXT("width"),1.8)*.33f,Number(TEXT("height"),1.8)*.28f)*100);
  RoofCollision->SetRelativeLocation(FVector(0,0,(Number(TEXT("height"),1.8)*.62f-CG)*100));
  ConfigureCoachworkCollision();
  Chassis->SetMassOverrideInKg(NAME_None,Mass);
  Chassis->SetCenterOfMass(FVector::ZeroVector);
  RepairDamage();
  Gear = 0;
  Direction = 1;
  ReverseReleaseRequired=false;ReverseHold=0;
  Steer = 0;
  Tracks = false;
  FrontLocked = RearLocked = CenterLocked = DescentAssist = LowRange = false;
  FourDrive = VehicleIndex != 2 && VehicleIndex != 3;
  for (auto W : Wheels)
    W->SetStaticMesh(LoadObject<UStaticMesh>(
        nullptr, *(TEXT("/Game/Meshes/") + Asset + TEXT("_tire"))));
  for(auto Rim:Rims)Rim->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,*(TEXT("/Game/Meshes/")+Asset+TEXT("_rim"))));
  if(SuspensionParts.Num()==WheelCount()*4+AxleCount()*2){
    auto *SpringMesh=LoadObject<UStaticMesh>(nullptr,VehicleIndex==4?TEXT("/Game/Meshes/detail_airstrut"):TEXT("/Game/Meshes/detail_coil"));
    for(int I=0;I<WheelCount();++I)SuspensionParts[I*4+2]->SetStaticMesh(SpringMesh);
  }
  for (auto &W : WheelState)
    W = FTerraWheel();
  ApplyUpgrades();
  FourDrive=HasFourDrive();
  Notice = VehicleName;
  if(PreviousRoute>=0)TeleportRoute(PreviousRoute);else TeleportZone(Zone);
  if(Garage)ApplyUpgrades();
  if(Garage)GarageDistance=FMath::Clamp(Number(TEXT("length"),4.8f)*215,950.f,1450.f);
  if(!AutoTest&&Initialized)SaveGarage(GaragePath());
}
void ATerraVehicle::SetTracks(bool Enabled) {
  if(Enabled&&UpgradeStage(TerraSim::TireSize)>0){
    Notice=TEXT("Return TIRE DIAMETER to DEFAULT in the garage before fitting tracks. Your tire kit is unchanged.");return;
  }
  if (VehicleIndex == 2||WheelCount()==6||Number(TEXT("monsterTruck"),0)>0) {
    Notice = Number(TEXT("monsterTruck"),0)>0?TEXT("The monster chassis retains its 66-inch wheels; standard track pods do not fit"):WheelCount()==6?TEXT("Individual track pods are unavailable for the tandem chassis"):TEXT("Tracks unavailable for the Civic");
    return;
  }
  if (FMath::Abs(Speed) > .5f) {
    Notice = TEXT("Stop before changing running gear");
    return;
  }
  Tracks = Enabled;
  if (Tracks&&HasFourDrive())
    FourDrive = true;
  FString Asset = Spec->GetStringField(TEXT("asset"));
  for (auto W : Wheels)
    W->SetStaticMesh(LoadObject<UStaticMesh>(
        nullptr, *(TEXT("/Game/Meshes/") + Asset +
                   (Tracks ? TEXT("_track") : TEXT("_tire")))));
  Chassis->SetMassOverrideInKg(NAME_None, Mass + (Tracks ? 380 : 0));
  ApplyUpgrades();
  Notice =
      Tracks ? TEXT("Flotation tracks equipped") : TEXT("Road wheels equipped");
  SaveSetup();
}
void ATerraVehicle::TeleportZone(int Index) {
  if (!Terrain || Terrain->Spawns.IsEmpty())
    return;
  Terrain->BreakTireMarks();
  Zone = (Index + Terrain->Spawns.Num()) % Terrain->Spawns.Num();
  RouteIndex = -1;
  RouteStatus.Empty();
  FVector P =
      Terrain->Spawns[Zone] + FVector(0, 0, CG * 100 + 12 + Tuning.Lift * 100 + (Radius-Number(TEXT("tireRadius"),.42f))*100);
  Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  Chassis->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);
  SetActorLocationAndRotation(P, FRotator::ZeroRotator, false, nullptr,
                              ETeleportType::TeleportPhysics);
  for (auto &W : WheelState)
    W = FTerraWheel();
  ResetContactTelemetry();
  WinchAttached = false;
  ReverseHold = 0;
  SpawnCooldown = .7f;
  Parcels.Empty();
  for (auto &Budget : SprayBudget) Budget = 0;
  for (auto M : SprayMeshes) M->ClearInstances();
  Notice = Terrain->ZoneNames[Zone];
}
bool ATerraVehicle::RecoverInPlace() {
  if(!Terrain||!Spec.IsValid()||Garage)return false;
  const FVector Old=GetActorLocation();
  FVector Forward=GetActorForwardVector();Forward.Z=0;
  // A rolled vehicle's right vector can point the opposite way. Use it only
  // when the nose is effectively vertical and has no horizontal heading.
  if(Forward.IsNearlyZero())Forward=GetActorRightVector().Cross(FVector::UpVector);
  const FRotator Upright(0,Forward.Rotation().Yaw,0);
  Forward=Upright.Vector();
  const FQuat Rotation=Upright.Quaternion();
  if(Old.ContainsNaN())return false;

  const FVector Up=FVector::UpVector;
  const float RadiusCM=Radius*100, RideCM=ExpectedRideHeight()*100;
  const float Ground=Terrain->Height(Old.X,Old.Y);
  FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraLocalRecovery),true,this);
  FHitResult FloorHit;
  const float ReferenceTop=FMath::Max(float(Old.Z),Ground)+FMath::Max(110.f,RadiusCM*1.5f);
  float ReferenceFloor=Ground;
  if(GetWorld()->LineTraceSingleByChannel(FloorHit,FVector(Old.X,Old.Y,ReferenceTop),
      FVector(Old.X,Old.Y,Ground-10),ECC_Visibility,Query)&&!FloorHit.bStartPenetrating)
    ReferenceFloor=FMath::Max(Ground,float(FloorHit.ImpactPoint.Z));

  // Search on this level. Picking the top of an adjacent rock face can leave
  // the chassis temporarily clear while the truck falls back into the wall.
  const float HighFloor=ReferenceFloor+FMath::Max(90.f,RadiusCM*1.4f);
  const float LowFloor=ReferenceFloor-FMath::Max(210.f,RadiusCM*2.6f);
  const float ProbeHeight=HighFloor+RadiusCM+15.f;
  const float HeightSpread=FMath::Min(65.f,85.f*(FMath::Min(ReboundTravel(0),ReboundTravel(AxleCount()-1))+
      FMath::Min(BumpTravel(true),BumpTravel(false))));
  const float Widths[]={Width*100,Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth*100};
  FComponentQueryParams BodyQuery(SCENE_QUERY_STAT(TerraRecoverBody),this);
  UPrimitiveComponent* Members[]={Chassis.Get(),FrontCollision.Get(),RearCollision.Get(),CoachworkCollision.Get(),RoofCollision.Get()};
  TArray<FOverlapResult> Overlaps;
  auto BodyClear=[&](const FVector& Position){
    for(auto* Member:Members){
      if(!Member->IsQueryCollisionEnabled())continue;
      const FTransform Relative=Member==Chassis?FTransform::Identity:Member->GetRelativeTransform();
      const FTransform Pose=Relative*FTransform(Rotation,Position);
      Overlaps.Reset();
      if(Member->ComponentOverlapMulti(Overlaps,GetWorld(),Pose.GetLocation(),Pose.GetRotation(),ECC_Visibility,BodyQuery))return false;
    }
    return true;
  };

  FVector Position;
  auto FindLanding=[&](const FVector& Center){
    if(TerraSim::OutsideProvingGround(Center.X,Center.Y,0))return false;
    float Highest=-UE_BIG_NUMBER,Lowest=UE_BIG_NUMBER;
    FVector SupportNormal=FVector::ZeroVector;
    FVector Tires[MaxWheels];
    for(int I=0;I<WheelCount();++I){
      const FVector Offset=Rotation.RotateVector(FVector(AxleOffsetM(I/2)*100,(I%2?1:-1)*Track*50,0));
      const FVector Mount(Center.X+Offset.X,Center.Y+Offset.Y,ProbeHeight);
      const auto Support=Terrain->CastTireSupport(Mount,Up,Forward,RadiusCM,Widths[I>=2],
        0,ProbeHeight-LowFloor,this);
      if(!Support.Hit||Support.Normal.Z<.65f||Support.Point.Z<LowFloor||Support.Point.Z>HighFloor)return false;
      Tires[I]=Mount-Up*Support.Distance;
      Highest=FMath::Max(Highest,float(Tires[I].Z));
      Lowest=FMath::Min(Lowest,float(Tires[I].Z));
      SupportNormal+=Support.Normal;
    }
    if(Highest-Lowest>HeightSpread){
      // Use the measured contact normals to account for a continuous grade.
      // Fitting a plane through the wheel heights alone can hide a ledge.
      const FVector SlopeNormal=SupportNormal/SupportNormal.Z;
      double HighResidual=-UE_BIG_NUMBER,LowResidual=UE_BIG_NUMBER;
      for(int I=0;I<WheelCount();++I){
        const double Residual=FVector::DotProduct(Tires[I]-Tires[0],SlopeNormal);
        HighResidual=FMath::Max(HighResidual,Residual);
        LowResidual=FMath::Min(LowResidual,Residual);
      }
      if(HighResidual-LowResidual>HeightSpread)return false;
    }
    const FVector Landing(Center.X,Center.Y,Highest+RideCM-RadiusCM);
    // Check the welded coachwork at placement and just above loaded height.
    // A narrow obstacle can fit between the tire columns.
    if(!BodyClear(Landing+Up*5)||!BodyClear(Landing+Up*15))return false;
    for(int I=0;I<WheelCount();++I){
      // This inscribed box detects a rigid obstacle inside a tire's core
      // without testing an oversized sphere or rejecting normal tread contact.
      const auto Core=FCollisionShape::MakeBox(FVector(RadiusCM*.68f,Widths[I>=2]*.46f,RadiusCM*.67f));
      Overlaps.Reset();
      GetWorld()->OverlapMultiByChannel(Overlaps,Tires[I],Rotation,ECC_Visibility,Core,Query);
      for(const auto& Hit:Overlaps)
        if(Hit.bBlockingHit&&Hit.Component.IsValid()&&!Hit.Component->ComponentHasTag(TEXT("TerraGround")))return false;
    }
    Position=Landing+Up*15;
    return true;
  };

  bool Clear=FindLanding(Old);
  if(!Clear){
    // Small rings retain the projected heading and prefer the closest
    // tested landing. Keep the search local even if the route spawn is clear.
    const FVector Bearings[]={FVector(-1,0,0),FVector(0,1,0),FVector(0,-1,0),FVector(1,0,0),
      FVector(-.7071,.7071,0),FVector(-.7071,-.7071,0),FVector(.7071,.7071,0),FVector(.7071,-.7071,0)};
    for(float Distance:{100.f,200.f,350.f,500.f,750.f,1000.f,1200.f}){
      for(const FVector& Bearing:Bearings)
        if(FindLanding(Old+Rotation.RotateVector(Bearing*Distance))){Clear=true;break;}
      if(Clear)break;
    }
  }
  if(!Clear){Notice=RecoveryBlockedNotice;RecoveryBlockedAt=GetWorld()->GetRealTimeSeconds();return false;}
  Terrain->BreakTireMarks();
  Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  SetActorLocationAndRotation(Position,Upright,false,nullptr,ETeleportType::TeleportPhysics);
  Chassis->WakeAllRigidBodies();
  for(auto& W:WheelState)W=FTerraWheel();
  ResetContactTelemetry();Overturned=false;Speed=Throttle=Steer=0;Brake=1;ReverseHold=0;
  ReverseReleaseRequired=false;RequireControlRelease=true;RecoveryBrakeHold=true;SpawnCooldown=.7f;
  WinchAttached=Reeling=false;PreviousRoutePosition=Position;
  Parcels.Empty();for(auto& Budget:SprayBudget)Budget=0;for(auto Mesh:SprayMeshes)Mesh->ClearInstances();
  Notice=FVector::DistSquared2D(Old,Position)<1.f
    ?TEXT("Recovered here. Challenge progress, damage and fuel are retained.")
    :TEXT("Recovered on nearby ground. Challenge progress, damage and fuel are retained.");
  return true;
}

void ATerraVehicle::TeleportRoute(int Index) {
  if (!Terrain || Terrain->Routes.IsEmpty()) return;
  const int R = (Index + Terrain->Routes.Num()) % Terrain->Routes.Num();
  const auto &Route = Terrain->Routes[R];
  TeleportZone(Route.Zone);
  RouteIndex = R; GateIndex = 0; RouteTime = 0;
  SetActorLocationAndRotation(Route.Spawn + FVector(0,0,CG*100+16+Tuning.Lift*100+(Radius-Number(TEXT("tireRadius"),.42f))*100),
      FRotator(0,Route.Yaw,0),false,nullptr,ETeleportType::TeleportPhysics);
  PreviousRoutePosition = GetActorLocation();
  // Older cooked route data contains default key names. Resolve those legacy
  // phrases at display time so preserved terrain data follows custom controls.
  Notice = Route.Hint.Replace(TEXT("Shift+W"),*(ControlLabel(TerraControls::Action::Crawl)+TEXT("+")+ControlLabel(TerraControls::Action::Forward)))
      .Replace(TEXT("K descent assist"),*(ControlLabel(TerraControls::Action::DescentAssist)+TEXT(" descent assist")));
}
void ATerraVehicle::ToggleLocker(bool Front) {
  bool &Locked = Front ? FrontLocked : RearLocked;
  if (Locked) {
    Locked = false;
    if (!Front && VehicleIndex == 0) FrontLocked = false;
    Notice = Front ? TEXT("Front differential open") : TEXT("Rear differential open");
    return;
  }
  if (!HasLocker(Front)) {
    Notice = TEXT("Fit a locking differential in the garage for this axle"); return;
  }
  if (FMath::Abs(Speed) > .5f || !DrivenWheel(Front?0:2)) {
    Notice = TEXT("Stop and engage drive to this axle before locking it"); return;
  }
  if(HasLowRange()&&(Front||VehicleIndex==0)&&!LowRange){
    Notice=TEXT("Select low range before locking this axle");return;
  }
  if (Front && VehicleIndex == 0 && !RearLocked) {
    Notice = TEXT("Lock the rear axle first"); return;
  }
  Locked = true;
  Notice = Front ? TEXT("Front axle locked") : TEXT("Rear axle locked");
}
void ATerraVehicle::UpdateRoute(float Dt) {
  if (!Terrain->Routes.IsValidIndex(RouteIndex)) return;
  const auto &Route = Terrain->Routes[RouteIndex];
  if (GateIndex < Route.Gates.Num()) {
    RouteTime += Dt;
    const FVector P = GetActorLocation(), G = Route.Gates[GateIndex];
    const int GateDirection=Route.GateDirections.IsValidIndex(GateIndex)?Route.GateDirections[GateIndex]:1;
    // Curving trails cross gate planes along their own tangent. Historical
    // loop gates retain their explicitly authored +/-X direction.
    FVector GateForward(GateDirection,0,0);
    if(Route.GateHeadings.IsValidIndex(GateIndex))GateForward=FRotator(0,Route.GateHeadings[GateIndex],0).Vector();
    else if(RouteIndex==8){const FVector Previous=GateIndex>0?Route.Gates[GateIndex-1]:Route.Spawn;GateForward=(G-Previous).GetSafeNormal2D();}
    const FVector GateSide(-GateForward.Y,GateForward.X,0);
    if (FVector::DotProduct(PreviousRoutePosition-G,GateForward)<0 && FVector::DotProduct(P-G,GateForward)>=0 &&
        FMath::Abs(FVector::DotProduct(P-G,GateSide)) < Route.GateWidth*50 && FMath::Abs(P.Z-G.Z)<300) {
      ++GateIndex;
      if(GateIndex==Route.Gates.Num()&&!Route.GateNotes.IsEmpty())Notice=TEXT("Perimeter Expedition complete");
    }
    PreviousRoutePosition = P;
  }
  RouteStatus = FString::Printf(TEXT("%s | Gate %d/%d | %.1f s%s"), *Route.Name,
      GateIndex,Route.Gates.Num(),RouteTime,GateIndex==Route.Gates.Num()?TEXT("  COMPLETE"):TEXT(""));
}
void ATerraVehicle::Input(float Dt) {
  auto *PC = Cast<APlayerController>(GetController());
  if (!PC)
    return;
  if(PauseMenuOpen){Throttle=Brake=Steer=0;Reeling=false;return;}
  if (AutoTest) {
    if(TestDriverInput){
      const auto Demand=TerraSim::DriverControls(Direction,TestForward,TestReverse,0,0,TestStop,Speed,Dt,ReverseHold,ReverseReleaseRequired);
      Throttle=Demand.Throttle;Brake=Demand.Brake;
    }else{Throttle = TestThrottle;Brake = TestBrake;}
    Steer = FMath::FInterpTo(Steer, TestSteer, Dt, 5*TirePressureHandling().SteeringResponse);
    return;
  }
  using A=TerraControls::Action;
  auto DownKey = [&](FKey Key) { return PC->IsInputKeyDown(Key); };
  auto PressKey = [&](FKey Key) { return PC->WasInputKeyJustPressed(Key); };
  auto Down = [&](A Action) { return ControlDown(Action); };
  auto Press = [&](A Action) { return ControlPressed(Action); };
  if(PressKey(EKeys::Escape)||PressKey(EKeys::Tab)||Press(A::Garage)){
    const FKey Key=PressKey(EKeys::Escape)?EKeys::Escape:PressKey(EKeys::Tab)?EKeys::Tab:ControlKey(A::Garage);
    Throttle=Brake=Steer=0;Reeling=false;HandleMenuKey(Key);return;
  }
  if (Garage) { Throttle=Steer=0; Brake=1; return; }
  if(Press(A::Recover)){RecoverInPlace();return;}
  if(RequireControlRelease){
    Throttle=Steer=0;Brake=RecoveryBrakeHold?1.f:0.f;Reeling=false;
    const bool Held=Down(A::Forward)||Down(A::Reverse)||Down(A::SteerLeft)||Down(A::SteerRight)||Down(A::HoldBrake)||Down(A::WinchReel)||
      DownKey(EKeys::Up)||DownKey(EKeys::Down)||DownKey(EKeys::Left)||DownKey(EKeys::Right)||DownKey(EKeys::Gamepad_FaceButton_Bottom)||
      FMath::Abs(PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftX))>.1f||PC->GetInputAnalogKeyState(EKeys::Gamepad_RightTriggerAxis)>.05f||PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftTriggerAxis)>.05f;
    if(Held)return;
    RequireControlRelease=false;RecoveryBrakeHold=false;
  }
  if (Press(A::NextChallenge)) TeleportRoute(RouteIndex + 1);
  if (Press(A::RearLock)) ToggleLocker(false);
  if (Press(A::FrontLock)) ToggleLocker(true);
  if (Press(A::CenterLock)) ToggleCenterLocker();
  if (Press(A::DescentAssist) && VehicleIndex != 2 && VehicleIndex != 3) {
    DescentAssist = !DescentAssist;
    Notice = DescentAssist ? TEXT("Descent assist: brake-controlled 4.5 mph target") : TEXT("Descent assist off");
  }
  for (int I = 0; I < 9; I++)
    if (Press(A(int(A::Region1)+I)))
      { if (I==6) TeleportRoute(0); else if (I==8) TeleportRoute(4); else TeleportZone(I); }
  if (Press(A::Tracks))
    SetTracks(!Tracks);
  if (Press(A::FourDrive)) {
    if(!HasFourDrive())Notice=TEXT("Fit the drivetrain upgrade for four-wheel drive");
    else if(DriveCapabilities().Permanent)Notice=TEXT("Permanent all-wheel drive remains engaged");
    else if(FMath::Abs(Speed)>.5f)Notice=TEXT("Stop before changing driven axles");
    else{
      FourDrive = !FourDrive;
      if (!FourDrive) FrontLocked = RearLocked = LowRange = CenterLocked = false;
      Notice = DriveDescription();
    }
  }
  if (Press(A::LowRange)) {
    if(!HasLowRange())Notice=TEXT("Fit the drivetrain low-range upgrade in the garage");
    else if (FMath::Abs(Speed) < .5f){
      LowRange = !LowRange;if (LowRange) FourDrive = true;else FrontLocked = RearLocked = false;
      Notice=DriveDescription();
    }else Notice = TEXT("Stop to shift low range");
  }
  if (Press(A::PressureUp) || PressKey(EKeys::Add)) {
    RequestTirePressure(PressureTarget+2);
    SaveSetup();
  }
  if (Press(A::PressureDown) || PressKey(EKeys::Subtract)) {
    RequestTirePressure(PressureTarget-2);
    SaveSetup();
  }
  if (Press(A::Rain))
    Terrain->SetRain(!Terrain->Rain);
  if (Press(A::ResetTerrain)) {
    Terrain->ResetSoil();
    RepairDamage();
    Parcels.Empty();
  }

  if (Press(A::WinchAttach)) {
    if (WinchAttached)
      WinchAttached = false;
    else {
      Anchor = Terrain->FindAnchor(GetActorLocation());
      WinchAttached = !Anchor.IsNearlyZero();
      WinchLength = FVector::Dist(Anchor, GetActorLocation()) / 100;
      Notice = WinchAttached ? FString::Printf(TEXT("Winch attached — hold %s to reel"),*ControlLabel(A::WinchReel))
                             : TEXT("No standing anchor within 148 ft");
    }
  }
  Reeling = Down(A::WinchReel);
  float AX = PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftX),
        RT = PC->GetInputAnalogKeyState(EKeys::Gamepad_RightTriggerAxis),
        LT = PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftTriggerAxis);
  bool W = Down(A::Forward) || DownKey(EKeys::Up),
       S = Down(A::Reverse) || DownKey(EKeys::Down);
  float Target = (Down(A::SteerRight) || DownKey(EKeys::Right) ? 1.f : 0.f) -
                 (Down(A::SteerLeft) || DownKey(EKeys::Left) ? 1.f : 0.f);
  if (FMath::Abs(AX) > .1f)
    Target = AX;
  Steer = FMath::FInterpConstantTo(Steer, Target, Dt, (Target == 0 ? 3.5f : 2.f)*TirePressureHandling().SteeringResponse);
  Throttle = 0;
  Brake = LT;
  if (Garage) {
    Brake = 1;
    return;
  }
  const auto Demand=TerraSim::DriverControls(Direction,W,S,RT,LT,
      Down(A::HoldBrake)||DownKey(EKeys::Gamepad_FaceButton_Bottom),Speed,Dt,ReverseHold,ReverseReleaseRequired);
  Throttle=Demand.Throttle;Brake=Demand.Brake;
  float MX = 0, MY = 0;
  PC->GetInputMouseDelta(MX, MY);
  if (Down(A::CameraOrbit)) {
    CameraYaw += MX * .22f;
    CameraPitch = FMath::Clamp(CameraPitch + MY * .2f, -50.f, 5.f);
  }
  if (Press(A::CameraNear))
    NearCamera = !NearCamera;
  if (Down(A::Crawl)) Throttle *= .28f;
}
void ATerraVehicle::Simulate(float Dt) {
  FVector Velocity = Chassis->GetPhysicsLinearVelocity() / 100,
          Up = GetActorUpVector(), Forward = GetActorForwardVector();
  Speed = FVector::DotProduct(Velocity, Forward);
  const bool Electric = IsElectric();
  const auto EV=ElectricConfig();
  const auto ICE=CombustionConfig();
  const bool ConvertedICE=ICE.Stage>0;
  const float IdleRPM=ConvertedICE?ICE.IdleRPM:700.f;
  const float RedlineRPM=ConvertedICE?ICE.RedlineRPM:Spec->GetObjectField(TEXT("engine"))->GetNumberField(TEXT("redlineRPM"));
  if (LowRange) Gear = 0;
  const auto &Ratios = Spec->GetArrayField(TEXT("gears"));
  const int GearCount=ConvertedICE?8:Ratios.Num();
  Gear=FMath::Clamp(Gear,0,GearCount-1);
  auto RatioAt=[&](int Index){return ConvertedICE?ICE.GearRatios[Index]:float(Ratios[Index]->AsNumber());};
  float Ratio=Direction<0?(ConvertedICE?ICE.ReverseRatio:Number(TEXT("reverseRatio"),3)):RatioAt(Gear);
  float Final=(ConvertedICE?ICE.FinalDrive:Number(TEXT("finalDrive"),4))*PortalReduction(),
        Low = EffectiveLowRatio();
  if(Electric){Ratio=EV.Reduction;Final=PortalReduction();Gear=0;}
  float MeanOmega = 0;
  for (int I=0;I<WheelCount();++I)
    MeanOmega += FMath::Abs(WheelState[I].Omega) / WheelCount();
  RPM = FMath::Max(Electric ? 0.f : IdleRPM,
                   MeanOmega * Ratio * Final * Low * 60 / (2 * PI));
  if (!Electric && !LowRange && Direction > 0) {
    float Red=RedlineRPM;
    const float RoadRPM=FMath::Abs(Speed)/FMath::Max(.1f,Radius)*Ratio*Final*Low*60/(2*PI);
    Gear=TerraSim::AutomaticGear(Gear,GearCount-1,RPM,RoadRPM,Red);
    Ratio=RatioAt(Gear);
    RPM=FMath::Max(IdleRPM,MeanOmega*Ratio*Final*Low*60/(2*PI));
  }
  if(!Electric){
    const auto Engine=Spec->GetObjectField(TEXT("engine"));
    RPM=TerraSim::ConverterEngineRPM(RPM,ConvertedICE?ICE.IdleRPM:Engine->GetNumberField(TEXT("idleRPM")),Throttle,
        ConvertedICE?ICE.StallRPM:Number(TEXT("converterStallRPM"),FMath::Min(2300.f,float(Engine->GetNumberField(TEXT("peakTorqueRPM"))))));
  }
  float Torque=ConvertedICE?TerraSim::CombustionSwapTorque(ICE,RPM):Number(TEXT("torqueNm"),350);
  if (!Electric && !ConvertedICE) {
    auto Curve =
        Spec->GetObjectField(TEXT("engine"))->GetArrayField(TEXT("curve"));
    for (int I = 1; I < Curve.Num(); I++) {
      auto A = Curve[I - 1]->AsArray(), B = Curve[I]->AsArray();
      if (RPM <= B[0]->AsNumber()) {
        Torque = FMath::Lerp(
            float(A[1]->AsNumber()), float(B[1]->AsNumber()),
            FMath::Clamp(float((RPM - A[0]->AsNumber()) /
                               (B[0]->AsNumber() - A[0]->AsNumber())),
                         0.f, 1.f));
        break;
      }
    }
  }
  float TotalTorque =
      Electric
          ? FMath::Min(Number(TEXT("wheelTorqueNm"), 15000)*PortalReduction()*Low,
                       Power / FMath::Max(MeanOmega, 1.f))
          : Torque * Ratio * Final * Low * .84f * (Speed < 2 ? 1.35f : 1.f);
  // The implicit wheel/axle limiter below supplies only the requested engine
  // torque needed to balance tire reaction at redline. A second cut based on
  // last frame's RPM made loaded locked axles alternate drive and zero torque.
  TotalTorque *=
      Throttle * Tuning.Power * Tuning.ElectricalPower * Tuning.DriveEfficiency * DamageDriveFactor() * Direction;
  if(!HasPropulsionEnergy())TotalTorque=0;
  const float WaterDepth=Terrain->Sample(GetActorLocation()).Water/100;
  TotalTorque*=1-FMath::Clamp((WaterDepth-Tuning.WaterDepth)*1.1f,0.f,.65f);
  if (Tracks && FMath::Abs(Speed) > 12)
    TotalTorque = 0;
  if (LowRange) TotalTorque *= FMath::Clamp(8.f-FMath::Abs(Speed),0.f,1.f);
  const float SteerAngle =
      Steer * FMath::DegreesToRadians(SteeringLockDegrees) / (1 + FMath::Abs(Speed) * .025f) + DamageSteeringOffset();
  const float RearSteerAngle=Number(TEXT("monsterTruck"),0)>0?SteerAngle*MonsterRearSteerRatio/(1+FMath::Abs(Speed)*.18f):VehicleIndex==4 ? -SteerAngle*.25f/(1+FMath::Abs(Speed)*.15f) : VehicleIndex==5?SteerAngle*FMath::Lerp(-.12f,.06f,FMath::Clamp((FMath::Abs(Speed)-8)/18,0.f,1.f)):0;
  float TotalLoad = 0;
  ContactCount = 0;
  LastTireForceN = 0;
  const int Count=WheelCount(),Axles=AxleCount();
  const float ResponseBodyMass=Chassis->GetMass();
  const FVector BodyInertia=Chassis->GetInertiaTensor()/10000,BodyCenter=Chassis->GetCenterOfMass()/100;
  const FQuat BodyRotation=Chassis->BodyInstance.GetMassSpaceToWorldSpace().GetRotation();
  float Capacities[MaxWheels] = {}, Drives[MaxWheels] = {};
  FVector NormalArms[MaxWheels],PendingTireForces[MaxWheels];
  // Resolve every contact before sharing torque between an axle's two wheels.
  for (int I = 0; I < Count; ++I) {
    auto &W = WheelState[I];
    const bool Front = I < 2;
    const float StaticLoad = Mass * 9.81f * AxleLoadFraction(I/2) * .5f;
    const float Preload = StaticLoad / Spring;
    // Mount geometry belongs to the stock body. Extra spring length and tire
    // radius must raise the body, matching the garage, rather than lower it.
    const FVector Local(AxleOffsetM(I/2)*100,
        (I%2 ? 1:-1)*Track*50, (Number(TEXT("tireRadius"),.42f)+Rest-CG-Preload-Tuning.Lift)*100);
    const FVector Mount = GetActorTransform().TransformPosition(Local);
    const float SteeringSpan=Axles==3?AxleOffsetM(0)-(AxleOffsetM(1)+AxleOffsetM(2))*.5f:Wheelbase;
    W.Angle=Tracks?(Front?SteerAngle:RearSteerAngle):TerraSim::AckermannAngle(Front?SteerAngle:RearSteerAngle,
        Front?RearSteerAngle:SteerAngle,(I%2?1.f:-1.f)*Track*.5f,Front?SteeringSpan:-SteeringSpan);
    const FVector WF = FQuat(Up,W.Angle).RotateVector(Forward);
    const float AxleWidth=Front?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth;
    const auto Support = Terrain->CastTireSupport(Mount,Up,WF,Radius*100,AxleWidth*100,-30,(Rest+Droop)*100,this);
    W.ContactValid = Support.Hit;
    W.Constructed = Support.Constructed;
    W.Distance = Support.Hit ? Support.Distance/100 : Rest+Droop;
    const float Bump= BumpTravel(Front);
    W.Center = Mount-Up*FMath::Clamp(W.Distance,Rest-Preload-Bump,Rest+Droop)*100;
    W.Contact = Support.Hit ? Support.Point : W.Center-Up*Radius*100;
    W.Ground = Terrain->Sample(W.Contact);
    if (Support.Hit) {
      W.Ground.Normal = Support.Normal;
      if (Support.Constructed) {
        W.Ground.Surface = Support.Surface; W.Ground.Water = W.Ground.Softness = W.Ground.MaxSink = 0;
        W.Ground.Mu = (Support.Surface==4 ? .90f:.98f)*(Terrain->Rain?.76f:1.f);
        W.Ground.Rolling = .018f;
      }
    }
    const FVector Normal = W.Ground.Normal;
    W.PointVelocity = Chassis->GetPhysicsLinearVelocityAtPoint(W.Contact)/100;
    const FVector NormalArm=BodyRotation.UnrotateVector(FVector::CrossProduct(W.Contact/100-BodyCenter,Normal));
    NormalArms[I]=NormalArm;
    const float NormalMass=FMath::Min(StaticLoad/9.81f,TerraSim::EffectiveContactMass(ResponseBodyMass,
        BodyInertia.X,BodyInertia.Y,BodyInertia.Z,NormalArm.X,NormalArm.Y,NormalArm.Z));
    W.Load = Support.Hit ? FMath::Clamp(TerraSim::ProgressiveSuspensionForce(Rest-W.Distance,
        FVector::DotProduct(W.PointVelocity,Normal),Spring,Damping,StaticLoad/9.81f,Normal.Z,Dt,Bump,NormalMass),0.f,StaticLoad*6) : 0;

    TotalLoad += W.Load;
    if (W.Load>50) ++ContactCount;
    W.ForceForward = (WF-Normal*FVector::DotProduct(WF,Normal)).GetSafeNormal();
    W.ForceSide = FVector::CrossProduct(Normal,W.ForceForward).GetSafeNormal();
    W.LongSpeed = FVector::DotProduct(W.PointVelocity,W.ForceForward);
    W.LateralSpeed = FVector::DotProduct(W.PointVelocity,W.ForceSide);
    W.RutDepth=W.Constructed?0:W.Ground.RutDepth;
    const float Placard=Number(Front?TEXT("stockPSIFront"):TEXT("stockPSIRear"),Number(TEXT("stockPSI"),35));
    const auto Air=TerraSim::EvaluateTirePressure(WheelPressure(I),Placard,StaticLoad,Number(TEXT("mass"),2100)*9.81f*AxleLoadFraction(I/2)*.5f,Speed,W.Ground.Softness,Tracks);
    const float BaseGrip=TerraSim::TerrainGrip(W.Ground.Mu,W.Load,StaticLoad,Placard,Placard,
        W.Ground.MaxSink>0,Tracks,W.Ground.Packing,W.Slip,W.Ground.Water/100,W.LongSpeed)*Tuning.Grip*
        (Tracks?(W.Ground.Surface==6?1.5f:.84f):1.f);
    W.Grip=BaseGrip*Air.LongitudinalGrip;W.SideGrip=BaseGrip*Air.LateralGrip;W.CorneringResponse=Air.CorneringStiffness;
    Capacities[I] = W.Load*W.Grip*Radius;
  }
  // Opt-in native evidence for unsupported/oscillating upright suspension.
  // No forces, contacts, timing, or player settings are changed by this probe.
  if(AutoTest&&Up.Z>.85f&&FParse::Param(FCommandLine::Get(),TEXT("TerraUprightSupportDiagnostics"))&&
      (Number(TEXT("monsterTruck"),0)>0||UpgradeStage(TerraSim::TireSize)>0)){
    static double NextUprightDiagnostic=0;const double Now=FPlatformTime::Seconds();
    if(Now>=NextUprightDiagnostic){
      NextUprightDiagnostic=Now+.25;
      UE_LOG(LogTemp,Display,TEXT("TERRA_UPRIGHT_SUPPORT vehicle=%d sizeStage=%d dt=%.6f contacts=%d massKg=%.3f radiusM=%.4f restM=%.4f droopM=%.4f spring=%.1f damper=%.1f positionCM=%s rotation=%s velocityCMPS=%s angularRPS=%s inertiaKGCM2=%s"),
        VehicleIndex,UpgradeStage(TerraSim::TireSize),Dt,ContactCount,Mass,Radius,Rest,Droop,Spring,Damping,
        *GetActorLocation().ToString(),*GetActorRotation().ToString(),*Chassis->GetPhysicsLinearVelocity().ToString(),
        *Chassis->GetPhysicsAngularVelocityInRadians().ToString(),*Chassis->GetInertiaTensor().ToString());
      for(int I=0;I<Count;++I){const auto& W=WheelState[I];
        const FVector Arm=BodyRotation.UnrotateVector(FVector::CrossProduct(W.Contact/100-BodyCenter,W.Ground.Normal));
        const float ResponseMass=FMath::Min(Mass*AxleLoadFraction(I/2)*.5f,TerraSim::EffectiveContactMass(ResponseBodyMass,BodyInertia.X,BodyInertia.Y,BodyInertia.Z,Arm.X,Arm.Y,Arm.Z));
        UE_LOG(LogTemp,Display,TEXT("TERRA_UPRIGHT_WHEEL vehicle=%d wheel=%d hit=%d constructed=%d loadN=%.3f responseMassKg=%.3f distanceM=%.5f omega=%.5f centerCM=%s contactCM=%s normal=%s"),
          VehicleIndex,I,W.ContactValid,W.Constructed,W.Load,ResponseMass,W.Distance,W.Omega,*W.Center.ToString(),*W.Contact.ToString(),*W.Ground.Normal.ToString());
      }
    }
  }
  bool InvertedTrackSupport=false;
  for(int I=0;I<Count;++I){const auto& W=WheelState[I];InvertedTrackSupport|=W.Constructed&&W.Load>50&&FVector::DotProduct(W.Ground.Normal,Up)>.35f;}
  Overturned = Up.Z < .15f && !InvertedTrackSupport;
  if (Overturned) { TotalTorque = 0; Throttle = 0; Steer = 0; }
  if (FMath::Abs(Speed)>11.1f) FrontLocked=RearLocked=false;
  float Omega[MaxWheels]={};for(int I=0;I<Count;++I){Omega[I]=WheelState[I].Omega;LastWheelDriveNm[I]=LastWheelRegenNm[I]=0;}
  const float Environment= Tuning.DriveEfficiency*DamageDriveFactor()*(1-FMath::Clamp((WaterDepth-Tuning.WaterDepth)*1.1f,0.f,.65f));
  float ElectricThrottle=Throttle*(HasPropulsionEnergy()?1.f:0.f);
  if(Tracks&&FMath::Abs(Speed)>12)ElectricThrottle=0;
  
  float MotorOmega[4]={Omega[0],Omega[1],Omega[2],Omega[3]};
  if(Count==6){MotorOmega[2]=(Omega[2]+Omega[4])*.5f;MotorOmega[3]=(Omega[3]+Omega[5])*.5f;}
  const auto MotorDrive=TerraSim::ElectricDriveTorque(EV,MotorOmega,ElectricThrottle,Direction,Low,PortalReduction(),Environment,FourDrive);
  if(Electric){RPM=0;for(float MotorRPM:MotorDrive.MotorRPM)RPM=FMath::Max(RPM,MotorRPM);}
  const bool BothAxlesDriven=DrivenWheel(0)&&DrivenWheel(2);
  const bool CenterCoupled=BothAxlesDriven&&(CenterLockActive()||HasRigidTransfer());
  const bool OpenCenter=BothAxlesDriven&&HasCenterLocker()&&!CenterCoupled;
  const float CenterInput=Electric?MotorDrive.Axle[0]+MotorDrive.Axle[1]:TotalTorque;
  const auto CenterSplit=TerraSim::OpenCenterTorque(CenterInput,
      TerraSim::CenterAxleCapacity(Capacities[0],Capacities[1],FrontLocked,UpgradeStage(TerraSim::Differentials)>=3),
      TerraSim::CenterAxleCapacity(Capacities[2],Capacities[3],RearLocked,UpgradeStage(TerraSim::Differentials)>=3),
      Electric?EV.FrontShare:Number(TEXT("frontTorqueFraction"),.5f));
  float AxleDemand[3]={},ElectricWheel[MaxWheels]={};
  for(int I=0;I<4;++I)ElectricWheel[I]=MotorDrive.Wheel[I];
  if(Count==6){for(int Side=0;Side<2;++Side)ElectricWheel[Side+2]=ElectricWheel[Side+4]=MotorDrive.Wheel[Side+2]*.5f;}
  const float MiddleCapacity=TerraSim::CenterAxleCapacity(Capacities[2],Capacities[3],RearLocked,UpgradeStage(TerraSim::Differentials)>=3);
  const float RearCapacity=Count==6?TerraSim::TandemInputCapacity(MiddleCapacity,
      TerraSim::CenterAxleCapacity(Capacities[4],Capacities[5],RearLocked,UpgradeStage(TerraSim::Differentials)>=3),TandemLockActive()):MiddleCapacity;
  const auto ThreeSplit=TerraSim::OpenCenterTorque(CenterInput,
      TerraSim::CenterAxleCapacity(Capacities[0],Capacities[1],FrontLocked,UpgradeStage(TerraSim::Differentials)>=3),RearCapacity,
      Electric?EV.FrontShare:Number(TEXT("frontTorqueFraction"),.3f));
  for(int Axle=0;Axle<Axles;++Axle){
    const bool Both=DrivenWheel(0)&&DrivenWheel(2);
    const float FrontShare=Number(TEXT("frontTorqueFraction"),.5f);
    if(Count==4)AxleDemand[Axle]=OpenCenter?(Axle==0?CenterSplit.Front:CenterSplit.Rear):Electric?MotorDrive.Axle[Axle]:TotalTorque*(Both?(Axle==0?FrontShare:1-FrontShare):1.f);
    else AxleDemand[Axle]=Axle==0?(OpenCenter?ThreeSplit.Front:Electric?MotorDrive.Axle[0]:TotalTorque*(Both?FrontShare:0)):
        (OpenCenter?ThreeSplit.Rear:Electric?MotorDrive.Axle[1]:TotalTorque*(Both?1-FrontShare:1.f))*(Axle==1?4.f/7.f:3.f/7.f);
  }
  if(Count==6&&!TandemLockActive()){
    const auto Rear=TerraSim::OpenCenterTorque(AxleDemand[1]+AxleDemand[2],
        TerraSim::CenterAxleCapacity(Capacities[2],Capacities[3],RearLocked,UpgradeStage(TerraSim::Differentials)>=3),
        TerraSim::CenterAxleCapacity(Capacities[4],Capacities[5],RearLocked,UpgradeStage(TerraSim::Differentials)>=3),4.f/7.f);
    AxleDemand[1]=Rear.Front;AxleDemand[2]=Rear.Rear;
  }
  for(int Axle=0;Axle<Axles;++Axle){
    const int A=Axle*2;if(!DrivenWheel(A))continue;
    if(Electric&&(IndependentWheel(A)||(Count==6&&Axle==2&&ElectricLayout()==TerraSim::MotorLayout::Quad))){Drives[A]=ElectricWheel[A];Drives[A+1]=ElectricWheel[A+1];continue;}
    const bool Locked=AxleLocked(Axle);
    auto Split=TerraSim::SplitAxleTorque(AxleDemand[Axle],Capacities[A],Capacities[A+1],Locked);
    if(!Locked&&UpgradeStage(TerraSim::Differentials)>=3){const auto Bias=TerraSim::LimitedSlipTorque(AxleDemand[Axle],Capacities[A],Capacities[A+1]);Split.left=Bias.Left;Split.right=Bias.Right;}
    Drives[A]=Split.left;Drives[A+1]=Split.right;
  }
  const float AssistBrake = DescentAssist && Throttle<.05f
      ? FMath::Clamp((FMath::Abs(Speed)-2.f)*.45f,0.f,.8f) : 0.f;
  const float EffectiveBrake = FMath::Max(Brake,AssistBrake);
  if(AssistBrake>Brake){BrakeLampLevel=5;for(auto Lamp:BrakeLamps)Lamp->SetScalarParameterValue(TEXT("TerraLamp"),5);UpdateDamageVisuals();}
  const auto Regeneration=TerraSim::ElectricRegen(EV,MotorOmega,EffectiveBrake,Throttle<.01f?.08f:0.f,
      FMath::Clamp((.99f-BatterySOC)/.04f,0.f,1.f),Low,PortalReduction(),Environment,FourDrive);
  const float Inertia=Tracks?24.f+Tuning.RotatingMass:WheelInertia(), R=Radius;
  const float WheelRevLimit=Electric?0:RedlineRPM*2*PI/
      (60*FMath::Max(.1f,Ratio*Final*Low));
  float Stiffness[MaxWheels]={}, Drag[MaxWheels]={}, Lateral[MaxWheels]={}, LongLimit[MaxWheels]={};
  for(int I=0;I<Count;++I){
    const auto &W=WheelState[I];
    const float Share=Mass*AxleLoadFraction(I/2)*.5f;
    Stiffness[I]=TerraSim::ContactStiffness(W.Load*(W.Ground.Surface==1?10.f:5.f)/FMath::Max(2.f,FMath::Abs(W.LongSpeed)),Share,Dt);
    const bool Driven=DrivenWheel(I);
    const float EngineBrake=!Electric&&Driven&&Throttle<.05f&&LowRange?Mass*9.81f*R*.035f*(4.f/Count):0.f;
    const float Rut=TerraSim::RutResistance(W.RutDepth,R,W.Ground.Softness,W.Ground.Packing,Tracks);
    const auto Air=TerraSim::EvaluateTirePressure(WheelPressure(I),Number(I<2?TEXT("stockPSIFront"):TEXT("stockPSIRear"),Number(TEXT("stockPSI"),35)),Share*9.81f,Number(TEXT("mass"),2100)*9.81f*AxleLoadFraction(I/2)*.5f,Speed,W.Ground.Softness,Tracks);
    const float Service=EffectiveBrake*Mass*9.81f*R*(Count==6?4.f/6.f:1.f)*.4f*DamageBrakeFactor();
    const int MotorWheel=I>=4?I-2:I;
    const float RearScale=Count==6&&I>=2?.5f:1.f;
    const float Regen=RearScale*(Regeneration.Independent[MotorWheel]?Regeneration.Wheel[MotorWheel]:Regeneration.Axle[I<2?0:1]*.5f);
    LastWheelRegenNm[I]=FMath::Min(Regen,FMath::Max(Service,Throttle<.01f?Regen:0.f));
    // Regeneration supplies part of the requested service brake, with friction
    // supplying the rest. Only modest coast regen is additional drag.
    const float BlendedBrake=FMath::Max(Service,LastWheelRegenNm[I]);
    Drag[I]=(W.Ground.Rolling*(Tracks?1.45f:1.f)+Rut+Air.RollingCoefficientAdd)*W.Load*R+BlendedBrake+EngineBrake;
    const float Limit=W.Grip*W.Load,SideLimit=W.SideGrip*W.Load;
    const float LateralRate=W.Load*5.5f*W.CorneringResponse/FMath::Max(2.f,FMath::Abs(W.LongSpeed));
    const float LateralResponse=1+LateralRate*Dt*TerraSim::ContactCoupling/Share;
    Lateral[I]=FMath::Clamp(-W.Load*FMath::Atan2(W.LateralSpeed,FMath::Max(2.f,FMath::Abs(W.LongSpeed)))*5.5f*W.CorneringResponse/LateralResponse,-SideLimit,SideLimit);
    LongLimit[I]=Limit;
  }
  bool IndependentMotor[MaxWheels],DrivenContact[MaxWheels];
  for(int I=0;I<Count;++I){IndependentMotor[I]=IndependentWheel(I);DrivenContact[I]=DrivenWheel(I);}
  const bool TractionControl=Spec->GetObjectField(TEXT("features"))->GetBoolField(TEXT("tractionControl"));
  auto SolveAxles=[&](float CenterTorque,float TandemTorque=0.f){
    for(int I=0;I<Count;++I)WheelState[I].Omega=Omega[I];
    for(int Axle=0;Axle<Axles;++Axle){
    const float Coupling=Axle==0?CenterTorque:-CenterTorque/(Axles-1)+(Axle==1?TandemTorque:-TandemTorque);
    const int A=Axle*2,B=A+1;
    const bool Locked=AxleLocked(Axle);
    if(Locked){
      // Mechanical and virtual axle locks both enforce equal wheel speed.
      // Solve both tire
      // contact constraints together, including both wheels' inertia, so an
      // unloaded wheel cannot free-rev independently and trip the limiter.
      const float Previous=(WheelState[A].Omega+WheelState[B].Omega)*.5f;
      const float DragTorque=FMath::Sign(Previous)*(Drag[A]+Drag[B]);
      float Drive=Drives[A]+Drives[B];
      if(!Electric){
        const float Reaction=R*(FMath::Clamp(Stiffness[A]*(Direction*WheelRevLimit*R-WheelState[A].LongSpeed),-LongLimit[A],LongLimit[A])+
            FMath::Clamp(Stiffness[B]*(Direction*WheelRevLimit*R-WheelState[B].LongSpeed),-LongLimit[B],LongLimit[B]));
        Drive=TerraSim::RevLimitedTorque(Drive,Previous,Inertia*2,Dt,WheelRevLimit,Reaction,DragTorque);
      }
      Drive+=Coupling;
      LastWheelDriveNm[A]=LastWheelDriveNm[B]=Drive*.5f;
      const float Free=Previous+Drive*Dt/(Inertia*2);
      WheelState[A].Omega=WheelState[B].Omega=TerraSim::CombinedAxleOmega(Free,Stiffness[A],Stiffness[B],
          WheelState[A].LongSpeed,WheelState[B].LongSpeed,LongLimit[A],LongLimit[B],
          Lateral[A]/FMath::Max(1.f,WheelState[A].SideGrip*WheelState[A].Load),
          Lateral[B]/FMath::Max(1.f,WheelState[B].SideGrip*WheelState[B].Load),R,Dt,Inertia*2,Drag[A]+Drag[B]);
    }else for(int I=A;I<=B;++I){
      auto &W=WheelState[I];
      const float DragTorque=FMath::Sign(W.Omega)*Drag[I];
      const float Reaction=R*FMath::Clamp(Stiffness[I]*(Direction*WheelRevLimit*R-W.LongSpeed),-LongLimit[I],LongLimit[I]);
      float Demand=Drives[I];
      if(DrivenContact[I]&&Throttle>.02f&&(IndependentMotor[I]||TractionControl))
        Demand=TerraSim::TractionControlledTorque(Demand,W.Omega,W.LongSpeed,R,Inertia,Dt,Stiffness[I],LongLimit[I],Drag[I],Direction);
      const float Drive=(Electric?Demand:TerraSim::RevLimitedTorque(Demand,W.Omega,Inertia,Dt,WheelRevLimit,Reaction,DragTorque))+Coupling*.5f;
      LastWheelDriveNm[I]=Drive;
      const float Free=W.Omega+Drive*Dt/Inertia;
      W.Omega=TerraSim::CombinedWheelOmega(Free,Stiffness[I],W.LongSpeed,R,Dt,Inertia,LongLimit[I],
          Lateral[I]/FMath::Max(1.f,W.SideGrip*W.Load),Drag[I]);
    }
  }
    float RearMean=0;for(int I=2;I<Count;++I)RearMean+=WheelState[I].Omega/(Count-2);
    return (WheelState[0].Omega+WheelState[1].Omega)*.5f-RearMean;
  };
  LastCenterCouplingNm=LastTandemCouplingNm=0;
  const float Rating=HasRigidTransfer()?Mass*9.81f*Radius*6.f:
      TerraSim::CenterRatedTorque(UpgradeStage(TerraSim::CenterDifferential),HasFactoryCenterLocker(),Mass,Radius);
  if(Count==6&&(CenterCoupled||TandemLockActive())){
    auto Evaluate=[&](float C,float T){const float Difference=SolveAxles(C,T);return TerraSim::TandemResidual{Difference,
        (WheelState[2].Omega+WheelState[3].Omega-WheelState[4].Omega-WheelState[5].Omega)*.5f};};
    const auto Coupled=TerraSim::SolveTandemCoupling(Rating,CenterCoupled,TandemLockActive(),Evaluate);
    LastCenterCouplingNm=Coupled.Center;LastTandemCouplingNm=Coupled.Tandem;
  }else if(CenterCoupled){auto Evaluate=[&](float C){return SolveAxles(C);};LastCenterCouplingNm=TerraSim::SolveCenterCoupling(Rating,Evaluate);}
  SolveAxles(LastCenterCouplingNm,LastTandemCouplingNm);
  float BrakeSupportLoad=0;
  // Match the scene exactly; nominal 9.81 versus UE's 9.80 leaves a tiny
  // permanent cross-slope bias in an otherwise stationary tire constraint.
  const float GravityDownMS2=-GetWorld()->GetGravityZ()*.01f;
  for(int I=0;I<Count;++I){const auto& Wheel=WheelState[I];if(Wheel.ContactValid&&Wheel.Load>50)BrakeSupportLoad+=Wheel.Load;}
  for (int I=0;I<Count;++I) {
    auto &W=WheelState[I];
    const float C=Stiffness[I];
    const auto Combined=TerraSim::CombinedTireForces(C*(W.Omega*R-W.LongSpeed),Lateral[I],LongLimit[I],W.SideGrip*W.Load);
    float FX=Combined.Longitudinal,FY=Combined.Lateral;
    if(FMath::Abs(W.LongSpeed)<1.f&&W.ContactValid&&W.Load>50){
      // Static friction opposes the remaining contact velocity and the gravity
      // component along the slope. This is still bounded by brake torque and
      // the same combined tire grip; it never freezes an airborne chassis.
      // Only loaded contacts can hold the body on a slope. A fixed quarter
      // share lost gravity compensation whenever cross-axle articulation
      // lifted tires, even though the remaining tires had sufficient grip.
      const float Share=TerraSim::SupportedBrakeMass(Mass,W.Load,BrakeSupportLoad);
      const float HoldLimit=FMath::Min(LongLimit[I],Drag[I]/R);
      auto ContactMass=[&](FVector Axis){
        const FVector Arm=BodyRotation.UnrotateVector(FVector::CrossProduct(W.Contact/100-BodyCenter,Axis));
        return TerraSim::EffectiveContactMass(Mass,BodyInertia.X,BodyInertia.Y,BodyInertia.Z,Arm.X,Arm.Y,Arm.Z)/FMath::Max(1,ContactCount);
      };
      // Brake impulses share the actual translational/rotational body inertia.
      // Using a quarter of total mass at every tire overcorrected roll on
      // taller vehicles, leaving an alternating residual contact velocity.
      // Lateral static grip exists without the service brake. A slip-only
      // curve has zero force at zero slip, so even a stationary tire drifted
      // sideways until enough artificial slip built up to oppose gravity.
      // Unbraked wheels may still roll down a grade in their rolling direction.
      if(EffectiveBrake>.05f)
        FX=FMath::Clamp(-ContactMass(W.ForceForward)*W.LongSpeed/FMath::Max(Dt,.008f)+Share*GravityDownMS2*W.ForceForward.Z,-HoldLimit,HoldLimit);
      const float StaticSide=FMath::Clamp(-ContactMass(W.ForceSide)*W.LateralSpeed/FMath::Max(Dt,.008f)+Share*GravityDownMS2*W.ForceSide.Z,-W.SideGrip*W.Load,W.SideGrip*W.Load);
      const float Blend=1-FMath::SmoothStep(.55f,1.f,FMath::Abs(W.LongSpeed));
      FY=FMath::Lerp(FY,StaticSide,Blend);
    }
    const float Ellipse=FMath::Sqrt(FMath::Square(FX/FMath::Max(1.f,W.Grip*W.Load))+FMath::Square(FY/FMath::Max(1.f,W.SideGrip*W.Load)));
    const float Scale=Ellipse>1?1/Ellipse:1;
    FX*=Scale; FY*=Scale;
    if(AutoTest&&RouteIndex==8&&int(RouteTime)!=int(RouteTime+Dt))
      UE_LOG(LogTemp,Display,TEXT("TERRA_TRAIL_CONTACT t=%.1f wheel=%d dt=%.3f fx=%.0f fy=%.0f omega=%.2f long=%.2f lateral=%.2f distance=%.3f normal=%s"),RouteTime,I,Dt,FX,FY,W.Omega,W.LongSpeed,W.LateralSpeed,W.Distance,*W.Ground.Normal.ToString());
    W.Slip=(W.Omega*R-W.LongSpeed)/FMath::Max(2.f,FMath::Abs(W.LongSpeed));
    W.SoilSlip+=(FMath::Clamp(W.Slip,-2.f,2.f)-W.SoilSlip)*(1-FMath::Exp(-Dt/.10f));
    PendingTireForces[I]=W.ContactValid&&W.Load>0?W.Ground.Normal*W.Load+W.ForceForward*FX+W.ForceSide*FY:FVector::ZeroVector;
    if(W.ContactValid&&W.Load>0)LastTireForceN+=FMath::Abs(FX)+FMath::Abs(FY);
  }
  if(!Overturned&&Dt>.0001f){
    // Brake forces below the COM rotate the front into full bump in this same
    // step. Predict all queued tire forces together, then add only the missing
    // stop reaction. FX/FY retain their conservative pre-correction grip limit.
    FVector DeltaLinear(0,0,-GravityDownMS2*Dt),DeltaAngular=FVector::ZeroVector;
    for(int I=0;I<Count;++I){
      DeltaLinear+=PendingTireForces[I]*(Dt/FMath::Max(1.f,ResponseBodyMass));
      const FVector SuspensionTorque=BodyRotation.UnrotateVector(FVector::CrossProduct(WheelState[I].Contact/100-BodyCenter,PendingTireForces[I]));
      DeltaAngular+=FVector(SuspensionTorque.X/FMath::Max(1.f,float(BodyInertia.X)),SuspensionTorque.Y/FMath::Max(1.f,float(BodyInertia.Y)),SuspensionTorque.Z/FMath::Max(1.f,float(BodyInertia.Z)))*Dt;
    }
    const auto* Physics=UPhysicsSettings::Get();
    const int Substeps=Physics->bSubstepping?FMath::Clamp(FMath::CeilToInt(Dt/FMath::Max(.0001f,Physics->MaxSubstepDeltaTime)),1,Physics->MaxSubsteps):1;
    TerraSim::SuspensionBumpContact Stops[MaxWheels];float Response[MaxWheels][MaxWheels]={};
    for(int I=0;I<Count;++I){const auto& W=WheelState[I];const float Alignment=FVector::DotProduct(Up,W.Ground.Normal);
      const float StaticLoad=Mass*9.81f*AxleLoadFraction(I/2)*.5f;
      const float NormalVelocity=FVector::DotProduct(W.PointVelocity,W.Ground.Normal);
      const float Clearance=(StaticLoad/Spring+BumpTravel(I<2)-(Rest-W.Distance))*Alignment;
      Stops[I].PredictedVelocity=NormalVelocity+FVector::DotProduct(DeltaLinear,W.Ground.Normal)+FVector::DotProduct(DeltaAngular,NormalArms[I]);
      Stops[I].TargetVelocity=TerraSim::SuspensionBumpTargetVelocity(Clearance,NormalVelocity,Dt,Substeps);
      Stops[I].MaximumImpulse=W.ContactValid&&Alignment>.35f?FMath::Max(0.f,StaticLoad*6-W.Load)*Dt:0;
      for(int J=0;J<Count;++J)Response[I][J]=FVector::DotProduct(W.Ground.Normal,WheelState[J].Ground.Normal)/FMath::Max(1.f,ResponseBodyMass)+
        NormalArms[I].X*NormalArms[J].X/FMath::Max(1.f,float(BodyInertia.X))+
        NormalArms[I].Y*NormalArms[J].Y/FMath::Max(1.f,float(BodyInertia.Y))+
        NormalArms[I].Z*NormalArms[J].Z/FMath::Max(1.f,float(BodyInertia.Z));
    }
    TerraSim::SolveSuspensionBumpContacts(Stops,Response,Count);
    float TotalStopImpulse=0,MaximumStopError=0;
    for(int I=0;I<Count;++I)if(Stops[I].Impulse>0){
      const float Extra=Stops[I].Impulse/Dt;WheelState[I].Load+=Extra;
      PendingTireForces[I]+=WheelState[I].Ground.Normal*Extra;TotalStopImpulse+=Stops[I].Impulse;
      float Predicted=Stops[I].PredictedVelocity;for(int J=0;J<Count;++J)Predicted+=Response[I][J]*Stops[J].Impulse;
      MaximumStopError=FMath::Max(MaximumStopError,Stops[I].TargetVelocity-Predicted);
    }
    if(AutoTest&&TotalStopImpulse>1&&FParse::Param(FCommandLine::Get(),TEXT("TerraUprightSupportDiagnostics")))
      UE_LOG(LogTemp,Display,TEXT("TERRA_BUMP_CONSTRAINT vehicle=%d dt=%.6f impulseNS=%.3f residualMPS=%.6f"),VehicleIndex,Dt,TotalStopImpulse,MaximumStopError);
  }
  ContactCount=0;
  for(int I=0;I<Count;++I){auto& W=WheelState[I];
    if(W.Load>50)++ContactCount;
    // Filter the actual final load once, including a full-bump reaction.
    W.SoilLoad=TerraSim::FilteredSoilLoad(W.SoilLoad,W.ContactValid&&!W.Constructed?W.Load:0,Dt);
    W.Footprint=TerraSim::FootprintLength(W.Load,WheelPressure(I),Tracks?.48f:(I<2?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth),Radius,Tracks);
    if (W.Load>0 && W.ContactValid) {
      Chassis->AddForceAtLocation(PendingTireForces[I]*100,W.Contact);
      if (SoilTimer>=.025f && !W.Constructed && W.Load>=50){
        const float TireWidth=Tracks?.48f:(I<2?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth);
        // The rolling support witness can switch +/- 0.6 tire radii as
        // a rut opens. It is correct for forces but not the footprint centre:
        // painting there chased alternating high spots into crater teeth.
        const FVector Bottom=W.Center-Up*Radius*100;
        const FVector SoilPoint(Bottom.X,Bottom.Y,Terrain->Height(Bottom.X,Bottom.Y));
        FVector SoilForward=FQuat(Up,W.Angle).RotateVector(Forward);SoilForward.Z=0;SoilForward.Normalize();
        const auto SoilSurface=Terrain->Sample(SoilPoint);
        const float PressurePatch=TerraSim::FootprintLength(W.SoilLoad,WheelPressure(I),TireWidth,Radius,Tracks);
        const float Patch=TerraSim::SoftSoilFootprint(PressurePatch,W.SoilLoad,TireWidth,Radius,
            SoilSurface.MaxSink,W.SoilSlip,SoilSurface.Churn,SoilSurface.RutDepth).Length;
        const float Travel=FVector::Dist2D(W.LastSoil,SoilPoint);
        const bool Connected=W.SoilConnected&&Travel<250&&FMath::Abs(W.LastSoil.Z-SoilPoint.Z)<100;
        const float Spacing=FMath::Min(3.125f,Patch*25);
        const int Steps=Connected?FMath::Clamp(FMath::CeilToInt(Travel/Spacing),1,96):1;
        for(int Step=1;Step<=Steps;++Step){
          const float Blend=float(Step)/Steps;
          const FVector Point=Connected?FMath::Lerp(W.LastSoil,SoilPoint,Blend):SoilPoint;
          const FVector Tangent=Connected?(W.LastSoilForward*(1-Blend)+SoilForward*Blend).GetSafeNormal():SoilForward;
          const float SupportedLoad=Connected?FMath::Lerp(W.LastSoilLoad,W.SoilLoad,Blend):W.SoilLoad;
          const float Slip=Connected?FMath::Lerp(W.LastSoilSlip,W.SoilSlip,Blend):W.SoilSlip;
          // Tire carcass pressure and sink-dependent rolling arc determine
          // the same supported area used by the soil's pressure solve.
          const float PressureFootprint=TerraSim::FootprintLength(SupportedLoad,WheelPressure(I),TireWidth,Radius,Tracks);
          const float Footprint=TerraSim::SoftSoilFootprint(PressureFootprint,SupportedLoad,TireWidth,Radius,
              SoilSurface.MaxSink,Slip,SoilSurface.Churn,SoilSurface.RutDepth).Length;
          Terrain->Deform(Point,Tangent,SupportedLoad,WheelPressure(I),TireWidth,Footprint,Slip,W.LongSpeed,SoilTimer/Steps);
        }
        W.LastSoil=SoilPoint;W.LastSoilForward=SoilForward;
        W.LastSoilLoad=W.SoilLoad;W.LastSoilSlip=W.SoilSlip;W.SoilConnected=true;
      }
      const float Water=W.Ground.Water/100;
      if (Water>.01f) Chassis->AddForceAtLocation((-W.PointVelocity*Water*260+FVector::UpVector*Water*350)*100,W.Contact);
    }
    if(!W.ContactValid||W.Load<50||W.Constructed)W.SoilConnected=false;
    Terrain->TireMark(I,W.Contact,W.ForceForward,Tracks?.48f:(I<2?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth),W.Slip,W.LongSpeed,W.LateralSpeed,
        W.ContactValid&&W.Load>50&&!Overturned,W.Constructed,Dt);
    W.Rotation+=W.Omega*Dt; W.Pressure=WheelPressure(I);
  }
  LastRegenPowerW=0;
  if(Electric){float Consumed=0;for(int I=0;I<Count;++I){Consumed+=FMath::Max(0.f,(LastWheelDriveNm[I]-WheelShaftCouplingNm(I))*WheelState[I].Omega);LastRegenPowerW+=LastWheelRegenNm[I]*FMath::Abs(WheelState[I].Omega)*.82f;}
    LastRegenPowerW=FMath::Min(LastRegenPowerW,Regeneration.RecoveredPowerW);
    LastElectricDrawW=Consumed/FMath::Max(.5f,EV.Efficiency)+350.f;
  }
  UpdateEnergy(Dt);
  UpdateRolledTireContacts(Dt);
  UpdateWheelVisuals();
  UpdateVisualDetails();
  if (SoilTimer >= .025f)
    SoilTimer = 0;
  Chassis->AddForce(-Velocity * Velocity.Size() * .5f * 1.2f * .5f * Tuning.Drag *
                    Number(TEXT("width"), 1.8) * Number(TEXT("height"), 1.8) *
                    100);
  if (WinchAttached) {
    FVector Hook =
        GetActorLocation() + Forward * Number(TEXT("length"), 4.8) * 47;
    FVector D = Anchor - Hook;
    float L = D.Size() / 100;
    if (Reeling)
      WinchLength = FMath::Max(2.f, WinchLength - Dt * .65f*Tuning.Winch);
    WinchTension =
        FMath::Clamp((L - WinchLength) * 14000 -
                         FVector::DotProduct(Velocity, D.GetSafeNormal()) * 900,
                     0.f, 45000.f*Tuning.Winch);
    Chassis->AddForceAtLocation(D.GetSafeNormal() * WinchTension * 100, Hook);
    DrawDebugLine(GetWorld(), Hook, Anchor, FColor(92, 130, 140), false, 0, 0,
                  1.7f);
  } else
    WinchTension = 0;
  const FVector Position=GetActorLocation();
  if(TerraSim::OutsideProvingGround(Position.X,Position.Y,Position.Z))
    TeleportZone(Zone);
}
void ATerraVehicle::Tick(float Dt) {
  TRACE_CPUPROFILER_EVENT_SCOPE(TerraVehicleTick);
  Super::Tick(Dt);
  if (!Terrain) {
    for (TActorIterator<ATerraWorld> I(GetWorld()); I; ++I) {
      Terrain = *I;
      break;
    }
  }
  if (!Terrain || !Terrain->Ready)
    return;
  if (!Initialized) {
    if(!AutoTest)LoadGarage(GaragePath());
    SelectVehicle(AutoTest?0:LastVehicle);
    Initialized = true;
    if(!AutoTest)SetGarage(true);
  }
  const float BodyContactDt=Dt;
  Dt = FMath::Min(Dt, .1f);
  Input(Dt);
  if(PauseMenuOpen)return;
  UpdateLamps();
  if(!Garage){
    Terrain->ActivateSoil(GetActorLocation());
    ProcessBodyGroundContacts(BodyContactDt);
    UpdateBodyGroundGrip();
    SoilTimer += Dt;
    UpdateTireAir(Dt);
    Simulate(Dt);
    UpdateSpray(Dt);
    UpdateRoute(Dt);
  }else{
    PendingBodyGroundContacts.Reset();
    CameraArm->bEnableCameraLag=false;
    CameraArm->SocketOffset=FVector::ZeroVector;
    CameraArm->TargetArmLength=GarageDistance;
    CameraArm->SetWorldLocation(GetActorLocation()+FVector(0,0,-15));
    CameraArm->SetWorldRotation(FRotator(GaragePitch,GetActorRotation().Yaw+GarageYaw,0));
    UpdateLamps();
    return;
  }
  SpawnCooldown = FMath::Max(0.f, SpawnCooldown - Dt);
  CameraArm->bEnableCameraLag = SpawnCooldown <= 0;
  // Keep the boom pivot above a rolled chassis instead of rotating its local
  // mounting offset through the ground. Inverted loop contact needs a view
  // from inside the loop, below its ceiling.
  const bool InvertedSupport = GetActorUpVector().Z < -.3f && !Overturned;
  // The long boom crosses the curved ceiling near the loop apex. Keep a
  // shorter inside view there, with enough distance to clear the vehicle.
  const bool BenchmarkCamera=AutoTest&&FParse::Param(FCommandLine::Get(),TEXT("TerraQuarryPerformanceOnly"));
  const FRotator ViewRotation(AutoTest&&TestMarkCamera?-48:InvertedSupport?-CameraPitch:CameraPitch,GetActorRotation().Yaw+CameraYaw,0);
  FVector Focus=GetActorLocation()+FVector(0,0,InvertedSupport?-75:BenchmarkCamera?110:10);
  FVector SweepOrigin=Focus;CameraArm->SocketOffset=FVector::ZeroVector;
  float Distance=BenchmarkCamera?1150:InvertedSupport?500:NearCamera?FMath::Max(850.f,Number(TEXT("length"),4.8f)*170.f):FMath::Max(1250.f,Number(TEXT("length"),4.8f)*210.f);
  if(!BenchmarkCamera&&!InvertedSupport&&Body->GetStaticMesh()){
    // Frame the visible envelope above the bottom HUD. Work from mesh-local
    // corners: world AABBs expand with yaw, and wheel AABBs expand as a round
    // tire spins, making an otherwise steady following camera pulse in/out.
    TArray<FVector,TInlineAllocator<56>> Corners;
    FBox ActorEnvelope(ForceInit);const FTransform WorldToActor=GetActorTransform().Inverse();
    auto AddBox=[&](const FBox& Box,const FTransform& Transform){for(int I=0;I<8;++I){
      const FVector Local=Box.GetCenter()+Box.GetExtent()*FVector(I&1?1:-1,I&2?1:-1,I&4?1:-1);
      const FVector World=Transform.TransformPosition(Local);Corners.Add(World);ActorEnvelope+=WorldToActor.TransformPosition(World);
    }};
    AddBox(Body->GetStaticMesh()->GetBoundingBox(),Body->GetComponentTransform());
    for(int I=0;I<Wheels.Num();++I){auto* Wheel=Wheels[I].Get();
      if(!Wheel||!Wheel->IsVisible()||!Wheel->GetStaticMesh())continue;
      const FBox Box=Wheel->GetStaticMesh()->GetBoundingBox();
      if(Tracks){AddBox(Box,Wheel->GetComponentTransform());continue;}
      const FVector Scale=Wheel->GetComponentTransform().GetScale3D().GetAbs();
      const FQuat Pose=FQuat(GetActorUpVector(),Overturned?0.f:WheelState[I].Angle)*GetActorQuat();
      const float RadiusCM=FMath::Max(FMath::Max(FMath::Abs(Box.Min.X),FMath::Abs(Box.Max.X))*Scale.X,
        FMath::Max(FMath::Abs(Box.Min.Z),FMath::Abs(Box.Max.Z))*Scale.Z)+.5f;
      const float HalfWidthCM=Box.GetExtent().Y*Scale.Y;
      const FVector Center=Wheel->GetComponentLocation()+Pose.RotateVector(FVector(0,Box.GetCenter().Y*Scale.Y,0));
      // A fixed radial envelope includes small tread bevels. Only real steer
      // and suspension change this frame; rolling tread does not change it.
      const FVector Extent(RadiusCM,HalfWidthCM,RadiusCM);
      AddBox(FBox(-Extent,Extent),FTransform(Pose,Center));
    }
    const FVector Center=GetActorTransform().TransformPosition(ActorEnvelope.GetCenter());
    const FRotationMatrix Basis(ViewRotation);
    const FVector ViewForward=Basis.GetUnitAxis(EAxis::X),ViewRight=Basis.GetUnitAxis(EAxis::Y),ViewUp=Basis.GetUnitAxis(EAxis::Z);
    int ViewWidth=1600,ViewHeight=900;if(auto* PC=Cast<APlayerController>(GetController()))PC->GetViewportSize(ViewWidth,ViewHeight);
    // Match UE's MaintainY projection at every window aspect ratio. Its
    // horizontal FOV is defined at Camera.AspectRatio, not the live viewport.
    Camera->bOverrideAspectRatioAxisConstraint=true;Camera->AspectRatioAxisConstraint=AspectRatio_MaintainYFOV;
    const float TanV=FMath::Tan(FMath::DegreesToRadians(Camera->FieldOfView*.5f))/FMath::Max(.01f,Camera->AspectRatio);
    const float TanH=TanV*FMath::Max(1,ViewWidth)/FMath::Max(1,ViewHeight);
    constexpr float Bias=.24f,Top=.88f,Bottom=-.40f;
    for(const FVector& Corner:Corners){
      const FVector P=Corner-Center;
      const float X=FVector::DotProduct(P,ViewRight),Y=FVector::DotProduct(P,ViewUp),Z=FVector::DotProduct(P,ViewForward);
      Distance=FMath::Max(Distance,FMath::Abs(X)/(.90f*TanH)-Z);
      Distance=FMath::Max(Distance,(Y-Top*TanV*Z)/((Top-Bias)*TanV));
      Distance=FMath::Max(Distance,(Bottom*TanV*Z-Y)/((Bias-Bottom)*TanV));
    }
    Focus=Center-ViewUp*(Bias*Distance*TanV);
    // The optical focus biases the vehicle above the HUD, but can lie below
    // ground when a low vehicle is rolled. Starting the boom sweep there
    // immediately collapses it underground. Keep its collision origin above
    // the terrain and carry only the optical delta in the local socket offset.
    // UE sweeps from this safe origin to the same desired camera endpoint.
    SweepOrigin=Center;
    SweepOrigin.Z=FMath::Max(SweepOrigin.Z,Terrain->Height(SweepOrigin.X,SweepOrigin.Y)+CameraArm->ProbeSize+8.f);
    CameraArm->SocketOffset=ViewRotation.UnrotateVector(Focus-SweepOrigin);
  }
  CameraArm->TargetArmLength=Distance;CameraArm->SetWorldLocation(SweepOrigin);CameraArm->SetWorldRotation(ViewRotation);
  SurfaceName =
      Terrain->Data
          ->GetArrayField(TEXT("surfaces"))[WheelState[0].Ground.Surface]
          ->AsString();
}
void ATerraVehicle::BodyHit(UPrimitiveComponent *Hit, AActor *OtherActor,
                            UPrimitiveComponent *Other, FVector Impulse,
                            const FHitResult &Result) {
  if (SpawnCooldown > 0)
    return;
  CacheRolledBodyContact(Other,Result);
  const float Impact=Impulse.Size()/FMath::Max(1.f,Chassis->GetMass()*100);
  const bool GroundHit=Other&&(Other->ComponentHasTag(TEXT("TerraGround"))||
      Other->GetClass()->GetName().StartsWith(TEXT("Landscape")));
  if(GroundHit){++TerrainBodyHits;TerrainImpactMPS=FMath::Max(TerrainImpactMPS,Impact);}
  else {++ObjectBodyHits;ObjectImpactMPS=FMath::Max(ObjectImpactMPS,Impact);}
  if(GroundHit)QueueBodyGroundContact(Impulse,Result);
  if(AutoTest&&(Impact>.25f||GetWorld()->GetTimeSeconds()>=NextBodyDiagnosticTime)){
    NextBodyDiagnosticTime=GetWorld()->GetTimeSeconds()+1;
    const auto *OtherMesh=Cast<UStaticMeshComponent>(Other);
    FString ContactTags;if(Other)for(const auto &Tag:Other->ComponentTags){if(!ContactTags.IsEmpty())ContactTags+=TEXT(",");ContactTags+=Tag.ToString();}
    const FVector Local=GetActorTransform().InverseTransformPosition(Result.ImpactPoint);
    UE_LOG(LogTemp,Display,TEXT("TERRA_BODY_CONTACT terrain=%d impulseMPS=%.3f collider=%s actor=%s component=%s class=%s mesh=%s tags=%s item=%d face=%d position=%s local=%s normal=%s penetration=%.3f root=%s rotation=%s velocity=%s"),
        GroundHit,Impact,*GetNameSafe(Hit),*GetPathNameSafe(OtherActor),*GetNameSafe(Other),Other?*Other->GetClass()->GetName():TEXT("None"),
        *GetPathNameSafe(OtherMesh?OtherMesh->GetStaticMesh():nullptr),*ContactTags,Result.Item,Result.FaceIndex,*Result.ImpactPoint.ToString(),*Local.ToString(),
        *Result.ImpactNormal.ToString(),Result.bStartPenetrating?Result.PenetrationDepth:0,*GetActorLocation().ToString(),*GetActorRotation().ToString(),*Chassis->GetPhysicsLinearVelocity().ToString());
  }
  RegisterDamageImpact(Impulse,Result,GroundHit);
  if (Terrain)
    Terrain->HitTree(Other, -Impulse, Result.ImpactPoint);
}
void ATerraVehicle::OnBodyHit(UPrimitiveComponent *Hit,
                              UPrimitiveComponent *Other, FVector Impulse,
                              const FHitResult &Result) {}
float ATerraVehicle::BumpTravel(bool Front) const {
  if(!Spec.IsValid())return .15f;
  const auto S=Spec->GetObjectField(TEXT("suspension"));
  double Travel=S->GetNumberField(TEXT("travel"));
  S->TryGetNumberField(Front?TEXT("travelFront"):TEXT("travelRear"),Travel);
  return TerraSim::SuspensionBumpTravel(float(Travel),Tuning.Travel);
}
float ATerraVehicle::ReboundTravel(int Axle) const {
  // Ride height already compresses the spring by its static preload.
  const float StaticLoad=Mass*9.81f*AxleLoadFraction(Axle)*.5f;
  return Droop+StaticLoad/Spring;
}
void ATerraVehicle::SaveSetup() {
  if(AutoTest)return;
  SaveGarage(GaragePath());
  GConfig->SetFloat(TEXT("TerraDrive"), TEXT("Pressure"), Pressure,
                    GGameUserSettingsIni);
  GConfig->SetBool(TEXT("TerraDrive"), TEXT("Tracks"), Tracks,
                   GGameUserSettingsIni);
  GConfig->Flush(false, GGameUserSettingsIni);
}
void ATerraVehicle::EndPlay(const EEndPlayReason::Type EndPlayReason){
  if(Initialized&&!AutoTest)SaveGarage(GaragePath());
  Super::EndPlay(EndPlayReason);
}
