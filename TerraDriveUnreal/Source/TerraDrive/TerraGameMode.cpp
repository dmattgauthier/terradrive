#include "TerraGameMode.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMisc.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
#include "TerraUnits.h"
#include "TerraContact.h"
#include "UnrealClient.h"
ATerraGameMode::ATerraGameMode() {
  DefaultPawnClass = ATerraVehicle::StaticClass();
  HUDClass = ATerraHUD::StaticClass();
  PrimaryActorTick.bCanEverTick = true;
}
void ATerraGameMode::BeginPlay() {
  Super::BeginPlay();
  GetWorld()->SpawnActor<ATerraWorld>();
}
void ATerraHUD::DrawHUD() {
  Super::DrawHUD();
  auto *V = Cast<ATerraVehicle>(GetOwningPawn());
  if (!V || !Canvas || V->Garage)
    return;
  float W = Canvas->SizeX, H = Canvas->SizeY;
  DrawRect(FLinearColor(.015, .025, .028, .88), 18, 18, 510, 172);
  DrawText(TEXT("TERRA DRIVE  /  NATIVE PREVIEW"), FLinearColor(.82, .9, .76),
           34, 28, nullptr, 1.25f);
  DrawText(V->VehicleName, FLinearColor::White, 34, 56, nullptr, 1.1f);
  DrawText(FString::Printf(TEXT("%3.0f mph    %s%d    %4.0f rpm"),
                           TerraUnits::MPH(FMath::Abs(V->Speed)),
                           V->Direction < 0 ? TEXT("R") : TEXT("D"),
                           V->Gear + 1, V->RPM),
           FLinearColor::White, 34, 82, nullptr, 1.3f);
  DrawText(FString::Printf(TEXT("%s   %.0f PSI   %s%s"), *V->SurfaceName,
                           V->Pressure,
                           V->Tracks      ? TEXT("TRACKS")
                           : V->FourDrive ? TEXT("4WD")
                                          : TEXT("2WD"),
                           V->LowRange ? TEXT("  LOW") : TEXT("")),
           FLinearColor(.72, .83, .88), 34, 116);
  DrawText(FString::Printf(TEXT("AXLES  Front: %s   Rear: %s   %s"),
      V->FrontLocked?TEXT("LOCKED"):TEXT("open"),V->RearLocked?TEXT("LOCKED"):TEXT("open"),
      V->DescentAssist?TEXT("DESCENT ON"):TEXT("")),FLinearColor(.95,.8,.4),34,145);
  DrawText(V->Overturned?TEXT("ROLLED OVER - no tire grip. R to recover."):V->Notice,
      FLinearColor(.93,.82,.54),24,204);
  if (!V->RouteStatus.IsEmpty()) DrawText(V->RouteStatus,FLinearColor::White,24,232);
  DrawRect(FLinearColor(.015, .025, .028, .83), 18, H - 112, W - 36, 94);
  DrawText(TEXT("W/S  Accelerate / brake, hold at rest to reverse     A/D  "
                "Steer     Space  Brake     RMB + mouse  Camera"),
           FLinearColor(.85, .88, .88), 30, H - 80);
  DrawText(TEXT("1-9 Regions    J Next challenge    V Garage    T Tracks    F 4WD    L Low    Z Rear lock    U Front lock"),
           FLinearColor(.85, .88, .88), 30, H - 54);
  DrawText(TEXT("Shift+W Crawl throttle    K Descent assist    R Recover / restart    Tab Garage    Esc Quit"),
           FLinearColor(.85,.88,.88),30,H-30);
  if (V->WinchAttached)
    DrawText(FString::Printf(TEXT("WINCH %.0f lbf"), TerraUnits::PoundsForce(V->WinchTension)),
             FLinearColor(.74, .9, 1), W - 240, 32);
}
void ATerraGameMode::Tick(float Dt) {
  Super::Tick(Dt);
  if (!FParse::Param(FCommandLine::Get(), TEXT("TerraValidate")))
    return;
  TestTime += Dt;
  if (TestTime > 240) {
    Results.Add(TEXT("{\"case\":\"validation timeout or missing world\",\"pass\":false}"));
    FinishValidation();
    return;
  }
  auto *V = Cast<ATerraVehicle>(UGameplayStatics::GetPlayerPawn(this, 0));
  if (!V || !V->Terrain || !V->Terrain->Ready || !V->Initialized)
    return;
  StageTime += Dt;
  auto Check = [&](const FString &Name, bool Pass, float Value=0.f) {
    Results.Add(FString::Printf(TEXT("{\"case\":\"%s\",\"value\":%.4f,\"pass\":%s}"),*Name,Value,Pass?TEXT("true"):TEXT("false")));
  };
  auto Capture = [&](const TCHAR *Name) {
    if (FParse::Param(FCommandLine::Get(),TEXT("TerraCapture")))
      FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir()/TEXT("Screenshots")/Name,true,false);
  };
  auto Next = [&](int NewStage) { Stage=NewStage; StageTime=0; Captured=false; MaxProgress=0; };
  // These exercise the native Chaos world, not the historical JS tests.
  if (Stage == 0) {
    Results.Add(FString::Printf(TEXT("{\"case\":\"native world data\",\"zones\":%d,\"pass\":%s}"),
        V->Terrain->Spawns.Num(), V->Terrain->Spawns.Num() == 9 ? TEXT("true") : TEXT("false")));
    for (int I = 0; I < 5; ++I) {
      V->SelectVehicle(I);
      bool Loaded = V->Body->GetStaticMesh() != nullptr;
      for (auto Wheel : V->Wheels)
        Loaded &= Wheel->GetStaticMesh() != nullptr;
      Results.Add(FString::Printf(TEXT("{\"case\":\"vehicle %d meshes\",\"pass\":%s}"),
          I, Loaded ? TEXT("true") : TEXT("false")));
      Check(FString::Printf(TEXT("vehicle %d articulated suspension and upgrade models"),I),
          V->SuspensionParts.Num()==20&&V->Protection->GetStaticMesh()&&V->TrailEquipment->GetStaticMesh());
    }
    Check(TEXT("imperial garage measurements"),V->UpgradeEffect(TerraSim::Body).Contains(TEXT(" lb"))&&
      V->UpgradeEffect(TerraSim::Suspension).Contains(TEXT(" in"))&&V->UpgradeEffect(TerraSim::Tires).Contains(TEXT(" in width")));
    Check(TEXT("detailed scenery models and solid obstacles"),V->Terrain->DetailInstanceCount>500&&V->Terrain->SolidDetailCount>20,V->Terrain->DetailInstanceCount);
    {
      const FVector Probe(-30000,30000,5000);
      auto *Edge=NewObject<UBoxComponent>(V->Terrain);
      Edge->SetupAttachment(V->Terrain->GetRootComponent());Edge->InitBoxExtent(FVector(8,1,8));
      Edge->SetCollisionProfileName(TEXT("BlockAll"));Edge->ComponentTags.Add(TEXT("TerraRock"));
      Edge->RegisterComponent();Edge->SetWorldLocation(Probe+FVector(0,30,-60));
      const auto Narrow=V->Terrain->CastTireSupport(Probe,FVector::UpVector,FVector::ForwardVector,42,28,-30,57,V);
      const auto Wide=V->Terrain->CastTireSupport(Probe,FVector::UpVector,FVector::ForwardVector,42,80,-30,57,V);
      Check(TEXT("tire tread rejects rigid support outside its width"),!Narrow.Hit&&Wide.Hit&&Wide.Constructed);
      Edge->DestroyComponent();
    }
    Check(TEXT("challenge assets and routes"),V->Terrain->ConstructedMeshCount==3&&V->Terrain->Routes.Num()==8,V->Terrain->ConstructedMeshCount);
      { FVector P(5800,23600,472), N(0,0,1); const auto S=V->Terrain->CastSupport(P+N*65,N,42,-30,57,V); Check(TEXT("loop contact 0"),S.Hit&&S.Constructed&&FMath::Abs(S.Distance-23)<3,S.Distance); }
      { FVector P(8000,23472.816920328652,2471.9999999999995), N(-0.9238105221531736,-0.06683810242528712,-0.3769705389327761); const auto S=V->Terrain->CastSupport(P+N*65,N,42,-30,57,V); Check(TEXT("loop contact 1"),S.Hit&&S.Constructed&&FMath::Abs(S.Distance-23)<3,S.Distance); }
      { FVector P(5800,22900,4472), N(-1.4927753937936347e-16,-8.065097714605623e-17,-1); const auto S=V->Terrain->CastSupport(P+N*65,N,42,-30,57,V); Check(TEXT("loop contact 2"),S.Hit&&S.Constructed&&FMath::Abs(S.Distance-23)<3,S.Distance); }
      { FVector P(3600,22327.183079671348,2472.0000000000005), N(0.9238105221531735,0.06683810242528718,-0.37697053893277616); const auto S=V->Terrain->CastSupport(P+N*65,N,42,-30,57,V); Check(TEXT("loop contact 3"),S.Hit&&S.Constructed&&FMath::Abs(S.Distance-23)<3,S.Distance); }
      { FVector P(5799.999999999999,22200,472), N(1.6328623988631378e-16,2.728720282763563e-17,1); const auto S=V->Terrain->CastSupport(P+N*65,N,42,-30,57,V); Check(TEXT("loop contact 4"),S.Hit&&S.Constructed&&FMath::Abs(S.Distance-23)<3,S.Distance); }
    { const auto S=V->Terrain->CastSupport(FVector(500,18300,860),FVector::UpVector,42,-30,57,V); Check(TEXT("jump gap has no hidden support"),!S.Hit); }
    V->SelectVehicle(0);
    V->TeleportZone(1);
    Start = V->GetActorLocation();
    Stage = 1;
    StageTime = 0;
  }
  if (Stage == 1) {
    if (StageTime > 3 && !Captured && FParse::Param(FCommandLine::Get(), TEXT("TerraCapture"))) {
      FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir() / TEXT("Screenshots/native-acceleration.png"), true, false);
      Captured = true;
    }
    V->TestThrottle = StageTime > 2 ? 1 : 0;
    if (StageTime > 8) {
      float D = FVector::Dist2D(Start, V->GetActorLocation()) / 100;
      Results.Add(FString::Printf(
          TEXT("{\"case\":\"native "
               "acceleration\",\"distanceM\":%.3f,\"speedMS\":%.3f,\"pass\":%"
               "s}"),
          D, V->Speed, D > 4 && V->Speed > 1 ? TEXT("true") : TEXT("false")));
      V->TestThrottle = 0;
      V->TestBrake = 1;
      Stage = 2;
      StageTime = 0;
    }
  } else if (Stage == 2 && StageTime > 5) {
    Results.Add(FString::Printf(
        TEXT("{\"case\":\"native braking\",\"speedMS\":%.3f,\"pass\":%s}"),
        V->Speed, FMath::Abs(V->Speed) < .8 ? TEXT("true") : TEXT("false")));
    V->TestBrake = 0;
    V->TeleportZone(7);
    Stage = 3;
    StageTime = 0;
  } else if (Stage == 3 && StageTime > 2) {
    auto *T = V->Terrain.Get();
    FVector P = T->Spawns[7];
    auto S = T->Sample(P);
    float Initial = T->Height(P.X, P.Y);
    for (int I = 0; I < 120; I++)
      T->Deform(P, FVector::ForwardVector, 5000, 40, .285f, .20f, .6f, 1.f,
                1.f / 120);
    float Tire = Initial - T->Height(P.X, P.Y);
    T->ResetSoil();
    for (int I = 0; I < 120; I++)
      T->Deform(P, FVector::ForwardVector, 5950, 40, .48f, 1.35f, .6f, 1.f,
                1.f / 120);
    float Track = Initial - T->Height(P.X, P.Y);
    Results.Add(FString::Printf(TEXT("{\"case\":\"snow "
                                     "flotation\",\"tireSinkCM\":%.5f,"
                                     "\"trackSinkCM\":%.5f,\"pass\":%s}"),
                                Tire, Track,
                                Tire > Track && Track >= 0 ? TEXT("true")
                                                           : TEXT("false")));
    double Error = FMath::Abs(T->DepressedVolume - T->DisplacedVolume -
                              T->CompactedVolume);
    Results.Add(FString::Printf(
        TEXT("{\"case\":\"soil volume ledger\",\"errorM3\":%.10f,\"pass\":%s}"),
        Error, Error < 1e-6 ? TEXT("true") : TEXT("false")));
    Stage = 4;
    StageTime = 0;
    V->SelectVehicle(4);
    V->TeleportZone(1);
  } else if (Stage == 4) {
    V->TestThrottle = 1;
    V->TestSteer = .35f;
    if (StageTime > 5) {
      const float Yaw = V->GetActorRotation().Yaw;
      Results.Add(FString::Printf(
          TEXT("{\"case\":\"EV steered launch\",\"speedMS\":%.3f,\"yawDegrees\":%.3f,\"pass\":%s}"),
          V->Speed, Yaw, V->Speed > 1 && Yaw > 5 ? TEXT("true") : TEXT("false")));
      V->TestThrottle = 0;
      V->TestSteer = 0;
      V->TestBrake = 1;
      Stage = 5;
      StageTime = 0;
      Captured = false;
      V->SelectVehicle(0);
      V->TeleportZone(0);
    }
  } else if (Stage >= 5 && Stage < 13) {
    const int Region = Stage - 5;
    if (StageTime > 2 && !Captured) {
      const FVector P = V->GetActorLocation();
      // Browser Terrain.sample at each original spawn; marsh starts on its
      // grassy bank. These references catch native/export coordinate swaps.
      static const uint8 ExpectedSurfaces[] = {0, 1, 4, 2, 0, 5, 0, 6};
      static const float ExpectedHeights[] = {3.189869f, 3.585f, 7.332479f, 3.332015f,
          4.690650f, 11.039977f, 4.6f, 7.038291f};
      const FVector Spawn = V->Terrain->Spawns[Region];
      const uint8 Surface = V->Terrain->Sample(Spawn).Surface;
      const bool Stable = !P.ContainsNaN() && FMath::IsFinite(V->Speed) &&
          FMath::Abs(P.Z - V->Terrain->Height(P.X, P.Y)) < 400 &&
          Surface == ExpectedSurfaces[Region] && FMath::Abs(Spawn.Z / 100 - ExpectedHeights[Region]) < .01f;
      Results.Add(FString::Printf(TEXT("{\"case\":\"region %d spawn\",\"surface\":%d,\"expectedSurface\":%d,\"pass\":%s}"),
          Region, Surface, ExpectedSurfaces[Region], Stable ? TEXT("true") : TEXT("false")));
      const FVector CameraPosition = V->Camera->GetComponentLocation();
      const float Clearance = CameraPosition.Z - V->Terrain->Height(CameraPosition.X, CameraPosition.Y);
      const float CameraRoll = V->Camera->GetComponentRotation().Roll;
      Results.Add(FString::Printf(TEXT("{\"case\":\"region %d camera\",\"clearanceCM\":%.3f,\"rollDegrees\":%.3f,\"pass\":%s}"),
          Region, Clearance, CameraRoll,
          Clearance > 5 && FMath::Abs(CameraRoll) < 1 ? TEXT("true") : TEXT("false")));
      if (FParse::Param(FCommandLine::Get(), TEXT("TerraCapture")))
        FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir() /
            FString::Printf(TEXT("Screenshots/native-region-%d.png"), Region + 1), true, false);
      Captured = true;
    }
    if (StageTime > 3) {
      ++Stage;
      StageTime = 0;
      Captured = false;
      if (Stage == 13) {
        V->SelectVehicle(0); V->TeleportZone(1); V->TestBrake=0;
        V->SetActorLocationAndRotation(V->GetActorLocation()+FVector(0,0,160),FRotator(0,0,180),false,nullptr,ETeleportType::TeleportPhysics);
        V->TestThrottle=1; V->TestSteer=1;
      } else {
        V->SelectVehicle((Stage - 5) % 5);
        V->TeleportZone(Stage - 5);
      }
    }
  }
  else if (Stage == 13) {
    if (StageTime>1 && !Captured) { Start=V->GetActorLocation(); Capture(TEXT("native-rollover.png")); Captured=true; }
    if (StageTime>5) {
      Check(TEXT("rolled vehicle has no tire drive or steering"),V->Overturned&&V->ContactCount==0&&V->LastTireForceN<1&&V->Throttle==0&&V->Steer==0,V->LastTireForceN);
      Check(TEXT("rolled chassis rests on roof"),V->GetActorUpVector().Z<-.8f&&FVector::Dist2D(Start,V->GetActorLocation())<80,FVector::Dist2D(Start,V->GetActorLocation()));
      const FVector CP=V->Camera->GetComponentLocation();
      Check(TEXT("rolled vehicle camera stays above terrain"),CP.Z>V->Terrain->Height(CP.X,CP.Y)+5&&FMath::Abs(V->Camera->GetComponentRotation().Roll)<1,CP.Z-V->Terrain->Height(CP.X,CP.Y));
      V->TeleportZone(1); V->SetActorLocation(V->GetActorLocation()+FVector(0,0,2400),false,nullptr,ETeleportType::TeleportPhysics); Start=V->GetActorLocation(); Next(14);
    }
  } else if (Stage == 14 && StageTime>.6f) {
    Check(TEXT("airborne controls cannot push or yaw chassis"),V->ContactCount==0&&V->LastTireForceN<1&&FVector::Dist2D(Start,V->GetActorLocation())<2&&FMath::Abs(V->GetActorRotation().Yaw)<1,V->LastTireForceN);
    V->Terrain->ResetSoil();
    V->TestSteer=0; V->TestThrottle=.8f; V->TeleportZone(3);
    // Use locked axles in the deeply rutted mud so a lifted wheel does not
    // prevent the driving/spray fixture from exercising the emitter at all.
    V->FourDrive=V->LowRange=V->FrontLocked=V->RearLocked=true;
    V->SprayEmitted=V->SprayExpired=0; V->SprayTravelCM=0; Next(15);
  } else if (Stage == 15) {
    if(StageTime>3&&!Captured){Capture(TEXT("native-spray-motion.png"));Captured=true;}
    if(StageTime>6){
      int Rendered=0; bool WorldSpace=true;
      for(auto M:V->SprayMeshes)for(int I=0;I<M->GetInstanceCount();++I){FTransform T;M->GetInstanceTransform(I,T,true);++Rendered;WorldSpace&=FVector::Dist(T.GetLocation(),V->GetActorLocation())<1800;}
      Check(TEXT("tire debris moves and renders in world space"),V->SprayEmitted>10&&V->SprayTravelCM>100&&Rendered>0&&WorldSpace,V->SprayTravelCM);
      Check(TEXT("airborne debris expires after impact"),V->SprayExpired>0,V->SprayExpired);
      Check(TEXT("low range respects engine rev limit"),V->RPM<7000,V->RPM);
      UE_LOG(LogTemp,Display,TEXT("TERRA_SPRAY emitted=%d expired=%d rendered=%d speed=%.3f throttle=%.2f contacts=%d load=%.1f,%.1f,%.1f,%.1f"),V->SprayEmitted,V->SprayExpired,Rendered,V->Speed,V->Throttle,V->ContactCount,V->WheelState[0].Load,V->WheelState[1].Load,V->WheelState[2].Load,V->WheelState[3].Load);
      V->TestThrottle=0;V->TestBrake=1;Next(16);
    }
  } else if(Stage==16&&StageTime>5){
    int Rendered=0;for(auto M:V->SprayMeshes)Rendered+=M->GetInstanceCount();
    Check(TEXT("stopped tires leave no frozen debris"),V->SprayCount()==0&&Rendered==0,Rendered);
    V->SelectVehicle(0);V->FourDrive=true;V->LowRange=true;V->TeleportRoute(4);V->TestBrake=0;V->TestThrottle=.35f;Start=V->GetActorLocation();Next(17);
  } else if(Stage==17||Stage==18){
    MaxProgress=FMath::Max(MaxProgress,float(V->GetActorLocation().X-Start.X)/100);
    if(Stage==18&&StageTime>13&&!Captured){Capture(TEXT("native-locked-climb.png"));Captured=true;}
    if(StageTime>14){
      if(Stage==17){OpenProgress=MaxProgress;V->SelectVehicle(0);V->FourDrive=true;V->LowRange=true;V->TeleportRoute(4);V->FrontLocked=V->RearLocked=true;Start=V->GetActorLocation();Next(18);}
      else {
        Check(TEXT("locked axles climb farther than open axles"),MaxProgress>OpenProgress+.5f&&MaxProgress>8,MaxProgress-OpenProgress);
        Check(TEXT("locked axle shaft speeds remain coupled"),FMath::Abs(V->WheelState[0].Omega-V->WheelState[1].Omega)<.001f&&FMath::Abs(V->WheelState[2].Omega-V->WheelState[3].Omega)<.001f);
        UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER open=%.3f locked=%.3f"),OpenProgress,MaxProgress);
        V->SelectVehicle(0);V->LowRange=true;V->DescentAssist=true;V->TeleportRoute(7);V->Chassis->SetPhysicsLinearVelocity(FVector(500,0,0));Start=V->GetActorLocation();V->TestThrottle=0;Next(19);
      }
    }
  } else if(Stage==19){
    if(StageTime>11&&!Captured){Capture(TEXT("native-controlled-descent.png"));Captured=true;}
    if(StageTime>12){
    Check(TEXT("descent assist controls rocky downhill speed"),FMath::Abs(V->Speed)<5&&V->GetActorLocation().X>Start.X+500&&V->GetActorUpVector().Z>.4f,V->Speed);
    V->TestBrake=1;V->SelectVehicle(0);V->TeleportRoute(0);Next(20);
    }
  } else if(Stage>=20&&Stage<28){
    if(StageTime>2&&!Captured){
      const int R=Stage-20;
      Check(FString::Printf(TEXT("challenge %d stable spawn"),R),V->ContactCount>=2&&V->GetActorUpVector().Z>.7f&&FVector::Dist2D(V->GetActorLocation(),V->Terrain->Routes[R].Spawn)<250,V->ContactCount);
      Capture(*FString::Printf(TEXT("native-challenge-%d.png"),R));Captured=true;
    }
    if(StageTime>3){
      Next(Stage+1);
      if(Stage==28){
        V->SelectVehicle(0);V->TeleportRoute(0);V->TestBrake=0;V->TestThrottle=.4f;
        const FVector Tangent=FVector(-14,-4.4563384,0).GetSafeNormal();
        V->SetActorLocationAndRotation(FVector(5800,22900,4396),FRotationMatrix::MakeFromXZ(Tangent,-FVector::UpVector).Rotator(),false,nullptr,ETeleportType::TeleportPhysics);
        V->Chassis->SetPhysicsLinearVelocity(Tangent*1800);
        Start=V->GetActorLocation();
      } else V->TeleportRoute(Stage-20);
    }
  } else if(Stage==28){
    InvertedContactSeen|=V->GetActorUpVector().Z<-.5f&&V->ContactCount>=2&&!V->Overturned;
    if(StageTime>.3f&&!Captured){
      FHitResult Obstruction;FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraCameraValidation),true,V);
      const bool Blocked=GetWorld()->LineTraceSingleByChannel(Obstruction,V->Camera->GetComponentLocation(),V->GetActorLocation(),ECC_Visibility,Query);
      const float CameraDistance=FVector::Dist(V->Camera->GetComponentLocation(),V->GetActorLocation());
      Check(TEXT("inverted loop camera can see the vehicle"),!Blocked&&CameraDistance>300,CameraDistance);
      UE_LOG(LogTemp,Display,TEXT("TERRA_LOOP_CAMERA root=%s camera=%s distance=%.1f blocked=%d"),*V->GetActorLocation().ToString(),*V->Camera->GetComponentLocation().ToString(),CameraDistance,Blocked);
      Capture(TEXT("native-inverted-loop-contact.png"));Captured=true;
    }
    if(StageTime>1.2f){
      Check(TEXT("inverted loop retains physical wheel support"),InvertedContactSeen&&FVector::Dist(Start,V->GetActorLocation())>100, V->ContactCount);
      V->SelectVehicle(0);V->TeleportZone(1);V->TestThrottle=0;V->TestBrake=1;Next(29);
    }
  } else if(Stage==29){
    // Validate the values consumed by Chaos and visible meshes, then exercise
    // persistence without reading or overwriting the player's garage file.
    const float StockMass=V->Chassis->GetMass(),StockImpact=V->ImpactDamage(10000000),StockPower=V->PowerHP();
    V->SetUpgrade(TerraSim::Body,3,false);
    Check(TEXT("body upgrade reduces actual rigid body mass"),V->Chassis->GetMass()<StockMass*.9f,V->Chassis->GetMass());
    V->SetUpgrade(TerraSim::Frame,3,false);
    Check(TEXT("upgrade armor becomes visible on the vehicle"),V->Protection->IsVisible());
    Check(TEXT("frame upgrade changes Chaos damping and impact survival"),V->Chassis->GetAngularDamping()>1&&V->ImpactDamage(10000000)<StockImpact*.6f,V->ImpactDamage(10000000));
    V->SetUpgrade(TerraSim::Tires,3,false);
    Check(TEXT("tire upgrade changes rendered size and friction budget"),V->Wheels[0]->GetRelativeScale3D().X>1.1f&&V->GripMultiplier()>1.4f,V->GripMultiplier());
    V->SetUpgrade(TerraSim::Wheels,3,false);
    Check(TEXT("wheel upgrade reduces rotating inertia"),V->WheelInertia()<1.6f,V->WheelInertia());
    V->SetUpgrade(TerraSim::Suspension,3,false);
    Check(TEXT("suspension upgrade extends contact travel"),V->SuspensionTravel()>.65f&&V->Tuning.Damping>1.6f,V->SuspensionTravel());
    V->SetUpgrade(TerraSim::Engine,3,false);
    Check(TEXT("engine stage three increases usable power"),V->PowerHP()>StockPower*1.6f,V->PowerHP());
    V->SetUpgrade(TerraSim::Electrical,3,false);
    Check(TEXT("auxiliary electrical upgrades improve recovery and sealing"),V->Tuning.Winch>1.8f&&V->Tuning.WaterDepth>.8f,V->Tuning.Winch);
    const FString SetupPath=FPaths::ProjectSavedDir()/TEXT("Validation/garage-roundtrip.json");
    Check(TEXT("garage setup saved atomically"),V->SaveGarage(SetupPath));
    V->ResetUpgrades(false);V->SelectVehicle(1);
    Check(TEXT("vehicle builds remain independent"),V->UpgradeStage(TerraSim::Engine)==0);
    V->SelectVehicle(0);V->ResetUpgrades(false);
    const bool Loaded=V->LoadGarage(SetupPath);V->ApplyUpgrades();
    Check(TEXT("all seven upgrade categories survive save reload"),Loaded&&V->UpgradeStage(TerraSim::Engine)==3&&V->UpgradeStage(TerraSim::Electrical)==3&&V->UpgradeStage(TerraSim::Body)==3);
    const FString BadPath=FPaths::ProjectSavedDir()/TEXT("Validation/garage-invalid.json");
    FFileHelper::SaveStringToFile(TEXT("{\"version\":1,\"builds\":[]}"),*BadPath);
    Check(TEXT("invalid save cannot erase an existing build"),!V->LoadGarage(BadPath)&&V->UpgradeStage(TerraSim::Engine)==3);
    V->ResetUpgrades(false);V->SelectVehicle(2);V->SetUpgrade(TerraSim::Electrical,3,false);
    Check(TEXT("unfitted electrical upgrade stays unavailable"),V->UpgradeStage(TerraSim::Electrical)==0&&V->Tuning.ElectricalPower==1);
    V->SelectVehicle(4);const float EVStock=V->PowerHP();V->SetUpgrade(TerraSim::Electrical,3,false);
    Check(TEXT("EV battery inverter stage increases propulsion power"),V->PowerHP()>EVStock*1.25f,V->PowerHP());
    V->ResetUpgrades(false);V->SelectVehicle(0);V->TeleportZone(1);Next(30);Start=V->GetActorLocation();
  } else if(Stage==30||Stage==31){
    V->TestThrottle=StageTime>1.5f?.55f:0;V->TestBrake=StageTime<1.5f?1:0;
    if(StageTime>8){
      const float Distance=FVector::Dist2D(Start,V->GetActorLocation())/100;
      if(Stage==30){
        StockUpgradeSpeed=V->Speed;StockUpgradeDistance=Distance;
        V->SetUpgrade(TerraSim::Engine,3,false);V->TeleportZone(1);Start=V->GetActorLocation();Next(31);
      }else{
        UE_LOG(LogTemp,Display,TEXT("TERRA_UPGRADE_DRIVE stock_speed=%.3f tuned_speed=%.3f stock_distance=%.3f tuned_distance=%.3f"),StockUpgradeSpeed,V->Speed,StockUpgradeDistance,Distance);
        Check(TEXT("engine upgrade changes packaged driving performance"),V->Speed>StockUpgradeSpeed*1.12f&&Distance>StockUpgradeDistance*1.08f,V->Speed);
        V->TestThrottle=0;V->TestBrake=1;V->ResetUpgrades(false);V->TeleportZone(0);Next(32);
      }
    }
  } else if(Stage==32){
    if(StageTime>.8f&&!Captured){
      V->SetGarage(true);
      Check(TEXT("garage freezes vehicle and exposes cursor"),V->Garage&&!V->Chassis->IsSimulatingPhysics()&&GetWorld()->GetFirstPlayerController()->bShowMouseCursor);
      Captured=true;
    }
    if(StageTime>1.6f&&StageTime<1.7f)Capture(TEXT("native-vehicle-menu.png"));
    if(StageTime>2){
      V->SetGarage(false);
      Check(TEXT("leaving garage resumes native driving"),!V->Garage&&V->Chassis->IsSimulatingPhysics()&&!GetWorld()->GetFirstPlayerController()->bShowMouseCursor);
      V->SelectVehicle(0);V->Terrain->ResetSoil();V->TeleportZone(3);V->TestBrake=1;V->TestThrottle=0;V->Pressure=37;Next(33);
    }
  } else if(Stage==33){
    if(StageTime>2&&!Captured){
      StockFootprint=StockTerrainGrip=0;
      for(const auto &W:V->WheelState){StockFootprint+=W.Footprint*.25f;StockTerrainGrip+=W.Grip*.25f;}
      V->Pressure=16;Captured=true;
    }
    if(StageTime>4){
      float Patch=0,Grip=0;for(const auto &W:V->WheelState){Patch+=W.Footprint*.25f;Grip+=W.Grip*.25f;}
      Check(TEXT("lower pressure enlarges the live soil footprint"),Patch>StockFootprint*1.15f,Patch/StockFootprint);
      Check(TEXT("lower pressure improves live loose terrain grip"),Grip>StockTerrainGrip*1.05f,Grip/StockTerrainGrip);
      UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE stock_patch=%.4f low_patch=%.4f stock_grip=%.4f low_grip=%.4f"),StockFootprint,Patch,StockTerrainGrip,Grip);
      const auto P=V->WheelState[0].Contact;const float Before=V->Terrain->Height(P.X,P.Y);
      for(int I=0;I<100;++I)V->Terrain->Deform(P,FVector::ForwardVector,5500,16,.285f,.28f,.8f,1,.025f);
      const auto Soil=V->Terrain->Sample(P);
      Check(TEXT("deformed ruts add depth dependent rolling resistance"),Soil.RutDepth>.005f&&V->Terrain->Height(P.X,P.Y)<Before&&TerraSim::RutResistance(Soil.RutDepth,.42f,Soil.Softness,Soil.Packing,false)>0,Soil.RutDepth);
      FVector Seam=P;Seam.X=FMath::RoundToFloat(P.X/800)*800;
      for(int I=0;I<100;++I)V->Terrain->Deform(Seam,FVector::ForwardVector,5500,16,.7f,.7f,.8f,1,.025f);
      const float Left=V->Terrain->Sample(Seam-FVector(.5,0,0)).RutDepth,Right=V->Terrain->Sample(Seam+FVector(.5,0,0)).RutDepth;
      Check(TEXT("rut deformation remains continuous across tile seams"),Left>.005f&&Right>.005f&&FMath::Abs(Left-Right)<.005f,FMath::Abs(Left-Right));
      const auto Groups=V->Terrain->Data->GetArrayField(TEXT("nativeDetails"));
      const auto Position=Groups[0]->AsObject()->GetArrayField(TEXT("instances"))[0]->AsObject()->GetArrayField(TEXT("p"));
      const FVector Rock(Position[0]->AsNumber(),Position[1]->AsNumber(),Position[2]->AsNumber());
      const auto Support=V->Terrain->CastTireSupport(Rock+FVector(0,0,220),FVector::UpVector,FVector::ForwardVector,42,28,-30,260,V);
      Check(TEXT("modeled boulder provides physical tire support"),Support.Hit&&Support.Constructed&&Support.Surface==4,Support.Distance);
      const auto LogPosition=Groups[4]->AsObject()->GetArrayField(TEXT("instances"))[0]->AsObject()->GetArrayField(TEXT("p"));
      const FVector LogPoint(LogPosition[0]->AsNumber(),LogPosition[1]->AsNumber(),LogPosition[2]->AsNumber());
      const auto LogSupport=V->Terrain->CastTireSupport(LogPoint+FVector(0,0,220),FVector::UpVector,FVector::ForwardVector,42,28,-30,260,V);
      Check(TEXT("modeled deadwood provides physical tire support"),LogSupport.Hit&&LogSupport.Constructed,LogSupport.Distance);
      Check(TEXT("visible suspension follows live wheel travel"),FVector::Dist(V->SuspensionParts[0]->GetComponentLocation(),V->Wheels[0]->GetComponentLocation())<90&&V->SuspensionParts[2]->GetComponentScale().Z>.1f);
      Capture(TEXT("native-tire-ruts.png"));
      V->Pressure=37;FinishValidation();
    }
  }

}
void ATerraGameMode::FinishValidation() {
  const FString Report = TEXT("{\"engine\":\"5.8.3\",\"tests\":[") +
      FString::Join(Results, TEXT(",")) + TEXT("]}");
  FString Output = FPaths::ProjectSavedDir() / TEXT("native-validation.json");
  FParse::Value(FCommandLine::Get(), TEXT("TerraReport="), Output);
  const bool Saved = FFileHelper::SaveStringToFile(Report, *Output);
  const bool Failed = !Saved || Report.Contains(TEXT("false"));
  UE_LOG(LogTemp, Display, TEXT("TERRA_NATIVE_VALIDATION %s %s"),
      Failed ? TEXT("FAIL") : TEXT("PASS"), *Report);
  FPlatformMisc::RequestExitWithStatus(false, Failed ? 1 : 0);
}
