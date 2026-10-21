#include "TerraVehicle.h"
#include "TerraSimCore.h"
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
  Body = CreateDefaultSubobject<UStaticMeshComponent>(
      TEXT("OriginalVehicleModel"));
  Body->SetupAttachment(Chassis);
  Body->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
  Body->SetCollisionResponseToAllChannels(ECR_Ignore);
  for (int I = 0; I < 4; I++) {
    auto *W = CreateDefaultSubobject<UStaticMeshComponent>(
        *FString::Printf(TEXT("Wheel%d"), I));
    W->SetupAttachment(Chassis);
    W->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Wheels.Add(W);
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
    M->SetCastShadow(false);
    M->RegisterComponent();
    SprayMeshes.Add(M);
  }
  Deposits = NewObject<UInstancedStaticMeshComponent>(this);
  Deposits->SetupAttachment(Chassis);
  Deposits->SetStaticMesh(Sphere);
  Deposits->SetMaterial(0, LoadObject<UMaterialInterface>(
                               nullptr, TEXT("/Game/Materials/Spray_mud")));
  Deposits->SetCollisionEnabled(ECollisionEnabled::NoCollision);
  Deposits->SetCastShadow(false);
  Deposits->RegisterComponent();
  if (auto *PC = Cast<APlayerController>(GetController())) {
    PC->SetViewTarget(this);
    PC->bShowMouseCursor = false;
  }
}
void ATerraVehicle::SelectVehicle(int Index) {
  if (!Terrain || !Terrain->Data)
    return;
  auto &List = Terrain->Data->GetArrayField(TEXT("vehicles"));
  VehicleIndex = (Index + List.Num()) % List.Num();
  Spec = List[VehicleIndex]->AsObject();
  VehicleName = Spec->GetStringField(TEXT("name"));
  FString Asset = Spec->GetStringField(TEXT("asset"));
  Body->SetStaticMesh(LoadObject<UStaticMesh>(
      nullptr, *(TEXT("/Game/Meshes/") + Asset + TEXT("_body"))));
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
              Number(TEXT("width"), 1.8) * .42f, .22f) *
      100);
  Chassis->SetMassOverrideInKg(NAME_None, Mass);
  Chassis->SetCenterOfMass(FVector::ZeroVector);
  Damage = 0;
  Gear = 0;
  Direction = 1;
  Steer = 0;
  Tracks = false;
  FourDrive = VehicleIndex != 2 && VehicleIndex != 3;
  for (auto W : Wheels)
    W->SetStaticMesh(LoadObject<UStaticMesh>(
        nullptr, *(TEXT("/Game/Meshes/") + Asset + TEXT("_wheel"))));
  for (auto &W : WheelState)
    W = FTerraWheel();
  Notice = VehicleName;
  TeleportZone(Zone);
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
                   (Tracks ? TEXT("_track") : TEXT("_wheel")))));
  Chassis->SetMassOverrideInKg(NAME_None, Mass + (Tracks ? 380 : 0));
  Notice =
      Tracks ? TEXT("Flotation tracks equipped") : TEXT("Road wheels equipped");
  SaveSetup();
}
void ATerraVehicle::TeleportZone(int Index) {
  if (!Terrain || Terrain->Spawns.IsEmpty())
    return;
  Zone = (Index + Terrain->Spawns.Num()) % Terrain->Spawns.Num();
  FVector P =
      Terrain->Spawns[Zone] + FVector(0, 0, CG * 100 + 12 + LiftUpgrade * 5);
  Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  Chassis->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);
  SetActorLocationAndRotation(P, FRotator::ZeroRotator, false, nullptr,
                              ETeleportType::TeleportPhysics);
  for (auto &W : WheelState)
    W = FTerraWheel();
  WinchAttached = false;
  ReverseHold = 0;
  SpawnCooldown = .7f;
  Notice = Terrain->ZoneNames[Zone];
}
void ATerraVehicle::Input(float Dt) {
  auto *PC = Cast<APlayerController>(GetController());
  if (!PC)
    return;
  if (AutoTest) {
    Throttle = TestThrottle;
    Brake = TestBrake;
    Steer = FMath::FInterpTo(Steer, TestSteer, Dt, 5);
    return;
  }
  auto Down = [&](FKey Key) { return PC->IsInputKeyDown(Key); };
  auto Press = [&](FKey Key) { return PC->WasInputKeyJustPressed(Key); };
  if (Press(EKeys::Escape)) {
    PC->ConsoleCommand(TEXT("quit"));
    return;
  }
  if (Press(EKeys::Tab))
    Garage = !Garage;
  if (Press(EKeys::V))
    SelectVehicle(VehicleIndex + 1);
  if (Press(EKeys::R))
    TeleportZone(Zone);
  FKey Keys[] = {EKeys::One,  EKeys::Two, EKeys::Three, EKeys::Four,
                 EKeys::Five, EKeys::Six, EKeys::Seven, EKeys::Eight};
  for (int I = 0; I < 8; I++)
    if (Press(Keys[I]))
      TeleportZone(I);
  if (Press(EKeys::T))
    SetTracks(!Tracks);
  if (Press(EKeys::F) && VehicleIndex != 2) {
    FourDrive = !FourDrive;
    Notice = FourDrive ? TEXT("Four-wheel drive") : TEXT("Rear-wheel drive");
  }
  if (Press(EKeys::L) && VehicleIndex != 2 && VehicleIndex != 4) {
    if (FMath::Abs(Speed) < .5f)
      LowRange = !LowRange;
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
    Deposits->ClearInstances();
  }
  if (Garage && FMath::Abs(Speed) < .5f) {
    if (Press(EKeys::E))
      EngineUpgrade = (EngineUpgrade + 1) % 4;
    if (Press(EKeys::H))
      LiftUpgrade = (LiftUpgrade + 1) % 4;
  }
  if (Press(EKeys::X)) {
    if (WinchAttached)
      WinchAttached = false;
    else {
      Anchor = Terrain->FindAnchor(GetActorLocation());
      WinchAttached = !Anchor.IsNearlyZero();
      WinchLength = FVector::Dist(Anchor, GetActorLocation()) / 100;
      Notice = WinchAttached ? TEXT("Winch attached — hold Q to reel")
                             : TEXT("No standing anchor within 45 m");
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
  bool Opposite = (Direction == 1 && S) || (Direction == -1 && W);
  int NextDirection = TerraSim::RequestedDirection(Direction,W,S,Speed,Dt,ReverseHold);
  if (NextDirection != Direction) { Direction=NextDirection; Brake=0; }
  else if (Opposite) { Brake=1; }
  else {
    Throttle = (Direction == 1 ? W : S) ? 1 : RT;
  }
  if (Down(EKeys::SpaceBar) || Down(EKeys::Gamepad_FaceButton_Bottom))
    Brake = 1;
  float MX = 0, MY = 0;
  PC->GetInputMouseDelta(MX, MY);
  if (Down(EKeys::RightMouseButton)) {
    CameraYaw += MX * .22f;
    CameraPitch = FMath::Clamp(CameraPitch + MY * .2f, -50.f, 5.f);
  }
  if (Press(EKeys::C))
    CameraArm->TargetArmLength = CameraArm->TargetArmLength > 500 ? 340 : 1150;
}
void ATerraVehicle::Simulate(float Dt) {
  FVector Velocity = Chassis->GetPhysicsLinearVelocity() / 100,
          Up = GetActorUpVector(), Forward = GetActorForwardVector();
  Speed = FVector::DotProduct(Velocity, Forward);
  const bool Electric = VehicleIndex == 4;
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
  if (!Electric && Direction > 0) {
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
  TotalTorque *=
      Throttle * (1 + EngineUpgrade * .12f) * (1 - Damage * .35f) * Direction;
  if (Tracks && FMath::Abs(Speed) > 12)
    TotalTorque = 0;
  const float SteerAngle =
      Steer * FMath::DegreesToRadians(34.f) / (1 + FMath::Abs(Speed) * .025f);
  float TotalLoad = 0;
  for (int I = 0; I < 4; I++) {
    auto &W = WheelState[I];
    const bool Front = I < 2;
    float StaticLoad =
              Mass * 9.81f * (Front ? FrontWeight : 1 - FrontWeight) * .5f,
          Preload = StaticLoad / Spring;
    FVector Local(Wheelbase * (Front ? 1 - FrontWeight : -FrontWeight) * 100,
                  (I % 2 ? 1 : -1) * Track * 50,
                  (Radius + Rest - CG - Preload + LiftUpgrade * .05f) * 100);
    FVector Mount = GetActorTransform().TransformPosition(Local);
    float Angle = Front ? SteerAngle
                  : Electric
                      ? -SteerAngle * .25f / (1 + FMath::Abs(Speed) * .15f)
                      : 0;
    FVector WF = FQuat(Up, Angle).RotateVector(Forward);
    float Support = Terrain->Height(Mount.X, Mount.Y);
    FVector Normal = Terrain->Sample(Mount).Normal;
    FCollisionQueryParams Params(SCENE_QUERY_STAT(TireSupport), false, this);
    FHitResult Hit;
    // Finite sphere support catches only real log/rock/board geometry below
    // this wheel, rather than an infinite cylinder or raised ground proxy.
    float TireR = Radius * 100;
    FVector End = Mount - Up * ((Rest + .30f) * 100);
    if (GetWorld()->SweepSingleByChannel(
            Hit, Mount, End, FQuat::Identity, ECC_WorldStatic,
            FCollisionShape::MakeSphere(TireR * .86f), Params) &&
        Hit.ImpactNormal.Z > .18f && Hit.ImpactPoint.Z > Support) {
      Support = Hit.ImpactPoint.Z;
      Normal = Hit.ImpactNormal;
    }
    float Distance = (Mount.Z - Support - TireR) / FMath::Max(.3f, Up.Z) / 100;
    W.Contact = Mount - Up * (Distance * 100 + TireR);
    W.Contact.Z = Support;
    W.Ground = Terrain->Sample(W.Contact);
    W.Ground.Normal = Normal;
    FVector PointV = Chassis->GetPhysicsLinearVelocityAtPoint(Mount) / 100;
    float Compression = Rest - Distance;
    W.Load =
        Distance < Rest + .16f
            ? FMath::Clamp(Compression * Spring -
                               FVector::DotProduct(PointV, Normal) * Damping,
                           0.f, StaticLoad * 4)
            : 0;
    TotalLoad += W.Load;
    W.Center =
        Mount - Up * FMath::Clamp(Distance, Rest - .30f, Rest + .16f) * 100;
    FVector F = (WF - Normal * FVector::DotProduct(WF, Normal)).GetSafeNormal(),
            Side = FVector::CrossProduct(Normal, F).GetSafeNormal();
    float VX = FVector::DotProduct(PointV, F),
          VY = FVector::DotProduct(PointV, Side);
    bool Driven = FourDrive || (VehicleIndex == 2 ? Front : !Front);
    float Drive = Driven ? TotalTorque / (FourDrive ? 4 : 2) : 0;
    float Inertia = Tracks ? 24 : 3;
    float R = Radius;
    float C = W.Load * (W.Ground.Surface == 1 ? 10.f : 5.f) /
              FMath::Max(2.f, FMath::Abs(VX));
    float RollingTorque =
        W.Ground.Rolling * W.Load * R * (Tracks ? 1.45f : 1.f);
    float BrakeTorque = Brake * Mass * 9.81f * R * .4f;
    float Free = W.Omega + (Drive - FMath::Sign(W.Omega) *
                                        (RollingTorque + BrakeTorque)) *
                               Dt / Inertia;
    if ((Brake > .1f || Throttle == 0) && Free * W.Omega < 0)
      Free = 0;
    W.Omega = TerraSim::WheelOmega(Free,C,VX,R,Dt,Inertia);
    float FX = C * (W.Omega * R - VX),
          FY = -W.Load * FMath::Atan2(VY, FMath::Max(2.f, FMath::Abs(VX))) *
               5.5f;
    float Mu =
        W.Ground.Mu * (Tracks ? (W.Ground.Surface == 6 ? 1.5f : .84f) : 1.f);
    float ForceScale=TerraSim::FrictionScale(FX,FY,Mu,W.Load);
    FX*=ForceScale;FY*=ForceScale;
    W.Slip = (W.Omega * R - VX) / FMath::Max(2.f, FMath::Abs(VX));
    if (W.Load > 0) {
      Chassis->AddForceAtLocation((Normal * W.Load + F * FX + Side * FY) * 100,
                                  W.Contact);
      float Length = Tracks
                         ? 1.35f
                         : FMath::Clamp(W.Load / (Pressure * 6894.76f * Width),
                                        .14f, .65f),
            CW = Tracks ? .48f : Width;
      if (SoilTimer >= .025f && FMath::Abs(Support-Terrain->Height(W.Contact.X,W.Contact.Y))<3)
        Terrain->Deform(W.Contact, F, W.Load, Pressure, CW, Length, W.Slip, VX,
                        SoilTimer);
      float Water = W.Ground.Water / 100;
      if (Water > .01f)
        Chassis->AddForceAtLocation(
            (-PointV * Water * 260 + FVector::UpVector * Water * 350) * 100,
            W.Contact);
    }
    W.Rotation += W.Omega * Dt;
    W.Distance = Distance;
    W.Pressure = Pressure;
    FQuat Q = FQuat(Up, Angle) * GetActorQuat();
    if (!Tracks)
      Q = Q * FQuat(FVector::RightVector, -W.Rotation);
    Wheels[I]->SetWorldLocationAndRotation(W.Center, Q);
  }
  if (SoilTimer >= .025f)
    SoilTimer = 0;
  Chassis->AddForce(-Velocity * Velocity.Size() * .5f * 1.2f * .5f *
                    Number(TEXT("width"), 1.8) * Number(TEXT("height"), 1.8) *
                    100);
  if (WinchAttached) {
    FVector Hook =
        GetActorLocation() + Forward * Number(TEXT("length"), 4.8) * 47;
    FVector D = Anchor - Hook;
    float L = D.Size() / 100;
    if (Reeling)
      WinchLength = FMath::Max(2.f, WinchLength - Dt * .65f);
    WinchTension =
        FMath::Clamp((L - WinchLength) * 14000 -
                         FVector::DotProduct(Velocity, D.GetSafeNormal()) * 900,
                     0.f, 45000.f);
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
    if (W.Load < 100)
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
      P.P = W.Contact + FVector(0, 0, 3);
      P.Radius = P.Kind == 1 ? 1.5f : P.Kind == 2 ? 2.5f : 2.f;
      P.Life = P.Kind == 1 ? 1.1f : 2.3f;
      FVector Back = -GetActorForwardVector() * (Speed < -.1f ? -1 : 1);
      FVector Side = GetActorRightVector() * FMath::FRandRange(-1.f, 1.f);
      P.V = (Back * FMath::FRandRange(1.5f, 3.7f) + Side * .8f +
             FVector::UpVector * FMath::FRandRange(1.f, 3.5f)) *
            100 * FMath::Clamp(Energy * .4f, .6f, 2.f);
      P.V += Chassis->GetPhysicsLinearVelocity() * .2f;
      Parcels.Add(P);
    }
  }
  for (auto M : SprayMeshes)
    M->ClearInstances();
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
      // Native component line trace is swept against the actual vehicle model's
      // imported complex triangle collision; deposits attach in chassis space.
      FHitResult Hit;
      FCollisionQueryParams Query;
      Query.bTraceComplex = true;
      if (Body->LineTraceComponent(Hit, Old, P.P, Query)) {
        if (P.Kind == 0 && Deposits->GetInstanceCount() < 256) {
          FTransform T(
              FQuat::FindBetweenNormals(
                  FVector::UpVector,
                  GetActorTransform().InverseTransformVectorNoScale(
                      Hit.Normal)),
              GetActorTransform().InverseTransformPosition(Hit.ImpactPoint),
              FVector(P.Radius * .025f, P.Radius * .025f, .007));
          Deposits->AddInstance(T);
        }
        Dead = true;
      }
      if (P.P.Z <= Terrain->Height(P.P.X, P.P.Y) + P.Radius)
        Dead = true;
    }
    if (Dead) {
      Parcels.RemoveAtSwap(I);
      continue;
    }
    float Scale = P.Radius / 50;
    SprayMeshes[P.Kind]->AddInstance(
        FTransform(FQuat::Identity, P.P, FVector(Scale, Scale, Scale * .65f)));
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
    SelectVehicle(0);
    Initialized = true;
  }
  Dt = FMath::Min(Dt, .1f);
  Input(Dt);
  SoilTimer += Dt;
  Simulate(Dt);
  UpdateSpray(Dt);
  SpawnCooldown = FMath::Max(0.f, SpawnCooldown - Dt);
  CameraArm->SetWorldRotation(
      FRotator(CameraPitch, GetActorRotation().Yaw + CameraYaw, 0));
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
  Damage = FMath::Clamp(Damage + Impulse.Size() / (Mass * 100 * 95), 0.f, 1.f);
  if (Terrain)
    Terrain->HitTree(Other, -Impulse, Result.ImpactPoint);
}
void ATerraVehicle::OnBodyHit(UPrimitiveComponent *Hit,
                              UPrimitiveComponent *Other, FVector Impulse,
                              const FHitResult &Result) {}
void ATerraVehicle::SaveSetup() {
  GConfig->SetFloat(TEXT("TerraDrive"), TEXT("Pressure"), Pressure,
                    GGameUserSettingsIni);
  GConfig->SetBool(TEXT("TerraDrive"), TEXT("Tracks"), Tracks,
                   GGameUserSettingsIni);
  GConfig->Flush(false, GGameUserSettingsIni);
}
