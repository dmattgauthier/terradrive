#include "TerraVehicle.h"
#include "ProceduralMeshComponent.h"
#include "TerraSimCore.h"
#include "TerraContact.h"
#include "TerraDriving.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "DrawDebugHelpers.h"
#include "Engine/World.h"
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
void ATerraVehicle::SelectVehicle(int Index) {
  if (!Terrain || !Terrain->Data)
    return;
  auto &List = Terrain->Data->GetArrayField(TEXT("vehicles"));
  const int PreviousRoute = RouteIndex;
  Terrain->BreakTireMarks();
  if(Spec.IsValid()&&Initialized){PressureProfiles[VehicleIndex]=PressureTarget;BatteryProfiles[VehicleIndex]=BatterySOC;}
  VehicleIndex = (Index + List.Num()) % List.Num();
  Spec = List[VehicleIndex]->AsObject();
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
  for(int I=0;I<4;++I)LastWheelDriveNm[I]=LastWheelRegenNm[I]=0;
  const float Length=Number(TEXT("bodyLength"),Number(TEXT("length"),4.8f));
  const float HalfWidth=Number(TEXT("width"),1.8f)*.42f;
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
  FrontLocked = RearLocked = DescentAssist = LowRange = false;
  FourDrive = VehicleIndex != 2 && VehicleIndex != 3;
  for (auto W : Wheels)
    W->SetStaticMesh(LoadObject<UStaticMesh>(
        nullptr, *(TEXT("/Game/Meshes/") + Asset + TEXT("_tire"))));
  for(auto Rim:Rims)Rim->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,*(TEXT("/Game/Meshes/")+Asset+TEXT("_rim"))));
  if(SuspensionParts.Num()==20){
    auto *SpringMesh=LoadObject<UStaticMesh>(nullptr,VehicleIndex==4?TEXT("/Game/Meshes/detail_airstrut"):TEXT("/Game/Meshes/detail_coil"));
    for(int I=0;I<4;++I)SuspensionParts[I*4+2]->SetStaticMesh(SpringMesh);
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
  if (VehicleIndex == 2) {
    Notice = TEXT("Tracks unavailable for the Civic");
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
void ATerraVehicle::TeleportRoute(int Index) {
  if (!Terrain || Terrain->Routes.IsEmpty()) return;
  const int R = (Index + Terrain->Routes.Num()) % Terrain->Routes.Num();
  const auto &Route = Terrain->Routes[R];
  TeleportZone(Route.Zone);
  RouteIndex = R; GateIndex = 0; RouteTime = 0;
  SetActorLocationAndRotation(Route.Spawn + FVector(0,0,CG*100+16+Tuning.Lift*100+(Radius-Number(TEXT("tireRadius"),.42f))*100),
      FRotator(0,Route.Yaw,0),false,nullptr,ETeleportType::TeleportPhysics);
  PreviousRoutePosition = GetActorLocation();
  Notice = Route.Hint;
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
    if(RouteIndex==8){const FVector Previous=GateIndex>0?Route.Gates[GateIndex-1]:Route.Spawn;GateForward=(G-Previous).GetSafeNormal2D();}
    const FVector GateSide(-GateForward.Y,GateForward.X,0);
    if (FVector::DotProduct(PreviousRoutePosition-G,GateForward)<0 && FVector::DotProduct(P-G,GateForward)>=0 &&
        FMath::Abs(FVector::DotProduct(P-G,GateSide)) < Route.GateWidth*50 && FMath::Abs(P.Z-G.Z)<300) ++GateIndex;
    PreviousRoutePosition = P;
  }
  RouteStatus = FString::Printf(TEXT("%s | Gate %d/%d | %.1f s%s"), *Route.Name,
      GateIndex,Route.Gates.Num(),RouteTime,GateIndex==Route.Gates.Num()?TEXT("  COMPLETE"):TEXT(""));
}
void ATerraVehicle::Input(float Dt) {
  auto *PC = Cast<APlayerController>(GetController());
  if (!PC)
    return;
  if (AutoTest) {
    if(TestDriverInput){
      const auto Demand=TerraSim::DriverControls(Direction,TestForward,TestReverse,0,0,TestStop,Speed,Dt,ReverseHold,ReverseReleaseRequired);
      Throttle=Demand.Throttle;Brake=Demand.Brake;
    }else{Throttle = TestThrottle;Brake = TestBrake;}
    Steer = FMath::FInterpTo(Steer, TestSteer, Dt, 5*TirePressureHandling().SteeringResponse);
    return;
  }
  auto Down = [&](FKey Key) { return PC->IsInputKeyDown(Key); };
  auto Press = [&](FKey Key) { return PC->WasInputKeyJustPressed(Key); };
  if (Press(EKeys::Escape)) {
    PC->ConsoleCommand(TEXT("quit"));
    return;
  }
  if (Press(EKeys::Tab)) { SetGarage(!Garage); return; }
  if (Garage) { Throttle=Steer=0; Brake=1; return; }
  if (Press(EKeys::V)) { SetGarage(true); return; }
  if (Press(EKeys::R))
    { if (RouteIndex >= 0) TeleportRoute(RouteIndex); else TeleportZone(Zone); }
  if (Press(EKeys::J)) TeleportRoute(RouteIndex + 1);
  if (Press(EKeys::Z)) ToggleLocker(false);
  if (Press(EKeys::U)) ToggleLocker(true);
  if (Press(EKeys::K) && VehicleIndex != 2 && VehicleIndex != 3) {
    DescentAssist = !DescentAssist;
    Notice = DescentAssist ? TEXT("Descent assist: brake-controlled 4.5 mph target") : TEXT("Descent assist off");
  }
  FKey Keys[] = {EKeys::One,  EKeys::Two, EKeys::Three, EKeys::Four,
                 EKeys::Five, EKeys::Six, EKeys::Seven, EKeys::Eight, EKeys::Nine};
  for (int I = 0; I < 9; I++)
    if (Press(Keys[I]))
      { if (I==6) TeleportRoute(0); else if (I==8) TeleportRoute(4); else TeleportZone(I); }
  if (Press(EKeys::T))
    SetTracks(!Tracks);
  if (Press(EKeys::F)) {
    if(!HasFourDrive())Notice=TEXT("Fit the drivetrain upgrade for four-wheel drive");
    else if(DriveCapabilities().Permanent)Notice=TEXT("Permanent all-wheel drive remains engaged");
    else if(FMath::Abs(Speed)>.5f)Notice=TEXT("Stop before changing driven axles");
    else{
      FourDrive = !FourDrive;
      if (!FourDrive) FrontLocked = RearLocked = LowRange = false;
      Notice = DriveDescription();
    }
  }
  if (Press(EKeys::L)) {
    if(!HasLowRange())Notice=TEXT("Fit the drivetrain low-range upgrade in the garage");
    else if (FMath::Abs(Speed) < .5f){
      LowRange = !LowRange;if (LowRange) FourDrive = true;else FrontLocked = RearLocked = false;
      Notice=DriveDescription();
    }else Notice = TEXT("Stop to shift low range");
  }
  if (Press(EKeys::Equals) || Press(EKeys::Add)) {
    RequestTirePressure(PressureTarget+2);
    SaveSetup();
  }
  if (Press(EKeys::Hyphen) || Press(EKeys::Subtract)) {
    RequestTirePressure(PressureTarget-2);
    SaveSetup();
  }
  if (Press(EKeys::P))
    Terrain->SetRain(!Terrain->Rain);
  if (Press(EKeys::BackSpace)) {
    Terrain->ResetSoil();
    RepairDamage();
    Parcels.Empty();
  }

  if (Press(EKeys::X)) {
    if (WinchAttached)
      WinchAttached = false;
    else {
      Anchor = Terrain->FindAnchor(GetActorLocation());
      WinchAttached = !Anchor.IsNearlyZero();
      WinchLength = FVector::Dist(Anchor, GetActorLocation()) / 100;
      Notice = WinchAttached ? TEXT("Winch attached — hold Q to reel")
                             : TEXT("No standing anchor within 148 ft");
    }
  }
  Reeling = Down(EKeys::Q);
  float AX = PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftX),
        RT = PC->GetInputAnalogKeyState(EKeys::Gamepad_RightTriggerAxis),
        LT = PC->GetInputAnalogKeyState(EKeys::Gamepad_LeftTriggerAxis);
  bool W = Down(EKeys::W) || Down(EKeys::Up),
       S = Down(EKeys::S) || Down(EKeys::Down);
  float Target = (Down(EKeys::D) || Down(EKeys::Right) ? 1.f : 0.f) -
                 (Down(EKeys::A) || Down(EKeys::Left) ? 1.f : 0.f);
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
      Down(EKeys::SpaceBar)||Down(EKeys::Gamepad_FaceButton_Bottom),Speed,Dt,ReverseHold,ReverseReleaseRequired);
  Throttle=Demand.Throttle;Brake=Demand.Brake;
  float MX = 0, MY = 0;
  PC->GetInputMouseDelta(MX, MY);
  if (Down(EKeys::RightMouseButton)) {
    CameraYaw += MX * .22f;
    CameraPitch = FMath::Clamp(CameraPitch + MY * .2f, -50.f, 5.f);
  }
  if (Press(EKeys::C))
    NearCamera = !NearCamera;
  if (Down(EKeys::LeftShift)) Throttle *= .28f;
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
  for (auto &W : WheelState)
    MeanOmega += FMath::Abs(W.Omega) * .25f;
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
  const float WaterDepth=Terrain->Sample(GetActorLocation()).Water/100;
  TotalTorque*=1-FMath::Clamp((WaterDepth-Tuning.WaterDepth)*1.1f,0.f,.65f);
  if (Tracks && FMath::Abs(Speed) > 12)
    TotalTorque = 0;
  if (LowRange) TotalTorque *= FMath::Clamp(8.f-FMath::Abs(Speed),0.f,1.f);
  const float SteerAngle =
      Steer * FMath::DegreesToRadians(34.f) / (1 + FMath::Abs(Speed) * .025f) + DamageSteeringOffset();
  const float RearSteerAngle=VehicleIndex==4 ? -SteerAngle*.25f/(1+FMath::Abs(Speed)*.15f) : VehicleIndex==5?SteerAngle*FMath::Lerp(-.12f,.06f,FMath::Clamp((FMath::Abs(Speed)-8)/18,0.f,1.f)):0;
  float TotalLoad = 0;
  ContactCount = 0;
  LastTireForceN = 0;
  float Capacities[4] = {}, Drives[4] = {};
  // Resolve every contact before sharing torque between an axle's two wheels.
  for (int I = 0; I < 4; ++I) {
    auto &W = WheelState[I];
    const bool Front = I < 2;
    const float StaticLoad = Mass * 9.81f * (Front ? FrontWeight : 1-FrontWeight) * .5f;
    const float Preload = StaticLoad / Spring;
    // Mount geometry belongs to the stock body. Extra spring length and tire
    // radius must raise the body, matching the garage, rather than lower it.
    const FVector Local(Wheelbase * (Front ? 1-FrontWeight : -FrontWeight)*100,
        (I%2 ? 1:-1)*Track*50, (Number(TEXT("tireRadius"),.42f)+Rest-CG-Preload-Tuning.Lift)*100);
    const FVector Mount = GetActorTransform().TransformPosition(Local);
    W.Angle=Tracks?(Front?SteerAngle:RearSteerAngle):TerraSim::AckermannAngle(Front?SteerAngle:RearSteerAngle,
        Front?RearSteerAngle:SteerAngle,(I%2?1.f:-1.f)*Track*.5f,Front?Wheelbase:-Wheelbase);
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
    const FVector MountVelocity=Chassis->GetPhysicsLinearVelocityAtPoint(Mount)/100;
    W.PointVelocity = Chassis->GetPhysicsLinearVelocityAtPoint(W.Contact)/100;
    W.Load = Support.Hit ? FMath::Clamp(TerraSim::ProgressiveSuspensionForce(Rest-W.Distance,
        FVector::DotProduct(MountVelocity,Normal),Spring,Damping,StaticLoad/9.81f,Normal.Z,Dt,Bump),0.f,StaticLoad*6) : 0;
    W.SoilLoad=TerraSim::FilteredSoilLoad(W.SoilLoad,
        W.ContactValid&&!W.Constructed?W.Load:0,Dt);
    TotalLoad += W.Load;
    if (W.Load>50) ++ContactCount;
    W.ForceForward = (WF-Normal*FVector::DotProduct(WF,Normal)).GetSafeNormal();
    W.ForceSide = FVector::CrossProduct(Normal,W.ForceForward).GetSafeNormal();
    W.LongSpeed = FVector::DotProduct(W.PointVelocity,W.ForceForward);
    W.LateralSpeed = FVector::DotProduct(W.PointVelocity,W.ForceSide);
    W.Footprint=TerraSim::FootprintLength(W.Load,WheelPressure(I),Tracks?.48f:AxleWidth,Radius,Tracks);
    W.RutDepth=W.Constructed?0:W.Ground.RutDepth;
    const float Placard=Number(Front?TEXT("stockPSIFront"):TEXT("stockPSIRear"),Number(TEXT("stockPSI"),35));
    const auto Air=TerraSim::EvaluateTirePressure(WheelPressure(I),Placard,StaticLoad,Number(TEXT("mass"),2100)*9.81f*(Front?FrontWeight:1-FrontWeight)*.5f,Speed,W.Ground.Softness,Tracks);
    const float BaseGrip=TerraSim::TerrainGrip(W.Ground.Mu,W.Load,StaticLoad,Placard,Placard,
        W.Ground.MaxSink>0,Tracks,W.Ground.Packing,W.Slip,W.Ground.Water/100,W.LongSpeed)*Tuning.Grip*
        (Tracks?(W.Ground.Surface==6?1.5f:.84f):1.f);
    W.Grip=BaseGrip*Air.LongitudinalGrip;W.SideGrip=BaseGrip*Air.LateralGrip;W.CorneringResponse=Air.CorneringStiffness;
    Capacities[I] = W.Load*W.Grip*Radius;
  }
  bool InvertedTrackSupport=false;
  for(const auto& W:WheelState)InvertedTrackSupport|=W.Constructed&&W.Load>50&&FVector::DotProduct(W.Ground.Normal,Up)>.35f;
  Overturned = Up.Z < .15f && !InvertedTrackSupport;
  if (Overturned) { TotalTorque = 0; Throttle = 0; Steer = 0; }
  if (FMath::Abs(Speed)>11.1f) FrontLocked=RearLocked=false;
  float Omega[4];for(int I=0;I<4;++I){Omega[I]=WheelState[I].Omega;LastWheelDriveNm[I]=LastWheelRegenNm[I]=0;}
  const float Environment= Tuning.DriveEfficiency*DamageDriveFactor()*(1-FMath::Clamp((WaterDepth-Tuning.WaterDepth)*1.1f,0.f,.65f));
  float ElectricThrottle=Throttle*(BatterySOC>.001f?1.f:0.f);
  if(Tracks&&FMath::Abs(Speed)>12)ElectricThrottle=0;
  
  const auto MotorDrive=TerraSim::ElectricDriveTorque(EV,Omega,ElectricThrottle,Direction,Low,PortalReduction(),Environment,FourDrive);
  if(Electric){RPM=0;for(float MotorRPM:MotorDrive.MotorRPM)RPM=FMath::Max(RPM,MotorRPM);}
  for (int Axle=0;Axle<2;++Axle) {
    if (!DrivenWheel(Axle*2)) continue;
    const int A=Axle*2;
    if(Electric&&IndependentWheel(A)){Drives[A]=MotorDrive.Wheel[A];Drives[A+1]=MotorDrive.Wheel[A+1];continue;}
    const bool BothDriven=DrivenWheel(0)&&DrivenWheel(2);
    const float FrontShare=Number(TEXT("frontTorqueFraction"),.5f);
    const float Demand=Electric?MotorDrive.Axle[Axle]:TotalTorque*(BothDriven?(Axle==0?FrontShare:1-FrontShare):1.f);
    const bool Locked=Axle==0?FrontLocked:RearLocked;
    auto Split=TerraSim::SplitAxleTorque(Demand,Capacities[A],Capacities[A+1],Locked);
    if(!Locked&&UpgradeStage(TerraSim::Differentials)>=3){
      const auto Bias=TerraSim::LimitedSlipTorque(Demand,Capacities[A],Capacities[A+1]);
      Split.left=Bias.Left;Split.right=Bias.Right;
    }
    Drives[A]=Split.left; Drives[A+1]=Split.right;
  }
  const float AssistBrake = DescentAssist && Throttle<.05f
      ? FMath::Clamp((FMath::Abs(Speed)-2.f)*.45f,0.f,.8f) : 0.f;
  const float EffectiveBrake = FMath::Max(Brake,AssistBrake);
  if(AssistBrake>Brake){BrakeLampLevel=5;for(auto Lamp:BrakeLamps)Lamp->SetScalarParameterValue(TEXT("TerraLamp"),5);UpdateDamageVisuals();}
  const auto Regeneration=TerraSim::ElectricRegen(EV,Omega,EffectiveBrake,Throttle<.01f?.08f:0.f,
      FMath::Clamp((.99f-BatterySOC)/.04f,0.f,1.f),Low,PortalReduction(),Environment,FourDrive);
  const float Inertia=Tracks?24.f+Tuning.RotatingMass:WheelInertia(), R=Radius;
  const FVector BodyInertia=Chassis->GetInertiaTensor()/10000,BodyCenter=Chassis->GetCenterOfMass()/100;
  const FQuat BodyRotation=Chassis->GetComponentQuat();
  const float WheelRevLimit=Electric?0:RedlineRPM*2*PI/
      (60*FMath::Max(.1f,Ratio*Final*Low));
  float Stiffness[4]={}, Drag[4]={}, Lateral[4]={}, LongLimit[4]={};
  for(int I=0;I<4;++I){
    const auto &W=WheelState[I];
    const float Share=Mass*(I<2?FrontWeight:1-FrontWeight)*.5f;
    Stiffness[I]=TerraSim::ContactStiffness(W.Load*(W.Ground.Surface==1?10.f:5.f)/FMath::Max(2.f,FMath::Abs(W.LongSpeed)),Share,Dt);
    const bool Driven=DrivenWheel(I);
    const float EngineBrake=!Electric&&Driven&&Throttle<.05f&&LowRange?Mass*9.81f*R*.035f:0.f;
    const float Rut=TerraSim::RutResistance(W.RutDepth,R,W.Ground.Softness,W.Ground.Packing,Tracks);
    const auto Air=TerraSim::EvaluateTirePressure(WheelPressure(I),Number(I<2?TEXT("stockPSIFront"):TEXT("stockPSIRear"),Number(TEXT("stockPSI"),35)),Share*9.81f,Number(TEXT("mass"),2100)*9.81f*(I<2?FrontWeight:1-FrontWeight)*.5f,Speed,W.Ground.Softness,Tracks);
    const float Service=EffectiveBrake*Mass*9.81f*R*.4f*DamageBrakeFactor();
    const float Regen=Regeneration.Independent[I]?Regeneration.Wheel[I]:Regeneration.Axle[I/2]*.5f;
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
  for(int Axle=0;Axle<2;++Axle){
    const int A=Axle*2,B=A+1;
    const bool Locked=(Axle==0?FrontLocked:RearLocked)&&!IndependentWheel(A);
    if(Locked){
      // A locked axle shares shaft speed as well as torque. Solve both tire
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
      if(DrivenWheel(I)&&Throttle>.02f&&(IndependentWheel(I)||Spec->GetObjectField(TEXT("features"))->GetBoolField(TEXT("tractionControl"))))
        Demand=TerraSim::TractionControlledTorque(Demand,W.Omega,W.LongSpeed,R,Inertia,Dt,Stiffness[I],LongLimit[I],Drag[I],Direction);
      const float Drive=Electric?Demand:TerraSim::RevLimitedTorque(Demand,W.Omega,Inertia,Dt,WheelRevLimit,Reaction,DragTorque);
      LastWheelDriveNm[I]=Drive;
      const float Free=W.Omega+Drive*Dt/Inertia;
      W.Omega=TerraSim::CombinedWheelOmega(Free,Stiffness[I],W.LongSpeed,R,Dt,Inertia,LongLimit[I],
          Lateral[I]/FMath::Max(1.f,W.SideGrip*W.Load),Drag[I]);
    }
  }
  float BrakeSupportLoad=0;
  for(const auto &Wheel:WheelState)if(Wheel.ContactValid&&Wheel.Load>50)BrakeSupportLoad+=Wheel.Load;
  for (int I=0;I<4;++I) {
    auto &W=WheelState[I];
    const float C=Stiffness[I];
    const auto Combined=TerraSim::CombinedTireForces(C*(W.Omega*R-W.LongSpeed),Lateral[I],LongLimit[I],W.SideGrip*W.Load);
    float FX=Combined.Longitudinal,FY=Combined.Lateral;
    if(EffectiveBrake>.05f&&FMath::Abs(W.LongSpeed)<1.f&&W.ContactValid&&W.Load>50){
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
      FX=FMath::Clamp(-ContactMass(W.ForceForward)*W.LongSpeed/FMath::Max(Dt,.008f)+Share*9.81f*W.ForceForward.Z,-HoldLimit,HoldLimit);
      FY=FMath::Clamp(-ContactMass(W.ForceSide)*W.LateralSpeed/FMath::Max(Dt,.008f)+Share*9.81f*W.ForceSide.Z,-W.SideGrip*W.Load,W.SideGrip*W.Load);
    }
    const float Ellipse=FMath::Sqrt(FMath::Square(FX/FMath::Max(1.f,W.Grip*W.Load))+FMath::Square(FY/FMath::Max(1.f,W.SideGrip*W.Load)));
    const float Scale=Ellipse>1?1/Ellipse:1;
    FX*=Scale; FY*=Scale;
    if(AutoTest&&RouteIndex==8&&int(RouteTime)!=int(RouteTime+Dt))
      UE_LOG(LogTemp,Display,TEXT("TERRA_TRAIL_CONTACT t=%.1f wheel=%d dt=%.3f fx=%.0f fy=%.0f omega=%.2f long=%.2f lateral=%.2f distance=%.3f normal=%s"),RouteTime,I,Dt,FX,FY,W.Omega,W.LongSpeed,W.LateralSpeed,W.Distance,*W.Ground.Normal.ToString());
    W.Slip=(W.Omega*R-W.LongSpeed)/FMath::Max(2.f,FMath::Abs(W.LongSpeed));
    W.SoilSlip+=(FMath::Clamp(W.Slip,-2.f,2.f)-W.SoilSlip)*(1-FMath::Exp(-Dt/.10f));
    if (W.Load>0 && W.ContactValid) {
      Chassis->AddForceAtLocation((W.Ground.Normal*W.Load+W.ForceForward*FX+W.ForceSide*FY)*100,W.Contact);
      LastTireForceN+=FMath::Abs(FX)+FMath::Abs(FY);
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
  if(Electric){float Consumed=0;for(int I=0;I<4;++I){Consumed+=FMath::Max(0.f,LastWheelDriveNm[I]*WheelState[I].Omega);LastRegenPowerW+=LastWheelRegenNm[I]*FMath::Abs(WheelState[I].Omega)*.82f;}
    LastRegenPowerW=FMath::Min(LastRegenPowerW,Regeneration.RecoveredPowerW);
    BatterySOC=FMath::Clamp(BatterySOC+(LastRegenPowerW-Consumed/FMath::Max(.5f,EV.Efficiency)-350.f)*Dt/FMath::Max(1.f,EV.BatteryKWh*3600000.f),0.f,1.f);
  }
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
  Dt = FMath::Min(Dt, .1f);
  Input(Dt);
  UpdateLamps();
  if(!Garage){
    Terrain->ActivateSoil(GetActorLocation());
    SoilTimer += Dt;
    UpdateTireAir(Dt);
    Simulate(Dt);
    UpdateSpray(Dt);
    UpdateRoute(Dt);
  }else{
    CameraArm->bEnableCameraLag=false;
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
  CameraArm->TargetArmLength = NearCamera ? 340 : InvertedSupport ? 500 : 1150;
  CameraArm->SetWorldLocation(GetActorLocation()+FVector(0,0,InvertedSupport?-75:110));
  CameraArm->SetWorldRotation(
      FRotator(AutoTest&&TestMarkCamera?-48:InvertedSupport?-CameraPitch:CameraPitch, GetActorRotation().Yaw + CameraYaw, 0));
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
  const float Impact=Impulse.Size()/FMath::Max(1.f,Chassis->GetMass()*100);
  const bool GroundHit=Other&&(Other->ComponentHasTag(TEXT("TerraGround"))||
      Other->GetClass()->GetName().StartsWith(TEXT("Landscape")));
  if(GroundHit){++TerrainBodyHits;TerrainImpactMPS=FMath::Max(TerrainImpactMPS,Impact);}
  else {++ObjectBodyHits;ObjectImpactMPS=FMath::Max(ObjectImpactMPS,Impact);}
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
void ATerraVehicle::SaveSetup() {
  if(AutoTest)return;
  SaveGarage(GaragePath());
  GConfig->SetFloat(TEXT("TerraDrive"), TEXT("Pressure"), Pressure,
                    GGameUserSettingsIni);
  GConfig->SetBool(TEXT("TerraDrive"), TEXT("Tracks"), Tracks,
                   GGameUserSettingsIni);
  GConfig->Flush(false, GGameUserSettingsIni);
}
