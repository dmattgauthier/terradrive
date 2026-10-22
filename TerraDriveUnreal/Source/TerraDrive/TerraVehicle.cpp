#include "TerraVehicle.h"
#include "TerraSimCore.h"
#include "TerraContact.h"
#include "TerraDriving.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "DrawDebugHelpers.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/Parse.h"
#include "Materials/MaterialInstanceDynamic.h"

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
  AutoTest = FParse::Param(FCommandLine::Get(), TEXT("TerraValidate"));
  CreateVisualDetails();
  SelectVehicle(0);
  TeleportZone(0);
  auto *Sphere = LoadObject<UStaticMesh>(
      nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
  FString Names[] = {TEXT("mud"), TEXT("water"), TEXT("snow"), TEXT("sand")};
  for (const FString &N : Names) {
    auto *M = NewObject<UInstancedStaticMeshComponent>(this);
    M->SetupAttachment(RootComponent);
    M->SetAbsolute(true, true, true);
    M->SetStaticMesh(Sphere);
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
  Pressure = Number(TEXT("stockPSI"), 35);
  Chassis->SetBoxExtent(
      FVector(Number(TEXT("bodyLength"), Number(TEXT("length"), 4.8)) * .43f,
              Number(TEXT("width"), 1.8) * .42f, VehicleIndex==5?CG-Number(TEXT("clearance"),.158f):.22f) *
      100);
  Chassis->SetMassOverrideInKg(NAME_None, Mass);
  RoofCollision->SetBoxExtent(FVector(Number(TEXT("length"),4.8)*.30f,
      Number(TEXT("width"),1.8)*.33f,Number(TEXT("height"),1.8)*.28f)*100);
  RoofCollision->SetRelativeLocation(FVector(0,0,(Number(TEXT("height"),1.8)*.62f-CG)*100));
  Chassis->SetCenterOfMass(FVector::ZeroVector);
  Damage = 0;
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
  if (Tracks)
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
  const auto Features = Spec->GetObjectField(TEXT("features"));
  if (!Features->GetBoolField(Front ? TEXT("frontLocker") : TEXT("rearLocker"))) {
    Notice = TEXT("This vehicle has no axle locker"); return;
  }
  if (FMath::Abs(Speed) > .5f || !FourDrive ||
      (VehicleIndex != 4 && (Front || VehicleIndex == 0) && !LowRange)) {
    Notice = TEXT("Stop, select 4WD and low range before locking this axle"); return;
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
    if ((PreviousRoutePosition.X-G.X)*GateDirection < 0 && (P.X-G.X)*GateDirection >= 0 &&
        FMath::Abs(P.Y-G.Y) < Route.GateWidth*50 && FMath::Abs(P.Z-G.Z)<300) ++GateIndex;
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
    Steer = FMath::FInterpTo(Steer, TestSteer, Dt, 5);
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
  if (Press(EKeys::F) && VehicleIndex < 2) {
    FourDrive = !FourDrive;
    if (!FourDrive) FrontLocked = RearLocked = LowRange = false;
    Notice = FourDrive ? TEXT("Four-wheel drive") : TEXT("Rear-wheel drive");
  }
  if (Press(EKeys::L) && VehicleIndex < 2) {
    if (FMath::Abs(Speed) < .5f)
      { LowRange = !LowRange; if (LowRange) FourDrive = true; else FrontLocked = RearLocked = false; }
    else
      Notice = TEXT("Stop to shift low range");
  }
  if (Press(EKeys::Equals) || Press(EKeys::Add)) {
    Pressure = FMath::Min(65.f, Pressure + 2);
    SaveSetup();
  }
  if (Press(EKeys::Hyphen) || Press(EKeys::Subtract)) {
    Pressure = FMath::Max(10.f, Pressure - 2);
    SaveSetup();
  }
  if (Press(EKeys::P))
    Terrain->SetRain(!Terrain->Rain);
  if (Press(EKeys::BackSpace)) {
    Terrain->ResetSoil();
    Damage = 0;
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
  Steer = FMath::FInterpConstantTo(Steer, Target, Dt, Target == 0 ? 3.5f : 2.f);
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
  const bool Electric = VehicleIndex == 4;
  if (LowRange) Gear = 0;
  const auto &Ratios = Spec->GetArrayField(TEXT("gears"));
  float Ratio = Direction < 0 ? Number(TEXT("reverseRatio"), 3)
                              : Ratios[Gear]->AsNumber();
  float Final = Number(TEXT("finalDrive"), 4),
        Low = LowRange ? Number(TEXT("lowRatio"), 3) : 1;
  float MeanOmega = 0;
  for (auto &W : WheelState)
    MeanOmega += FMath::Abs(W.Omega) * .25f;
  RPM = FMath::Max(Electric ? 0.f : 700.f,
                   MeanOmega * Ratio * Final * Low * 60 / (2 * PI));
  if (!Electric && !LowRange && Direction > 0) {
    float Red = Spec->GetObjectField(TEXT("engine"))
                    ->GetNumberField(TEXT("redlineRPM"));
    if (RPM > Red * .85f && Gear < Ratios.Num() - 1)
      Gear++;
    else if (RPM < 1500 && Gear > 0)
      Gear--;
  }
  float Torque = Number(TEXT("torqueNm"), 350);
  if (!Electric) {
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
          ? FMath::Min(Number(TEXT("wheelTorqueNm"), 15000),
                       Power / FMath::Max(MeanOmega, 1.f))
          : Torque * Ratio * Final * Low * .84f * (Speed < 2 ? 1.35f : 1.f);
  if (!Electric) {
    const float Redline=Spec->GetObjectField(TEXT("engine"))->GetNumberField(TEXT("redlineRPM"));
    // Low range holds first gear; cut drive near redline instead of allowing
    // that fixed ratio to pull the engine to impossible RPM.
    TotalTorque *= FMath::Clamp((Redline-RPM)/(Redline*.08f),0.f,1.f);
  }
  TotalTorque *=
      Throttle * Tuning.Power * Tuning.ElectricalPower * (1 - Damage * .35f) * Direction;
  const float WaterDepth=Terrain->Sample(GetActorLocation()).Water/100;
  TotalTorque*=1-FMath::Clamp((WaterDepth-Tuning.WaterDepth)*1.1f,0.f,.65f);
  if (Tracks && FMath::Abs(Speed) > 12)
    TotalTorque = 0;
  if (LowRange) TotalTorque *= FMath::Clamp(8.f-FMath::Abs(Speed),0.f,1.f);
  const float SteerAngle =
      Steer * FMath::DegreesToRadians(34.f) / (1 + FMath::Abs(Speed) * .025f);
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
    W.Angle = Front ? SteerAngle : Electric ? -SteerAngle*.25f/(1+FMath::Abs(Speed)*.15f) : VehicleIndex==5?SteerAngle*FMath::Lerp(-.12f,.06f,FMath::Clamp((FMath::Abs(Speed)-8)/18,0.f,1.f)):0;
    const FVector WF = FQuat(Up,W.Angle).RotateVector(Forward);
    const float AxleWidth=Front?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth;
    const auto Support = Terrain->CastTireSupport(Mount,Up,WF,Radius*100,AxleWidth*100,-30,(Rest+Droop)*100,this);
    W.ContactValid = Support.Hit;
    W.Constructed = Support.Constructed;
    W.Distance = Support.Hit ? Support.Distance/100 : Rest+Droop;
    W.Center = Mount-Up*FMath::Clamp(W.Distance,Rest-.30f,Rest+Droop)*100;
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
    W.Load = Support.Hit ? FMath::Clamp((Rest-W.Distance)*Spring-
        FVector::DotProduct(MountVelocity,Normal)*Damping,0.f,StaticLoad*4) : 0;
    TotalLoad += W.Load;
    if (W.Load>50) ++ContactCount;
    W.ForceForward = (WF-Normal*FVector::DotProduct(WF,Normal)).GetSafeNormal();
    W.ForceSide = FVector::CrossProduct(Normal,W.ForceForward).GetSafeNormal();
    W.LongSpeed = FVector::DotProduct(W.PointVelocity,W.ForceForward);
    W.LateralSpeed = FVector::DotProduct(W.PointVelocity,W.ForceSide);
    W.Footprint=TerraSim::FootprintLength(W.Load,Pressure,Tracks?.48f:AxleWidth,Radius,Tracks);
    W.RutDepth=W.Constructed?0:W.Ground.RutDepth;
    W.Grip=TerraSim::TerrainGrip(W.Ground.Mu,W.Load,StaticLoad,Pressure,Number(TEXT("stockPSI"),35),
        W.Ground.MaxSink>0,Tracks,W.Ground.Packing,W.Slip,W.Ground.Water/100,W.LongSpeed)*Tuning.Grip*
        (Tracks?(W.Ground.Surface==6?1.5f:.84f):1.f);
    Capacities[I] = W.Load*W.Grip*Radius;
  }
  Overturned = Up.Z < .15f && ContactCount == 0;
  if (Overturned) { TotalTorque = 0; Throttle = 0; Steer = 0; }
  if (FMath::Abs(Speed)>11.1f) FrontLocked=RearLocked=false;
  for (int Axle=0;Axle<2;++Axle) {
    const bool Driven = FourDrive || (VehicleIndex==2 ? Axle==0 : Axle==1);
    if (!Driven) continue;
    const int A=Axle*2;
    const auto Split=TerraSim::SplitAxleTorque(TotalTorque*(FourDrive?(VehicleIndex==5?(Axle==0?.40f:.60f):.5f):1.f),
        Capacities[A],Capacities[A+1],Axle==0?FrontLocked:RearLocked);
    Drives[A]=Split.left; Drives[A+1]=Split.right;
  }
  const float AssistBrake = DescentAssist && Throttle<.05f
      ? FMath::Clamp((FMath::Abs(Speed)-2.f)*.45f,0.f,.8f) : 0.f;
  const float EffectiveBrake = FMath::Max(Brake,AssistBrake);
  if(AssistBrake>Brake){BrakeLampLevel=5;for(auto Lamp:BrakeLamps)Lamp->SetScalarParameterValue(TEXT("TerraLamp"),5);}
  const float Inertia=Tracks?24.f:3.f*Tuning.WheelInertia, R=Radius;
  const float WheelRevLimit=Electric?0:float(Spec->GetObjectField(TEXT("engine"))->GetNumberField(TEXT("redlineRPM")))*2*PI/
      (60*FMath::Max(.1f,Ratio*Final*Low));
  float Stiffness[4]={}, Drag[4]={}, Lateral[4]={}, LongLimit[4]={};
  for(int I=0;I<4;++I){
    const auto &W=WheelState[I];
    Stiffness[I]=W.Load*(W.Ground.Surface==1?10.f:5.f)/FMath::Max(2.f,FMath::Abs(W.LongSpeed));
    const bool Driven=FourDrive||(VehicleIndex==2?I<2:I>=2);
    const float EngineBrake=Driven&&Throttle<.05f&&LowRange?Mass*9.81f*R*.035f:0.f;
    const float Rut=TerraSim::RutResistance(W.RutDepth,R,W.Ground.Softness,W.Ground.Packing,Tracks);
    const float LowPressureRoad=W.Ground.MaxSink==0?FMath::Max(0.f,1-Pressure/Number(TEXT("stockPSI"),35))*.018f:0;
    Drag[I]=(W.Ground.Rolling*(Tracks?1.45f:1.f)+Rut+LowPressureRoad)*W.Load*R+EffectiveBrake*Mass*9.81f*R*.4f+EngineBrake;
    const float Limit=W.Grip*W.Load;
    Lateral[I]=FMath::Clamp(-W.Load*FMath::Atan2(W.LateralSpeed,FMath::Max(2.f,FMath::Abs(W.LongSpeed)))*5.5f,-Limit,Limit);
    LongLimit[I]=FMath::Sqrt(FMath::Max(0.f,Limit*Limit-Lateral[I]*Lateral[I]));
  }
  for(int Axle=0;Axle<2;++Axle){
    const int A=Axle*2,B=A+1;
    const bool Locked=Axle==0?FrontLocked:RearLocked;
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
      const float Free=Previous+Drive*Dt/(Inertia*2);
      WheelState[A].Omega=WheelState[B].Omega=TerraSim::BrakedAxleOmega(Free,Stiffness[A],Stiffness[B],
          WheelState[A].LongSpeed,WheelState[B].LongSpeed,LongLimit[A],LongLimit[B],R,Dt,Inertia*2,Drag[A]+Drag[B]);
    }else for(int I=A;I<=B;++I){
      auto &W=WheelState[I];
      const float DragTorque=FMath::Sign(W.Omega)*Drag[I];
      const float Reaction=R*FMath::Clamp(Stiffness[I]*(Direction*WheelRevLimit*R-W.LongSpeed),-LongLimit[I],LongLimit[I]);
      const float Drive=Electric?Drives[I]:TerraSim::RevLimitedTorque(Drives[I],W.Omega,Inertia,Dt,WheelRevLimit,Reaction,DragTorque);
      const float Free=W.Omega+Drive*Dt/Inertia;
      W.Omega=TerraSim::BrakedWheelOmega(Free,Stiffness[I],W.LongSpeed,R,Dt,Inertia,LongLimit[I],Drag[I]);
    }
  }
  for (int I=0;I<4;++I) {
    auto &W=WheelState[I];
    const float C=Stiffness[I];
    float FX=FMath::Clamp(C*(W.Omega*R-W.LongSpeed),-LongLimit[I],LongLimit[I]);
    float FY=Lateral[I];
    if(EffectiveBrake>.05f&&FMath::Abs(W.LongSpeed)<1.f&&W.ContactValid&&W.Load>50){
      // Static friction opposes the remaining contact velocity and the gravity
      // component along the slope. This is still bounded by brake torque and
      // the same combined tire grip; it never freezes an airborne chassis.
      const float Share=Mass*(I<2?FrontWeight:1-FrontWeight)*.5f;
      const float HoldLimit=FMath::Min(LongLimit[I],Drag[I]/R);
      FX=FMath::Clamp(Share*(-W.LongSpeed/FMath::Max(Dt,.008f)+9.81f*W.ForceForward.Z),-HoldLimit,HoldLimit);
      FY=FMath::Clamp(Share*(-W.LateralSpeed/FMath::Max(Dt,.008f)+9.81f*W.ForceSide.Z),-W.Grip*W.Load,W.Grip*W.Load);
    }
    const float Scale=TerraSim::FrictionScale(FX,FY,W.Grip,W.Load);
    FX*=Scale; FY*=Scale;
    W.Slip=(W.Omega*R-W.LongSpeed)/FMath::Max(2.f,FMath::Abs(W.LongSpeed));
    if (W.Load>0 && W.ContactValid) {
      Chassis->AddForceAtLocation((W.Ground.Normal*W.Load+W.ForceForward*FX+W.ForceSide*FY)*100,W.Contact);
      LastTireForceN+=FMath::Abs(FX)+FMath::Abs(FY);
      if (SoilTimer>=.025f && !W.Constructed){
        const float TireWidth=Tracks?.48f:(I<2?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth);
        const float Travel=FVector::Dist2D(W.LastSoil,W.Contact);
        const bool Connected=W.SoilConnected&&Travel<250&&FMath::Abs(W.LastSoil.Z-W.Contact.Z)<100;
        const int Steps=Connected?FMath::Clamp(FMath::CeilToInt(Travel/FMath::Max(6.25f,W.Footprint*45)),1,48):1;
        for(int Step=1;Step<=Steps;++Step){
          const FVector Point=Connected?FMath::Lerp(W.LastSoil,W.Contact,float(Step)/Steps):W.Contact;
          Terrain->Deform(Point,W.ForceForward,W.Load,Pressure,TireWidth,W.Footprint,W.Slip,W.LongSpeed,SoilTimer/Steps);
        }
        W.LastSoil=W.Contact;W.SoilConnected=true;
      }
      const float Water=W.Ground.Water/100;
      if (Water>.01f) Chassis->AddForceAtLocation((-W.PointVelocity*Water*260+FVector::UpVector*Water*350)*100,W.Contact);
    }
    if(!W.ContactValid||W.Load<50||W.Constructed)W.SoilConnected=false;
    Terrain->TireMark(I,W.Contact,W.ForceForward,Tracks?.48f:(I<2?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth),W.Slip,W.LongSpeed,W.LateralSpeed,
        W.ContactValid&&W.Load>50&&!Overturned,W.Constructed,Dt);
    W.Rotation+=W.Omega*Dt; W.Pressure=Pressure;
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
  if (GetActorLocation().Z < -3000 || GetActorLocation().Size2D() > 56000)
    TeleportZone(Zone);
}
void ATerraVehicle::UpdateSpray(float Dt) {
  for (int I = 0; I < 4; I++) {
    auto &W = WheelState[I];
    if (!W.ContactValid || W.Load < 100 || Overturned)
      continue;
    float V = FMath::Abs(Speed), Energy = V * .5f + FMath::Abs(W.Slip) * 3;
    uint8 S = W.Ground.Surface;
    if (S == 1 || S == 4 || Energy < .65f)
      continue;
    SprayBudget[I] += Dt * FMath::Min(90.f, Energy * 10);
    int Num = FMath::FloorToInt(SprayBudget[I]);
    SprayBudget[I] -= Num;
    for (int J = 0; J < Num && Parcels.Num() < 1000; J++) {
      FTerraParcel P;
      P.Kind = W.Ground.Water > 2 ? 1 : S == 6 ? 2 : S == 5 ? 3 : 0;
      P.Radius = P.Kind == 1 ? 1.5f : P.Kind == 2 ? 2.5f : 2.f;
      P.P = W.Contact + W.Ground.Normal * (P.Radius + 5);
      P.Life = P.Kind == 1 ? 1.1f : 2.3f;
      FVector Back = -GetActorForwardVector() * (Speed < -.1f ? -1 : 1);
      FVector Side = GetActorRightVector() * FMath::FRandRange(-1.f, 1.f);
      P.V = (Back * FMath::FRandRange(1.5f, 3.7f) + Side * .8f +
             FVector::UpVector * FMath::FRandRange(1.f, 3.5f)) *
            100 * FMath::Clamp(Energy * .4f, .6f, 2.f);
      P.V += Chassis->GetPhysicsLinearVelocity() * .2f;
      Parcels.Add(P);
      ++SprayEmitted;
    }
  }
  TArray<FTransform> Instances[4];
  for (int I = Parcels.Num() - 1; I >= 0; I--) {
    auto &P = Parcels[I];
    P.Age += Dt;
    float Rem = FMath::Min(Dt, .1f);
    bool Dead = P.Age > P.Life;
    while (Rem > 0 && !Dead) {
      float H = FMath::Min(Rem, 1.f / 120);
      Rem -= H;
      FVector Old = P.P;
      P.V.Z -= 980 * H;
      P.V *= FMath::Exp(-H * (P.Kind == 2 ? 1.9f : .45f));
      P.P += P.V * H;
      SprayTravelCM += FVector::Dist(Old, P.P);
      // Airborne debris moves in world space. Impacts end the parcel; do not
      // replace it with permanent spheres welded behind the tires.
      FHitResult Hit;
      FCollisionQueryParams Query;
      Query.bTraceComplex = true;
      if (P.Age > .12f && Body->LineTraceComponent(Hit, Old, P.P, Query)) {
        Dead = true;
      }
      Query.AddIgnoredActor(this);
      if (GetWorld()->LineTraceSingleByChannel(Hit,Old,P.P,ECC_Visibility,Query)) Dead=true;
      if (P.P.Z <= Terrain->Height(P.P.X, P.P.Y) + P.Radius)
        Dead = true;
    }
    if (Dead) {
      Parcels.RemoveAtSwap(I);
      ++SprayExpired;
      continue;
    }
    float Scale = P.Radius / 50 * FMath::Clamp((P.Life-P.Age)*4,0.f,1.f);
    Instances[P.Kind].Add(FTransform(FQuat::Identity,P.P,FVector(Scale,Scale,Scale*.65f)));
  }
  for (int Kind=0;Kind<4;++Kind) {
    auto *M=SprayMeshes[Kind].Get(); const auto &Transforms=Instances[Kind];
    while (M->GetInstanceCount()>Transforms.Num()) M->RemoveInstance(M->GetInstanceCount()-1);
    for (int I=0;I<Transforms.Num();++I) {
      if (I<M->GetInstanceCount()) M->UpdateInstanceTransform(I,Transforms[I],true,false,true);
      else M->AddInstance(Transforms[I],true);
    }
    M->MarkRenderStateDirty();
  }
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
  Damage = FMath::Clamp(Damage + ImpactDamage(Impulse.Size()), 0.f, 1.f);
  if (Terrain)
    Terrain->HitTree(Other, -Impulse, Result.ImpactPoint);
}
void ATerraVehicle::OnBodyHit(UPrimitiveComponent *Hit,
                              UPrimitiveComponent *Other, FVector Impulse,
                              const FHitResult &Result) {}
void ATerraVehicle::SaveSetup() {
  if(AutoTest)return;
  SaveGarage(GaragePath());
  GConfig->SetFloat(TEXT("TerraDrive"), TEXT("Pressure"), Pressure,
                    GGameUserSettingsIni);
  GConfig->SetBool(TEXT("TerraDrive"), TEXT("Tracks"), Tracks,
                   GGameUserSettingsIni);
  GConfig->Flush(false, GGameUserSettingsIni);
}
