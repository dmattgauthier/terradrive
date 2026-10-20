#include "TerraGameMode.h"
#include "Components/BoxComponent.h"
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
  auto *V = Cast<ATerraVehicle>(UGameplayStatics::GetPlayerPawn(this, 0));
  if (!V || !V->Terrain || !V->Terrain->Ready)
    return;
  StageTime += Dt;
  TestTime += Dt;
  // These exercise the native Chaos world, not the historical JS tests.
  if (Stage == 0) {
    V->TeleportZone(1);
    Start = V->GetActorLocation();
    Stage = 1;
    StageTime = 0;
  }
  if (Stage == 1) {
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
      Results.Add(FString::Printf(
          TEXT("{\"case\":\"EV steered launch\",\"speedMS\":%.3f,\"pass\":%s}"),
          V->Speed, V->Speed > 1 ? TEXT("true") : TEXT("false")));
      FString Report = TEXT("{\"engine\":\"5.8.3\",\"tests\":[") +
                       FString::Join(Results, TEXT(",")) + TEXT("]}");
      FFileHelper::SaveStringToFile(Report, *(FPaths::ProjectSavedDir() /
                                              TEXT("native-validation.json")));
      bool Failed = Report.Contains(TEXT("false"));
      UE_LOG(LogTemp, Display, TEXT("TERRA_NATIVE_VALIDATION %s %s"),
             Failed ? TEXT("FAIL") : TEXT("PASS"), *Report);
      FPlatformMisc::RequestExitWithStatus(false, Failed ? 1 : 0);
    }
  }
  if (TestTime > 40) {
    UE_LOG(LogTemp, Error, TEXT("Native validation timed out"));
    FPlatformMisc::RequestExitWithStatus(false, 2);
  }
}
