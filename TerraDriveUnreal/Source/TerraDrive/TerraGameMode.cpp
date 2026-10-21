#include "TerraGameMode.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
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
  DrawRect(FLinearColor(.015, .025, .028, .88), 18, 18, 440, 142);
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
  DrawText(V->Notice, FLinearColor(.93, .82, .54), 24, 174);
  DrawRect(FLinearColor(.015, .025, .028, .83), 18, H - 92, W - 36, 74);
  DrawText(TEXT("W/S  Accelerate / brake, hold at rest to reverse     A/D  "
                "Steer     Space  Brake     RMB + mouse  Camera"),
           FLinearColor(.85, .88, .88), 30, H - 80);
  DrawText(TEXT("1–8  Regions     V  Vehicle     T  Tracks     F  4WD     L  "
                "Low     +/-  PSI     X  Attach winch     Q  Reel     Tab  "
                "Garage     Esc  Quit"),
           FLinearColor(.85, .88, .88), 30, H - 54);
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
  if (TestTime > 100) {
    Results.Add(TEXT("{\"case\":\"validation timeout or missing world\",\"pass\":false}"));
    FinishValidation();
    return;
  }
  auto *V = Cast<ATerraVehicle>(UGameplayStatics::GetPlayerPawn(this, 0));
  if (!V || !V->Terrain || !V->Terrain->Ready || !V->Initialized)
    return;
  StageTime += Dt;
  // These exercise the native Chaos world, not the historical JS tests.
  if (Stage == 0) {
    Results.Add(FString::Printf(TEXT("{\"case\":\"native world data\",\"zones\":%d,\"pass\":%s}"),
        V->Terrain->Spawns.Num(), V->Terrain->Spawns.Num() == 8 ? TEXT("true") : TEXT("false")));
    for (int I = 0; I < 5; ++I) {
      V->SelectVehicle(I);
      bool Loaded = V->Body->GetStaticMesh() != nullptr;
      for (auto Wheel : V->Wheels)
        Loaded &= Wheel->GetStaticMesh() != nullptr;
      Results.Add(FString::Printf(TEXT("{\"case\":\"vehicle %d meshes\",\"pass\":%s}"),
          I, Loaded ? TEXT("true") : TEXT("false")));
    }
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
        FinishValidation();
      } else {
        V->SelectVehicle((Stage - 5) % 5);
        V->TeleportZone(Stage - 5);
      }
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
