#include "TerraGameMode.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "HAL/PlatformMisc.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
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
  if (!V || !Canvas)
    return;
  float W = Canvas->SizeX, H = Canvas->SizeY;
  DrawRect(FLinearColor(.015, .025, .028, .88), 18, 18, 510, 172);
  DrawText(TEXT("TERRA DRIVE  /  NATIVE PREVIEW"), FLinearColor(.82, .9, .76),
           34, 28, nullptr, 1.25f);
  DrawText(V->VehicleName, FLinearColor::White, 34, 56, nullptr, 1.1f);
  DrawText(FString::Printf(TEXT("%3.0f km/h    %s%d    %4.0f rpm"),
                           FMath::Abs(V->Speed) * 3.6f,
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
  DrawText(TEXT("1-9 Regions    J Next challenge    V Vehicle    T Tracks    F 4WD    L Low    Z Rear lock    U Front lock"),
           FLinearColor(.85, .88, .88), 30, H - 54);
  DrawText(TEXT("Shift+W Crawl throttle    K Descent assist    R Recover / restart    Tab Garage    Esc Quit"),
           FLinearColor(.85,.88,.88),30,H-30);
  if (V->Garage) {
    DrawRect(FLinearColor(.025, .04, .045, .97), W * .25, H * .22, W * .5, 240);
    DrawText(TEXT("FIELD GARAGE"), FLinearColor(.8, .9, .72), W * .25 + 24,
             H * .22 + 24, nullptr, 1.8f);
    DrawText(
        TEXT("V  Next vehicle      T  Wheels / tracks      +/-  Tire pressure"),
        FLinearColor::White, W * .25 + 24, H * .22 + 70);
    DrawText(FString::Printf(
                 TEXT("E  Engine stage %d      H  Suspension lift %d mm"),
                 V->EngineUpgrade, V->LiftUpgrade * 50),
             FLinearColor::White, W * .25 + 24, H * .22 + 104);
    DrawText(TEXT("F  Driveline      L  Low range      Backspace  Repair / "
                  "reset soil"),
             FLinearColor::White, W * .25 + 24, H * .22 + 138);
    DrawText(TEXT("P  Dry / rain      Tab  Return to driving"),
             FLinearColor::White, W * .25 + 24, H * .22 + 172);
  }
  if (V->WinchAttached)
    DrawText(FString::Printf(TEXT("WINCH %.1f kN"), V->WinchTension / 1000),
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
      FinishValidation();
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
