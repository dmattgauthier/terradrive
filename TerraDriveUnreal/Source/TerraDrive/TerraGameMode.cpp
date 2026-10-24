#include "TerraGameMode.h"
#include "Camera/CameraComponent.h"
#include "Camera/CameraActor.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Engine/Texture2D.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "HAL/PlatformMisc.h"
#include "HAL/IConsoleManager.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "TerraVehicle.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "TerraWorld.h"
#include "TerraUnits.h"
#include "TerraContact.h"
#include "TerraGraphics.h"
#include "TerraMomentumValidation.h"
#include "TerraWinterValidation.h"
#include "Misc/App.h"
#include "UnrealClient.h"
ATerraGameMode::ATerraGameMode() {
  DefaultPawnClass = ATerraVehicle::StaticClass();
  HUDClass = ATerraHUD::StaticClass();
  PrimaryActorTick.bCanEverTick = true;
}
void ATerraGameMode::BeginPlay() {
  Super::BeginPlay();
  TerraGraphics::Initialize();
  // Create visible vehicle proxies while their PSOs warm; delaying proxies
  // can otherwise show only wheels on the first cold vehicle selection.
  if(auto *Strategy=IConsoleManager::Get().FindConsoleVariable(TEXT("r.PSOPrecache.ProxyCreationStrategy")))Strategy->Set(0,ECVF_SetByCode);
  GetWorld()->SpawnActor<ATerraWorld>();
}
void ATerraHUD::DrawHUD() {
  Super::DrawHUD();
  if(!bShowHUD)return;
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
  DrawText(TEXT("W/S  Drive / brake; hold opposite input through a stop to reverse     A/D  "
                "Steer     Space  Brake     RMB + mouse  Camera"),
           FLinearColor(.85, .88, .88), 30, H - 80);
  DrawText(TEXT("1-9 Regions    J Next challenge    V Garage    T Tracks    F 4WD    L Low    Z Rear lock    U Front lock"),
           FLinearColor(.85, .88, .88), 30, H - 54);
  DrawText(TEXT("Shift+W Crawl    K Descent assist    R Recover    0 Winter / proving ground    Tab Garage    Esc Quit"),
           FLinearColor(.85,.88,.88),30,H-30);
  if (V->WinchAttached)
    DrawText(FString::Printf(TEXT("WINCH %.0f lbf"), TerraUnits::PoundsForce(V->WinchTension)),
             FLinearColor(.74, .9, 1), W - 240, 32);
}
void ATerraGameMode::Tick(float Dt) {
  Super::Tick(Dt);
  auto *GraphicsVehicle=Cast<ATerraVehicle>(UGameplayStatics::GetPlayerPawn(this,0));
  const bool Automated=FParse::Param(FCommandLine::Get(),TEXT("unattended"));
  TerraGraphics::Tick(GraphicsVehicle&&GraphicsVehicle->Garage,!Automated&&!FApp::HasFocus());
  if (!FParse::Param(FCommandLine::Get(), TEXT("TerraValidate")))
    return;
  TestTime += Dt;
  if (TestTime > 750) {
    Results.Add(TEXT("{\"case\":\"validation timeout or missing world\",\"pass\":false}"));
    FinishValidation();
    return;
  }
  auto *V = Cast<ATerraVehicle>(UGameplayStatics::GetPlayerPawn(this, 0));
  if (!V || !V->Terrain || !V->Terrain->Ready || !V->Initialized)
    return;
  StageTime += Dt;
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraSoilOnly"))){Stage=51;StageTime=0;}
  auto Check = [&](const FString &Name, bool Pass, float Value=0.f) {
    Results.Add(FString::Printf(TEXT("{\"case\":\"%s\",\"value\":%.4f,\"pass\":%s}"),*Name,Value,Pass?TEXT("true"):TEXT("false")));
  };
  if(FParse::Param(FCommandLine::Get(),TEXT("TerraMomentumOnly"))){
    if(TerraMomentumValidation::Tick(V,Dt,Check))FinishValidation();
    return;
  }
  auto Capture = [&](const TCHAR *Name) {
    if (FParse::Param(FCommandLine::Get(),TEXT("TerraCapture")))
      FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir()/TEXT("Screenshots")/Name,true,false);
  };
  if(FParse::Param(FCommandLine::Get(),TEXT("TerraWinterOnly"))){
    if(TerraWinterValidation::Tick(V,Dt,Check,Capture))FinishValidation();
    return;
  }
  auto Next = [&](int NewStage) { Stage=NewStage; StageTime=0; Captured=false; MaxProgress=0; };
  auto LogReverseBrake = [&](const TCHAR *Phase) {
    const FVector Position=V->GetActorLocation(),Velocity=V->Chassis->GetPhysicsLinearVelocity()/100;
    FString Contacts;
    for(int I=0;I<4;++I){
      const auto &Wheel=V->WheelState[I];
      Contacts+=FString::Printf(TEXT(" wheel%d=%d/%d/%.3f/%.1f/%.3f"),I,Wheel.ContactValid,
          int(Wheel.Ground.Surface),Wheel.Ground.Packing,Wheel.Load,Wheel.Ground.Normal.Z);
    }
    UE_LOG(LogTemp,Display,TEXT("TERRA_REVERSE_BRAKE phase=%s stage=%d t=%.3f positionCM=%s velocityMPS=%s signedSpeed=%.4f throttle=%.3f brake=%.3f direction=%d contacts=%d%s"),
        Phase,Stage,StageTime,*Position.ToString(),*Velocity.ToString(),V->Speed,V->Throttle,V->Brake,V->Direction,V->ContactCount,*Contacts);
  };
  auto BeginReverseTrial = [&]() {
    V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);
    // Keep the entire W/S/reapply/Space sequence on the same clear pavement.
    // The default spawn is only 46 m from the west road end, so the reverse
    // leg otherwise reaches the adjacent steep dirt hill before Space holds.
    const FVector Original=V->GetActorLocation();
    FVector Position=Original+FVector(4000,0,0);
    Position.Z+=V->Terrain->Height(Position.X,Position.Y)-V->Terrain->Height(Original.X,Original.Y);
    V->SetActorLocation(Position,false,nullptr,ETeleportType::TeleportPhysics);
    V->TestDriverInput=true;V->TestSteer=0;V->TestForward=V->TestReverse=V->TestStop=false;
    Next(36);LogReverseBrake(TEXT("start"));
  };
  auto LockerTrial = [&](bool Locked) {
    // Each comparison needs virgin soil and the same stock vehicle. The open
    // pass must not leave ruts/packing for only the locked pass to negotiate.
    V->Terrain->ResetSoil();V->SelectVehicle(0);V->ResetUpgrades(false);
    V->SetGarage(false);
    V->FourDrive=V->LowRange=true;V->FrontLocked=V->RearLocked=Locked;
    V->TestDriverInput=false;V->TestSteer=0;V->TestBrake=1;V->TestThrottle=0;
    V->TeleportRoute(4);
    const auto &Route=V->Terrain->Routes[4];
    const FVector Forward=FRotator(0,Route.Yaw,0).Vector(),Side(-Forward.Y,Forward.X,0);
    // Follow the low side of the first articulated ledge in both trials.
    // The centre ridge correctly high-centres the modeled running board;
    // axle lockers cannot overcome a chassis supported by rock.
    constexpr float TargetLateral=-.50f;
    const FVector Requested=V->GetActorLocation()+Side*(TargetLateral*100);
    FVector Position=Requested;
    FHitResult Floor;FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraLockerStart),true,V);
    const bool FloorHit=GetWorld()->LineTraceSingleByChannel(Floor,Position+FVector(0,0,500),Position-FVector(0,0,1000),ECC_Visibility,Query);
    if(FloorHit)Position.Z+=Floor.ImpactPoint.Z-Route.Spawn.Z;
    V->SetActorLocation(Position,false,nullptr,ETeleportType::TeleportPhysics);
    Start=Route.Spawn; // Progress and the corridor retain the original course anchor.
    LockerDriving=false;LockerDriveTime=LockerPeakLateral=LockerPeakYaw=0;LockerSampleSecond=-1;
    LockerBodyEdge=LockerTireEdge=0;LockerClearance=10000;LockerGeometrySamples=0;LockerGeometryFinite=true;
    LockerPostSamples=LockerPostOverlaps=0;LockerPostBases.Reset();
    // offroad-courses.mjs bakes vertical 1.5 m posts with .16 m maximum
    // radius at each gate side. Query the actual cooked top caps because
    // the cross-axle deck gives the two sides different base heights.
    for(int Gate=0;Gate<Route.Gates.Num();++Gate)for(int Sign:{-1,1}){
      const FVector Axis=Route.Gates[Gate]+Side*(Sign*Route.GateWidth*50);
      FHitResult Cap;FCollisionQueryParams PostQuery(SCENE_QUERY_STAT(TerraLockerPost),true,V);
      const bool CapHit=GetWorld()->LineTraceSingleByChannel(Cap,Axis+FVector(0,0,1000),Axis-FVector(0,0,1000),ECC_Visibility,PostQuery);
      const auto *PostMesh=Cast<UStaticMeshComponent>(Cap.GetComponent());
      const bool Valid=CapHit&&PostMesh&&PostMesh->GetStaticMesh()&&PostMesh->GetStaticMesh()->GetName()==TEXT("granite_trials")&&
          Cap.ImpactNormal.Z>.99f&&!Cap.ImpactPoint.ContainsNaN()&&FVector::DistSquared2D(Cap.ImpactPoint,Axis)<1;
      LockerGeometryFinite&=Valid;
      const FVector Base=Cap.ImpactPoint-FVector(0,0,150);
      if(Valid)LockerPostBases.Add(Base);
      UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER_POST locked=%d gate=%d side=%d valid=%d base=%s top=%s radius=0.1600 height=1.5000 guard=0.0010"),
          Locked,Gate,Sign,Valid,*Base.ToString(),*Cap.ImpactPoint.ToString());
    }
    LockerGeometryFinite&=LockerPostBases.Num()==8;
    LockerWorstPosition=Position;LockerWorstRotation=V->GetActorRotation();
    UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER_START locked=%d soilTiles=%d targetLateral=%.2f requested=%s position=%s routeCenter=%s floorHit=%d floorZ=%.3f"),
        Locked,V->Terrain->DetailCount(),TargetLateral,*Requested.ToString(),*V->GetActorLocation().ToString(),*Start.ToString(),FloorHit,FloorHit?Floor.ImpactPoint.Z:0);
  };
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraTrailOnly")))Next(61);
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraHeroOnly")))Next(64);
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraModelHeroOnly"))){ModelVehicle=0;Next(64);}
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraGroundOnly")))Next(66);
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraTransitionsOnly")))Next(80);
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraTerrainDetailOnly")))Next(84);
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraLockersOnly")))Next(16);
  if(Stage==0&&(FParse::Param(FCommandLine::Get(),TEXT("TerraRenderOnly"))||FParse::Param(FCommandLine::Get(),TEXT("TerraPerfOnly"))))Next(69);
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraBrakeOnly"))){
    BrakeVehicle=0;V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);
    V->TestDriverInput=true;V->TestForward=V->TestReverse=V->TestStop=false;V->TestSteer=0;Next(34);
  }
  if(Stage==0&&FParse::Param(FCommandLine::Get(),TEXT("TerraVisualOnly"))){
    V->SelectVehicle(0);V->ResetUpgrades(false);V->TeleportZone(1);V->SetGarage(true);V->SetGarageView(1);ModelVehicle=0;ModelView=0;Stage=44;StageTime=0;
    GarageCameraBefore=V->Camera->GetComponentLocation();
  }
  // These exercise the native Chaos world, not the historical JS tests.
  if (Stage == 0) {
    Results.Add(FString::Printf(TEXT("{\"case\":\"native world data\",\"zones\":%d,\"pass\":%s}"),
        V->Terrain->Spawns.Num(), V->Terrain->Spawns.Num() == 9 ? TEXT("true") : TEXT("false")));
    for (int I = 0; I < ATerraVehicle::VehicleCount; ++I) {
      V->SelectVehicle(I);
      bool Loaded = V->Body->GetStaticMesh() != nullptr;
      for (auto Wheel : V->Wheels)
        Loaded &= Wheel->GetStaticMesh() != nullptr;
      Results.Add(FString::Printf(TEXT("{\"case\":\"vehicle %d meshes\",\"pass\":%s}"),
          I, Loaded ? TEXT("true") : TEXT("false")));
      Check(FString::Printf(TEXT("vehicle %d articulated suspension and upgrade models"),I),
          V->SuspensionParts.Num()==20&&V->Protection->GetStaticMesh()&&V->TrailEquipment->GetStaticMesh());
      bool SplitLoaded=V->Rims.Num()==4&&V->HubDetails.Num()==16;
      for(auto Rim:V->Rims)SplitLoaded&=Rim->GetStaticMesh()!=nullptr;
      for(int Wheel=0;Wheel<4;++Wheel)SplitLoaded&=V->HubDetails[Wheel*4+2]->GetStaticMesh()!=nullptr;
      const auto VehicleSpec=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[I]->AsObject();
      for(int TireStage=1;TireStage<=3;++TireStage)SplitLoaded&=LoadObject<UStaticMesh>(nullptr,*FString::Printf(TEXT("/Game/Meshes/%s_tire_%d"),*VehicleSpec->GetStringField(TEXT("asset")),TireStage))!=nullptr;
      Check(FString::Printf(TEXT("vehicle %d factory rims, upgraded tires and stationary brakes"),I),SplitLoaded);
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
    Check(TEXT("challenge assets and routes"),V->Terrain->ConstructedMeshCount==3&&V->Terrain->Routes.Num()==9,V->Terrain->ConstructedMeshCount);
    const auto LoopFrames=V->Terrain->Data->GetArrayField(TEXT("loopFrames"));
    for(int I=0;I<5;++I){
      const auto Frame=LoopFrames[I*6]->AsObject();
      const auto P0=Frame->GetArrayField(TEXT("p")),N0=Frame->GetArrayField(TEXT("n"));
      const FVector P(P0[0]->AsNumber(),P0[1]->AsNumber(),P0[2]->AsNumber()),N(N0[0]->AsNumber(),N0[1]->AsNumber(),N0[2]->AsNumber());
      const auto S=V->Terrain->CastSupport(P+N*65,N,42,-30,57,V);
      Check(FString::Printf(TEXT("circular loop physical contact %d"),I),S.Hit&&S.Constructed&&FMath::Abs(S.Distance-23)<3,S.Distance);
    }
    float RadiusError=0;
    for(auto F:LoopFrames){const auto P=F->AsObject()->GetArrayField(TEXT("p"));RadiusError=FMath::Max(RadiusError,float(FMath::Abs(FMath::Sqrt(FMath::Square(P[0]->AsNumber()-5800)+FMath::Square(P[2]->AsNumber()-2472))-2000)));}
    Check(TEXT("loop side elevation is a 131-foot circle"),RadiusError<.01f,RadiusError);
    const bool FabEnabled=V->Terrain->Data->GetObjectField(TEXT("fabScenery"))->GetBoolField(TEXT("enabled"));
    const bool TerrainPacks=LoadObject<UTexture2D>(nullptr,TEXT("/Game/Textures/Ground_TEX_MWAM_Grass_col"))&&
      LoadObject<UTexture2D>(nullptr,TEXT("/Game/Textures/Ground_T_CleanSnow_BC"));
    Check(TEXT("MW landscape and scanned Winter snow textures are cooked and loadable"),TerrainPacks);
    Check(TEXT("all declared acquired scenery meshes load in packaged game"),!FabEnabled||V->Terrain->FabAssetCount==V->Terrain->Data->GetObjectField(TEXT("fabScenery"))->GetArrayField(TEXT("groups")).Num(),V->Terrain->FabAssetCount);
    Check(TEXT("acquired Fab scenery is placed with physical collision"),!FabEnabled||V->Terrain->FabInstanceCount>100,V->Terrain->FabInstanceCount);
    int FabRayHits=0;
    TArray<UInstancedStaticMeshComponent*> FabComponents;V->Terrain->GetComponents(FabComponents);
    for(auto *C:FabComponents)if(C->ComponentHasTag(TEXT("TerraFabScenery"))&&C->GetCollisionEnabled()!=ECollisionEnabled::NoCollision&&C->GetInstanceCount()>0){
      FTransform Instance;C->GetInstanceTransform(0,Instance,true);
      const FVector P=Instance.TransformPosition(C->GetStaticMesh()->GetBoundingBox().GetCenter());
      FHitResult Hit;FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraFabValidation),true,V);
      if(GetWorld()->LineTraceSingleByChannel(Hit,P+FVector(0,0,1500),P-FVector(0,0,1500),ECC_Visibility,Query)&&Hit.GetComponent()==C)++FabRayHits;
    }
    Check(TEXT("imported Fab outcrops block a native world collision ray"),!FabEnabled||FabRayHits>0,FabRayHits);
    int BentGrassGroups=0;
    for(auto *C:FabComponents)if(C->GetStaticMesh()&&C->GetStaticMesh()->GetName().StartsWith(TEXT("MW_Grass"))&&C->GetInstanceCount()>0){
      FTransform Before,After,Restored;C->GetInstanceTransform(0,Before,true);
      V->Terrain->Deform(Before.GetLocation(),FVector::ForwardVector,5500,24,.32f,.22f,0,2,.05f);
      C->GetInstanceTransform(0,After,true);V->Terrain->ResetSoil();C->GetInstanceTransform(0,Restored,true);
      if(After.GetScale3D().Z<Before.GetScale3D().Z*.3f&&Restored.GetScale3D().Equals(Before.GetScale3D(),.0001f))++BentGrassGroups;
    }
    Check(TEXT("all three acquired MW grass variants flatten under tire load and restore"),!FabEnabled||BentGrassGroups==3,BentGrassGroups);
    { const auto S=V->Terrain->CastSupport(FVector(500,18300,860),FVector::UpVector,42,-30,57,V); Check(TEXT("jump gap has no hidden support"),!S.Hit); }
    V->SelectVehicle(0);
    for(int I=0;I<4;++I){
      V->WheelState[I].Center=V->Wheels[I]->GetComponentLocation();V->WheelState[I].Angle=0;
      V->WheelState[I].Rotation=.12f;
    }
    V->UpdateWheelVisuals();
    for(int I=0;I<4;++I){
      const auto Bottom=V->GetActorQuat().UnrotateVector(V->Wheels[I]->GetComponentQuat().RotateVector(FVector(0,0,-1)));
      Check(FString::Printf(TEXT("wheel %d forward rotation carries bottom tread rearward"),I),Bottom.X<-.10f,Bottom.X);
      V->WheelState[I].Rotation=-.12f;
    }
    V->UpdateWheelVisuals();
    for(int I=0;I<4;++I){
      const auto Bottom=V->GetActorQuat().UnrotateVector(V->Wheels[I]->GetComponentQuat().RotateVector(FVector(0,0,-1)));
      Check(FString::Printf(TEXT("wheel %d reverse rotation carries bottom tread forward"),I),Bottom.X>.10f,Bottom.X);
    }
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
      // Snow alone has a deliberate native relief layer above the preserved
      // browser/source elevation. These spawn references are metre-grid nodes.
      const float ExpectedHeight=ExpectedHeights[Region]+V->Terrain->SnowDrift(Spawn.X,Spawn.Y)/100;
      const uint8 Surface = V->Terrain->Sample(Spawn).Surface;
      const bool Stable = !P.ContainsNaN() && FMath::IsFinite(V->Speed) &&
          FMath::Abs(P.Z - V->Terrain->Height(P.X, P.Y)) < 400 &&
          Surface == ExpectedSurfaces[Region] && FMath::Abs(Spawn.Z / 100 - ExpectedHeight) < .01f;
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
    LockerTrial(false);Next(17);
  } else if(Stage==17||Stage==18){
    const auto &Route=V->Terrain->Routes[4];
    const FVector Forward=FRotator(0,Route.Yaw,0).Vector(),Side(-Forward.Y,Forward.X,0);
    const float Lateral=FVector::DotProduct(V->GetActorLocation()-Route.Spawn,Side)/100;
    const float YawError=FMath::FindDeltaAngleDegrees(V->GetActorRotation().Yaw,Route.Yaw);
    LockerPeakLateral=FMath::Max(LockerPeakLateral,FMath::Abs(Lateral));
    LockerPeakYaw=FMath::Max(LockerPeakYaw,FMath::Abs(YawError));
    // All tires must remain on the same ledges throughout the attempt. The
    // coachwork may overhang between gates, but its entire bounding OBB must
    // clear each real finite post; an invisible body wall would reject that
    // physically valid articulation between widely separated markers.
    const float StripHalfWidth=Route.GateWidth*.5f-.16f;
    float BodyEdge=0,TireEdge=0;bool GeometryFinite=V->Body->GetStaticMesh()!=nullptr&&V->Wheels.Num()==4;
    if(V->Body->GetStaticMesh()){
      const FBox Bounds=V->Body->GetStaticMesh()->GetBoundingBox();
      GeometryFinite&=Bounds.IsValid!=0;
      const FBox PostGuard=Bounds.ExpandBy(16.1f); // .16 m post radius + 1 mm.
      const FTransform BodyTransform=V->Body->GetComponentTransform();
      GeometryFinite&=LockerPostBases.Num()==8;
      for(const FVector &Base:LockerPostBases){
        const FVector LocalBase=BodyTransform.InverseTransformPosition(Base);
        const FVector LocalTop=BodyTransform.InverseTransformPosition(Base+FVector(0,0,150));
        GeometryFinite&=!LocalBase.ContainsNaN()&&!LocalTop.ContainsNaN();
        ++LockerPostSamples;
        if(FMath::LineBoxIntersection(PostGuard,LocalBase,LocalTop,LocalTop-LocalBase))++LockerPostOverlaps;
      }
      for(int X=0;X<2;++X)for(int Y=0;Y<2;++Y)for(int Z=0;Z<2;++Z){
        const FVector Corner(X?Bounds.Max.X:Bounds.Min.X,Y?Bounds.Max.Y:Bounds.Min.Y,Z?Bounds.Max.Z:Bounds.Min.Z);
        const FVector Point=V->Body->GetComponentTransform().TransformPosition(Corner);
        const float Edge=FMath::Abs(float(FVector::DotProduct(Point-Route.Spawn,Side)))/100;
        GeometryFinite&=!Point.ContainsNaN()&&FMath::IsFinite(Edge);
        if(FMath::IsFinite(Edge))BodyEdge=FMath::Max(BodyEdge,Edge);
      }
    }
    for(auto Wheel:V->Wheels){
      if(!Wheel||!Wheel->GetStaticMesh()){GeometryFinite=false;continue;}
      const FBox Bounds=Wheel->GetStaticMesh()->GetBoundingBox();
      const FVector Scale=Wheel->GetComponentScale().GetAbs(),Extent=Bounds.GetExtent();
      const FVector Center=Wheel->GetComponentTransform().TransformPosition(Bounds.GetCenter());
      const float AxleDot=FVector::DotProduct(Wheel->GetComponentQuat().GetAxisY(),Side);
      const float Radius=FMath::Max(Extent.X*Scale.X,Extent.Z*Scale.Z)/100;
      const float HalfWidth=Extent.Y*Scale.Y/100;
      const float Envelope=Radius*FMath::Sqrt(FMath::Max(0.f,1-AxleDot*AxleDot))+HalfWidth*FMath::Abs(AxleDot);
      const float Edge=FMath::Abs(float(FVector::DotProduct(Center-Route.Spawn,Side)))/100+Envelope;
      GeometryFinite&=!Center.ContainsNaN()&&FMath::IsFinite(Edge)&&Radius>0&&HalfWidth>0;
      if(FMath::IsFinite(Edge))TireEdge=FMath::Max(TireEdge,Edge);
    }
    const float Edge=FMath::Max(BodyEdge,TireEdge);
    if(Edge>FMath::Max(LockerBodyEdge,LockerTireEdge)){
      LockerWorstPosition=V->GetActorLocation();LockerWorstRotation=V->GetActorRotation();
    }
    LockerBodyEdge=FMath::Max(LockerBodyEdge,BodyEdge);LockerTireEdge=FMath::Max(LockerTireEdge,TireEdge);
    LockerClearance=FMath::Min(LockerClearance,StripHalfWidth-TireEdge);
    ++LockerGeometrySamples;LockerGeometryFinite&=GeometryFinite;
    if(!LockerDriving){
      // Let the same stock springs settle with the brakes held before each
      // measured attempt; a previous trial's final physics frame must not
      // become only the next vehicle's launch transient.
      V->TestSteer=V->TestThrottle=0;V->TestBrake=1;
      if(StageTime>2){
        LockerDriving=true;LockerDriveTime=0;Start=Route.Spawn;
        V->TestBrake=0;V->TestThrottle=.35f;
        UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER_DRIVE locked=%d targetLateral=-0.50 position=%s routeCenter=%s yaw=%.3f entrySpeed=%.4f mass=%.1f inertia=%s"),
            Stage==18,*V->GetActorLocation().ToString(),*Start.ToString(),V->GetActorRotation().Yaw,V->Chassis->GetPhysicsLinearVelocity().Size()/100,
            V->Chassis->GetMass(),*V->Chassis->GetInertiaTensor().ToString());
      }
    }else{
      LockerDriveTime+=Dt;
      // A driver follows the same low-side line in both comparisons. Fixed
      // zero steering allowed different paths and a legitimate running-board
      // hang-up on the centre ridge, obscuring the traction comparison.
      // This only requests ordinary steering; no body force or yaw is set.
      const float Correction=FMath::Clamp(FMath::RadiansToDegrees(FMath::Atan2(-.50f-Lateral,2.5f)),-18.f,18.f);
      const float HeadingError=FMath::FindDeltaAngleDegrees(V->GetActorRotation().Yaw,Route.Yaw+Correction);
      const float YawRate=V->Chassis->GetPhysicsAngularVelocityInDegrees().Z;
      V->TestSteer=FMath::Clamp(HeadingError/24.f-YawRate*.012f,-1.f,1.f);
      V->TestThrottle=.35f;V->TestBrake=0;
      MaxProgress=FMath::Max(MaxProgress,float(FVector::DotProduct(V->GetActorLocation()-Start,Forward))/100);
      const int Second=FMath::FloorToInt(LockerDriveTime);
      if(Second!=LockerSampleSecond){
        LockerSampleSecond=Second;
        UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER_SAMPLE locked=%d t=%.2f position=%s lateral=%.3f yaw=%.3f steer=%.3f speed=%.3f rpm=%.0f loads=%.0f/%.0f/%.0f/%.0f omega=%.3f/%.3f/%.3f/%.3f terrainHits=%d objectHits=%d"),
            Stage==18,LockerDriveTime,*V->GetActorLocation().ToString(),Lateral,V->GetActorRotation().Yaw,V->TestSteer,V->Speed,V->RPM,
            V->WheelState[0].Load,V->WheelState[1].Load,V->WheelState[2].Load,V->WheelState[3].Load,
            V->WheelState[0].Omega,V->WheelState[1].Omega,V->WheelState[2].Omega,V->WheelState[3].Omega,
            V->TerrainBodyHits,V->ObjectBodyHits);
      }
      if(LockerDriveTime>13&&!Captured){Capture(Stage==17?TEXT("native-open-climb.png"):TEXT("native-locked-climb.png"));Captured=true;}
      if(LockerDriveTime>14){
        UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER_FINISH locked=%d progress=%.3f peakLateral=%.3f peakYaw=%.3f"),
            Stage==18,MaxProgress,LockerPeakLateral,LockerPeakYaw);
        UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER_GEOMETRY locked=%d stripHalfWidth=%.4f bodyEdge=%.4f tireEdge=%.4f minClearance=%.4f samples=%d finite=%d posts=%d postSamples=%d postOverlaps=%d worstPosition=%s worstRotation=%s"),
            Stage==18,StripHalfWidth,LockerBodyEdge,LockerTireEdge,LockerClearance,LockerGeometrySamples,LockerGeometryFinite,LockerPostBases.Num(),LockerPostSamples,LockerPostOverlaps,*LockerWorstPosition.ToString(),*LockerWorstRotation.ToString());
        if(Stage==17){
          OpenProgress=MaxProgress;LockerOpenPeakLateral=LockerPeakLateral;LockerOpenClearance=LockerClearance;
          LockerOpenGeometrySamples=LockerGeometrySamples;LockerOpenGeometryFinite=LockerGeometryFinite;
          LockerOpenPostSamples=LockerPostSamples;LockerOpenPostOverlaps=LockerPostOverlaps;
          LockerTrial(true);Next(18);
        }
        else {
          Check(TEXT("locked axles climb farther than open axles"),MaxProgress>OpenProgress+.5f&&MaxProgress>8,MaxProgress-OpenProgress);
          Check(TEXT("locked axle shaft speeds remain coupled"),FMath::Abs(V->WheelState[0].Omega-V->WheelState[1].Omega)<.001f&&FMath::Abs(V->WheelState[2].Omega-V->WheelState[3].Omega)<.001f);
          const float MinimumClearance=FMath::Min(LockerOpenClearance,LockerClearance);
          Check(TEXT("both locker trials keep tires on course and body clear of real gate posts"),
              LockerOpenGeometryFinite&&LockerGeometryFinite&&LockerOpenGeometrySamples>=240&&LockerGeometrySamples>=240&&MinimumClearance>=0&&
              LockerOpenPostOverlaps==0&&LockerPostOverlaps==0&&LockerOpenPostSamples==LockerOpenGeometrySamples*8&&LockerPostSamples==LockerGeometrySamples*8,MinimumClearance);
          UE_LOG(LogTemp,Display,TEXT("TERRA_LOCKER open=%.3f locked=%.3f stripHalfWidth=%.4f openLateral=%.4f lockedLateral=%.4f openClearance=%.4f lockedClearance=%.4f"),
              OpenProgress,MaxProgress,StripHalfWidth,LockerOpenPeakLateral,LockerPeakLateral,LockerOpenClearance,LockerClearance);
          V->TestSteer=0; // Subsequent straight-line trials own fresh input.
          if(FParse::Param(FCommandLine::Get(),TEXT("TerraLockersOnly"))){FinishValidation();return;}
          V->SelectVehicle(0);V->LowRange=true;V->DescentAssist=true;V->TeleportRoute(7);V->Chassis->SetPhysicsLinearVelocity(FVector(500,0,0));Start=V->GetActorLocation();V->TestThrottle=0;Next(19);
        }
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
        const FVector Tangent=FVector(-20,-4.4563384,0).GetSafeNormal();
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
    Check(TEXT("tire upgrade changes rendered size and friction budget"),V->Wheels[0]->GetRelativeScale3D().X>1.1f&&V->GripMultiplier()>1.4f&&V->Wheels[0]->GetStaticMesh()&&V->Wheels[0]->GetStaticMesh()->GetName().EndsWith(TEXT("_tire_3")),V->GripMultiplier());
    Check(TEXT("larger tires retain factory rim and brake rotor diameter"),FMath::Abs(V->Rims[0]->GetComponentScale().X-1)<.001f,V->Rims[0]->GetComponentScale().X);
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
      const auto P=V->WheelState[0].Contact;
      // Test new excavation on fresh soil. A settled live footprint may
      // already be deeper than this fixture's target after fast compaction.
      V->Terrain->ResetSoil();const float Before=V->Terrain->Height(P.X,P.Y);
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
      V->Pressure=37;V->TestDriverInput=true;V->TestForward=V->TestReverse=V->TestStop=false;
      BrakeVehicle=0;V->SelectVehicle(0);V->ResetUpgrades(false);V->TeleportZone(1);Next(34);
    }
  } else if(Stage==34){
    V->TestDriverInput=true;V->TestStop=false;V->TestReverse=false;V->TestForward=StageTime>.6f;
    if(StageTime>4){
      BrakeEntrySpeed=V->Chassis->GetPhysicsLinearVelocity().Size2D()/100;
      Check(FString::Printf(TEXT("vehicle %d launches through shared W input"),BrakeVehicle),BrakeEntrySpeed>2,BrakeEntrySpeed);
      Start=V->GetActorLocation();V->TestStop=true;Next(35);
    }
  } else if(Stage==35){
    V->TestForward=true;V->TestStop=true;V->TestReverse=false;
    if(StageTime>5){
      const float ActualSpeed=V->Chassis->GetPhysicsLinearVelocity().Size2D()/100;
      Check(FString::Printf(TEXT("vehicle %d Space stops and holds against held throttle"),BrakeVehicle),
          ActualSpeed<.15f&&V->Throttle==0&&V->Brake==1,ActualSpeed);
      UE_LOG(LogTemp,Display,TEXT("TERRA_SPACE vehicle=%d entry=%.3f stopped=%.4f distance=%.3f"),BrakeVehicle,BrakeEntrySpeed,ActualSpeed,FVector::Dist2D(Start,V->GetActorLocation())/100);
      if(++BrakeVehicle<ATerraVehicle::VehicleCount){V->SelectVehicle(BrakeVehicle);V->ResetUpgrades(false);V->TeleportZone(1);V->TestForward=V->TestStop=false;Next(34);}
      else BeginReverseTrial();
    }
  } else if(Stage==36){
    V->TestForward=StageTime>.5f;V->TestReverse=V->TestStop=false;
    if(StageTime>4){
      Check(TEXT("W launch before S brake check"),V->Speed>3,V->Speed);
      LogReverseBrake(TEXT("W_launch_end"));
      V->TestForward=false;V->TestReverse=true;Next(37);
    }
  } else if(Stage==37){
    V->TestForward=false;V->TestReverse=true;V->TestStop=false;
    if(StageTime>5){
      const float ActualSpeed=V->Chassis->GetPhysicsLinearVelocity().Size2D()/100;
      Check(TEXT("held S brakes then selects physical reverse without a release"),V->Direction==-1&&V->Speed<-1,V->Speed);
      LogReverseBrake(TEXT("held_S_end"));
      V->TestReverse=false;Next(38);
    }
  } else if(Stage==38){
    V->TestReverse=StageTime>.35f;V->TestForward=V->TestStop=false;
    if(StageTime>4){
      Check(TEXT("S maintains physical reverse drive after reapplication"),V->Direction==-1&&V->Speed<-2,V->Speed);
      LogReverseBrake(TEXT("reapplied_S_end"));
      V->TestStop=true;Next(39);
    }
  } else if(Stage==39){
    V->TestReverse=true;V->TestStop=true;
    if(StageTime<=Dt||FMath::FloorToInt(StageTime)!=FMath::FloorToInt(FMath::Max(0.f,StageTime-Dt)))LogReverseBrake(TEXT("Space_hold"));
    if(StageTime>4){
      const float ActualSpeed=V->Chassis->GetPhysicsLinearVelocity().Size2D()/100;
      Check(TEXT("Space stops and holds while S requests reverse"),ActualSpeed<.15f&&V->Throttle==0,ActualSpeed);
      LogReverseBrake(TEXT("Space_hold_end"));
      V->SelectVehicle(0);V->ResetUpgrades(false);V->TeleportZone(1);V->TestForward=V->TestReverse=false;
      const FVector Origin(-22000,20000,V->Terrain->Height(-22000,20000)+700);
      const FRotator Rotation(12,0,0);const FVector Normal=Rotation.RotateVector(FVector::UpVector);
      BrakeRamp=NewObject<UBoxComponent>(V->Terrain);BrakeRamp->SetupAttachment(V->Terrain->GetRootComponent());
      BrakeRamp->InitBoxExtent(FVector(1200,500,20));BrakeRamp->SetCollisionProfileName(TEXT("BlockAll"));BrakeRamp->ComponentTags.Add(TEXT("TerraRock"));
      BrakeRamp->RegisterComponent();BrakeRamp->SetWorldLocationAndRotation(Origin-Normal*20,Rotation);
      V->SetActorLocationAndRotation(Origin+Normal*V->ExpectedRideHeight()*100,Rotation,false,nullptr,ETeleportType::TeleportPhysics);
      V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);Next(40);
    }
  } else if(Stage==40){
    V->TestStop=true;V->TestForward=V->TestReverse=false;
    if(StageTime>1.5f&&!Captured){Start=V->GetActorLocation();Captured=true;}
    if(StageTime>4.5f){
      const float ActualSpeed=V->Chassis->GetPhysicsLinearVelocity().Size()/100,Drift=FVector::Dist(Start,V->GetActorLocation())/100;
      Check(TEXT("Space holds contact speed on a twelve degree incline"),ActualSpeed<.12f&&V->ContactCount>=3,ActualSpeed);
      Check(TEXT("brake holding friction prevents sustained downhill creep"),Drift<.18f,Drift);
      BrakeRamp->DestroyComponent();BrakeRamp=nullptr;
      if(FParse::Param(FCommandLine::Get(),TEXT("TerraBrakeOnly"))){FinishValidation();return;}
      V->TestDriverInput=false;V->TestBrake=1;V->TestThrottle=V->TestSteer=0;V->SelectVehicle(4);V->ResetUpgrades(false);V->TeleportZone(1);Next(41);
    }
  } else if(Stage==41){
    if(StageTime>3){
      const auto P=V->GetActorLocation();StockRideHeight=(P.Z-V->Terrain->Height(P.X,P.Y))/100;
      Check(TEXT("Hummer stock suspension settles at its intended ride height"),FMath::Abs(StockRideHeight-V->ExpectedRideHeight())<.065f&&V->ContactCount>=3,StockRideHeight);
      V->SetUpgrade(TerraSim::Suspension,3,false);V->TeleportZone(1);Next(42);
    }
  } else if(Stage==42){
    if(StageTime>3){
      const auto P=V->GetActorLocation();const float Height=(P.Z-V->Terrain->Height(P.X,P.Y))/100;
      Check(TEXT("Hummer stage III suspension physically raises the body"),Height>StockRideHeight+.075f,Height-StockRideHeight);
      const float Expected=V->ExpectedRideHeight();
      Check(TEXT("Hummer lifted driving height matches garage target"),FMath::Abs(Height-Expected)<.065f,Height-Expected);
      UE_LOG(LogTemp,Display,TEXT("TERRA_RIDE stock=%.4f lifted=%.4f target=%.4f"),StockRideHeight,Height,Expected);
      for(int Part=0;Part<TerraSim::PartCount;++Part)V->SetUpgrade(Part,3,false);
      V->TeleportZone(1);Next(43);
    }
  } else if(Stage==43){
    if(StageTime>3&&!Captured){
      const auto P=V->GetActorLocation();const float Height=(P.Z-V->Terrain->Height(P.X,P.Y))/100;
      Check(TEXT("Hummer tire and lift combination retains intended driving height"),FMath::Abs(Height-V->ExpectedRideHeight())<.065f,Height-V->ExpectedRideHeight());
      V->SetGarage(true);V->SetGarageView(2);ModelView=0;Captured=true;
    }
    if(StageTime>3.45f&&Captured&&ModelView==0){Capture(TEXT("native-hummer-lifted.png"));ModelView=1;}
    if(StageTime>3.9f){
      ModelVehicle=0;ModelView=0;Next(44);
      V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarageView(1);
    }
  } else if(Stage==44){
    if(StageTime>.55f&&!Captured){
      if(ModelView==0){
        bool Paint=false,Trim=false;int Slots=0;
        for(int I=0;I<V->Body->GetNumMaterials();++I)if(auto *M=V->Body->GetMaterial(I)){
          const FString N=M->GetName();
          Paint|=N.Contains(TEXT("_paint_"));Trim|=N.Contains(TEXT("_plastic_"))||N.Contains(TEXT("_metal_"));
          Slots+=N.StartsWith(TEXT("MI_Vehicle_"))||N.StartsWith(TEXT("MI_Urus_"));
        }
        Check(FString::Printf(TEXT("vehicle %d cooked body uses acquired automotive paint and trim"),ModelVehicle),Paint&&Trim&&Slots>=3,Slots);
      }
      Capture(*FString::Printf(TEXT("native-model-%d-view-%d.png"),ModelVehicle,ModelView));Captured=true;
      const float Error=FMath::Abs(FMath::FindDeltaAngleDegrees(V->Camera->GetComponentRotation().Yaw,V->GetActorRotation().Yaw+V->GarageViewState().X));
      Check(FString::Printf(TEXT("vehicle %d garage view %d persists without camera reset"),ModelVehicle,ModelView),Error<1,Error);
    }
    if(StageTime>1.05f){
      if(++ModelView==4){ModelView=0;++ModelVehicle;}
      if(ModelVehicle==ATerraVehicle::VehicleCount){
        if(FParse::Param(FCommandLine::Get(),TEXT("TerraVisualOnly"))){Next(59);}
        else{GarageCameraBefore=V->GarageViewState();V->OrbitGarageCamera(92,-17);V->ZoomGarageCamera(2);Next(45);}
      }
      else{V->SelectVehicle(ModelVehicle);V->ResetUpgrades(false);V->SetGarageView((ModelView+1)%4);Next(44);}
    }
  } else if(Stage==45){
    if(StageTime>.6f){
      const auto State=V->GarageViewState();
      const float Error=FMath::Abs(FMath::FindDeltaAngleDegrees(V->Camera->GetComponentRotation().Yaw,V->GetActorRotation().Yaw+State.X));
      Check(TEXT("garage orbit changes the real camera and survives later ticks"),FMath::Abs(State.X-GarageCameraBefore.X)>50&&Error<1,Error);
      Check(TEXT("garage zoom changes the real camera boom"),State.Z<GarageCameraBefore.Z*.9f&&FMath::Abs(V->CameraArm->TargetArmLength-State.Z)<1,State.Z);
      Capture(TEXT("native-garage-orbit.png"));
      Next(46);
    }
  }
  else if(Stage==46&&StageTime>.8f){
    // Allow the queued orbit capture to finish before closing its garage.
    V->OrbitGarageCamera(0,10000);V->ZoomGarageCamera(1000);
    Check(TEXT("garage orbit pitch and near zoom remain bounded"),V->GarageViewState().Y<=12&&V->GarageViewState().Z>=300);
    V->OrbitGarageCamera(0,-20000);V->ZoomGarageCamera(-1000);
    Check(TEXT("garage lower pitch and far zoom remain bounded"),V->GarageViewState().Y>=-52&&V->GarageViewState().Z<=1800);
    V->SetGarage(false);V->TestDriverInput=false;V->TestThrottle=V->TestSteer=V->TestBrake=0;
    ModelVehicle=0;ModelView=0;V->SelectVehicle(0);V->ResetUpgrades(false);V->TeleportZone(1);Next(47);
  }else if(Stage==47){
    V->TestBrake=ModelView==1?1:0;V->Direction=ModelView==2?-1:1;
    if(StageTime>.7f&&!Captured){
      bool BrakeOK=!V->BrakeLamps.IsEmpty(),ReverseOK=!V->ReverseLamps.IsEmpty();
      for(auto Lamp:V->BrakeLamps)BrakeOK&=FMath::Abs(Lamp->K2_GetScalarParameterValue(TEXT("TerraLamp"))-(ModelView==1?5.f:0.f))<.001f;
      for(auto Lamp:V->ReverseLamps)ReverseOK&=FMath::Abs(Lamp->K2_GetScalarParameterValue(TEXT("TerraLamp"))-(ModelView==2?4.f:0.f))<.001f;
      Check(FString::Printf(TEXT("vehicle %d brake material state %d"),ModelVehicle,ModelView),BrakeOK);
      Check(FString::Printf(TEXT("vehicle %d reverse material state %d"),ModelVehicle,ModelView),ReverseOK);
      Capture(*FString::Printf(TEXT("native-lamps-%d-state-%d.png"),ModelVehicle,ModelView));Captured=true;
    }
    if(StageTime>1.05f){
      if(++ModelView==3){ModelView=0;++ModelVehicle;if(ModelVehicle<ATerraVehicle::VehicleCount){V->SelectVehicle(ModelVehicle);V->ResetUpgrades(false);V->TeleportZone(1);}}
      if(ModelVehicle==ATerraVehicle::VehicleCount){V->SelectVehicle(0);V->TeleportZone(1);V->Terrain->ResetSoil();Next(48);}else Next(47);
    }
  }else if(Stage==48){
    V->TestMarkCamera=true;
    if(auto *PC=Cast<APlayerController>(V->GetController()))if(auto *HUD=PC->GetHUD())HUD->bShowHUD=false;
    if(StageTime>.5f&&!Captured){
      auto *T=V->Terrain.Get();const FVector P=T->Spawns[1]-FVector(700,0,0);
      T->BreakTireMarks();const int Before=T->TireMarkCount();
      for(int I=0;I<20;++I)T->TireMark(0,P+FVector(I*10,0,0),FVector::ForwardVector,.285f,0,5,0,true,false,.025f);
      Check(TEXT("normally rolling pavement tires leave no rubber skidmarks"),T->TireMarkCount()==Before);
      for(int W=0;W<2;++W)for(int I=0;I<60;++I)T->TireMark(W,P+FVector(I*10,W?80:-80,0),FVector::ForwardVector,.285f,.9f,5,0,true,false,.025f);
      const int Added=T->TireMarkCount();Check(TEXT("pavement traction loss creates persistent skid geometry"),Added>Before+50,Added);
      for(int I=0;I<20;++I)T->TireMark(0,P+FVector(I*10,0,500),FVector::ForwardVector,.285f,2,5,0,false,false,.025f);
      Check(TEXT("airborne tires add no skidmarks"),T->TireMarkCount()==Added);
      T->BreakTireMarks();Captured=true;
    }
    if(StageTime>1.1f){
      Check(TEXT("tire marks remain rendered after contact ends"),V->Terrain->TireMarkMesh&&V->Terrain->TireMarkCount()>50);
      Capture(TEXT("native-pavement-skidmarks.png"));V->TestBrake=1;Next(49);
    }
  }else if(Stage==49&&StageTime>.5f){
    V->TeleportZone(3);V->Terrain->BreakTireMarks();Next(50);
  }else if(Stage==50){
    if(StageTime>.5f&&!Captured){
      auto *T=V->Terrain.Get();const FVector P=T->Spawns[3]-FVector(600,0,0);const int Before=T->SoftMarkCount;
      for(int W=0;W<2;++W)for(int I=0;I<60;++I){
        const FVector Q=P+FVector(I*10,W?80:-80,0);
        T->Deform(Q,FVector::ForwardVector,5500,24,.285f,.28f,.7f,2,.1f);
        T->TireMark(W,Q,FVector::ForwardVector,.285f,.7f,2,0,true,false,.025f);
      }
      Check(TEXT("soft ground uses physical grooves without rubber ribbons"),T->SoftMarkCount==Before&&T->Sample(P+FVector(300,80,0)).RutDepth>.025f,T->Sample(P+FVector(300,80,0)).RutDepth);
      const int Count=T->TireMarkCount();T->TireMark(0,P+FVector(4000,0,0),FVector::ForwardVector,.285f,1,3,0,true,false,.025f);
      Check(TEXT("teleports do not draw a tire ribbon across the world"),T->TireMarkCount()==Count);
      Captured=true;
    }
    if(StageTime>1.2f){Capture(TEXT("native-soft-tread-ruts.png"));Next(51);}
  }else if(Stage==51&&StageTime>.6f){
    V->Terrain->ResetSoil();Check(TEXT("soil repair clears tire marks and physical deformation"),V->Terrain->TireMarkCount()==0&&V->Terrain->DetailCount()==0);
    V->SelectVehicle(0);V->ResetUpgrades(false);V->Direction=1;SoilScenario=0;Next(52);
  }else if(Stage==52){
    if(!Captured){
      const int Zones[]={0,3,7,4,5,0};
      V->Terrain->ResetSoil();V->TeleportZone(Zones[SoilScenario]);V->TestDriverInput=false;
      if(SoilScenario==3){
        FVector Best=V->Terrain->Spawns[4];float Distance=FLT_MAX;
        for(int X=-18;X<=18;++X)for(int Y=-18;Y<=18;++Y){
          const FVector Q=V->Terrain->Spawns[4]+FVector(X*100,Y*100,0);const auto S=V->Terrain->Sample(Q);
          if(S.Surface==3&&S.Normal.Z>.9f&&X*X+Y*Y<Distance){Best=Q;Distance=X*X+Y*Y;}}
        Best.Z=V->Terrain->Height(Best.X,Best.Y)+V->ExpectedRideHeight()*100+12;
        V->SetActorLocation(Best,false,nullptr,ETeleportType::TeleportPhysics);
      }
      if(SoilScenario==5){
        FVector Best=V->Terrain->Spawns[0];float Distance=FLT_MAX;
        for(int X=-40;X<=40;++X)for(int Y=-40;Y<=40;++Y){
          const FVector Q=V->Terrain->Spawns[0]+FVector(X*150,Y*150,0);const auto S=V->Terrain->Sample(Q);
          if(S.Surface==0&&S.Softness>.60f&&S.Normal.Z>.94f&&X*X+Y*Y<Distance){Best=Q;Distance=X*X+Y*Y;}}
        Best.Z=V->Terrain->Height(Best.X,Best.Y)+V->ExpectedRideHeight()*100+12;
        V->SetActorLocation(Best,false,nullptr,ETeleportType::TeleportPhysics);
      }
      V->TestThrottle=0;V->TestBrake=1;V->TestSteer=0;V->Pressure=24;V->FourDrive=true;V->LowRange=true;
      V->FrontLocked=V->RearLocked=true;V->Direction=1;SoilProbes.Empty();Captured=true;
      if(auto *PC=Cast<APlayerController>(V->GetController()))PC->SetViewTarget(V);
    }
    if(StageTime>1){Start=V->GetActorLocation();V->TestBrake=0;V->TestThrottle=.65f;Next(53);}
  }else if(Stage==53){
    for(const auto &Wheel:V->WheelState)if(Wheel.ContactValid&&Wheel.Load>500&&SoilProbes.Num()<2400&&
        (SoilScenario!=5||(Wheel.Ground.Surface==0&&Wheel.Ground.Softness>.3f)))
      SoilProbes.Add(Wheel.Contact);
    if(StageTime>6||FVector::Dist2D(Start,V->GetActorLocation())>1400){
      V->TestThrottle=0;V->TestBrake=1;Next(54);
    }
  }else if(Stage==54){
    if(StageTime>.8f&&!Captured){
      auto *T=V->Terrain.Get();const FString Names[]={TEXT("hard dirt"),TEXT("mud"),TEXT("snow"),TEXT("wetland"),TEXT("sand"),TEXT("soft dirt")};
      float Deepest=0,Berm=0,Packed=0;FVector Best=Start;
      const FVector F=V->GetActorForwardVector(),Side(-F.Y,F.X,0);
      for(const auto &P:SoilProbes){const auto S=T->Sample(P);
        if(S.RutDepth>Deepest){Deepest=S.RutDepth;Best=P;}Packed=FMath::Max(Packed,S.Packing);
        for(float Offset:{-38.f,-28.f,28.f,38.f})Berm=FMath::Max(Berm,T->Sample(P+Side*Offset).Displacement);
      }
      Check(Names[SoilScenario]+TEXT(" actual driven pass leaves loaded terrain deformation"),Deepest>(SoilScenario==0?.001f:.025f),Deepest);
      Check(Names[SoilScenario]+TEXT(" actual driven pass compacts contact footprints"),Packed>.10f,Packed);
      if(SoilScenario>0)Check(Names[SoilScenario]+TEXT(" actual driven pass pushes up side berms"),Berm>.003f,Berm);
      Check(Names[SoilScenario]+TEXT(" cannot receive black rubber skid geometry"),T->TireMarkCount()==0,T->TireMarkCount());
      Check(Names[SoilScenario]+TEXT(" driven path advances beyond stationary footprint"),FVector::Dist2D(Start,V->GetActorLocation())>150,FVector::Dist2D(Start,V->GetActorLocation()));
      Check(Names[SoilScenario]+TEXT(" displaced and compacted volumes conserve excavated soil"),FMath::Abs(T->DepressedVolume-T->DisplacedVolume-T->CompactedVolume)<.00001,T->DisplacedVolume);
      // Inspect the trail from an oblique stationary camera after driving away.
      FVector Center=SoilScenario==5?Best:(Start+V->GetActorLocation())*.5;Center.Z=T->Height(Center.X,Center.Y);
      if(!SoilCamera)SoilCamera=GetWorld()->SpawnActor<ACameraActor>();
      const FVector Eye=Center-F*480-Side*430+FVector(0,0,320);
      SoilCamera->SetActorLocationAndRotation(Eye,(Center-Eye).Rotation());SoilCamera->GetCameraComponent()->SetFieldOfView(62);
      if(auto *PC=Cast<APlayerController>(V->GetController()))PC->SetViewTarget(SoilCamera);
      Captured=true;
    }
    if(StageTime>1.6f){
      const TCHAR *Names[]={TEXT("native-driven-dirt.png"),TEXT("native-driven-mud.png"),TEXT("native-driven-snow.png"),TEXT("native-driven-wetland.png"),TEXT("native-driven-sand.png"),TEXT("native-driven-soft-dirt.png")};
      Capture(Names[SoilScenario]);Next(55);
    }
  }else if(Stage==55&&StageTime>.4f){
    if(++SoilScenario<6)Next(52);else Next(56);
  }else if(Stage==56){
    if(!Captured){
      auto *T=V->Terrain.Get();T->ResetSoil();const FVector P=T->NearestCrushable(T->Spawns[0]);
      T->Deform(P,FVector::ForwardVector,5500,24,.32f,.22f,0,2,.05f);
      Check(TEXT("loaded tires flatten and bend actual grass plant instances"),T->CrushedPlantCount>0,T->CrushedPlantCount);
      const int Flattened=T->CrushedPlantCount;
      T->Deform(P,FVector::ForwardVector,0,24,.32f,.22f,0,2,.05f);
      Check(TEXT("unloaded tires cannot flatten additional plants"),T->CrushedPlantCount==Flattened);
      const FVector Eye=P-FVector(120,180,-100);
      SoilCamera->SetActorLocationAndRotation(Eye,(P-Eye).Rotation());
      Captured=true;
    }
    if(StageTime>.8f){Capture(TEXT("native-crushed-grass.png"));Next(57);}
  }else if(Stage==57&&StageTime>.4f){
    V->Terrain->ResetSoil();Check(TEXT("terrain repair restores crushed plants"),V->Terrain->CrushedPlantCount==0);
    Next(58);
  }else if(Stage==58){
    auto *T=V->Terrain.Get();T->ActiveTileLimit=8;T->ResetSoil();
    const FVector P=T->Spawns[7]+FVector(150,150,0);
    T->Deform(P,FVector::ForwardVector,5500,24,.32f,.22f,.3f,2,.1f);
    const float Original=T->Sample(P).RutDepth;
    for(int I=1;I<14;++I)T->Deform(P+FVector((I%4)*800,(I/4)*800,0),FVector::ForwardVector,5500,24,.32f,.22f,.3f,2,.1f);
    Check(TEXT("full soil render pool keeps producing new ruts"),T->DetailCount()<=8&&T->CachedSoilCount()>0&&T->Sample(P+FVector(800,2400,0)).RutDepth>.025f,T->CachedSoilCount());
    Check(TEXT("offscreen soil cache retains original groove depth"),Original>.025f&&FMath::Abs(T->Sample(P).RutDepth-Original)<.0001f,T->Sample(P).RutDepth);
    T->ActivateSoil(P,1);
    Check(TEXT("returning to a cached rut restores its detailed geometry"),T->DetailCount()<=8&&FMath::Abs(T->Sample(P).RutDepth-Original)<.0001f,T->DetailCount());
    T->ActiveTileLimit=768;T->ResetSoil();
    Check(TEXT("soil repair clears both rendered and cached deformation"),T->DetailCount()==0&&T->CachedSoilCount()==0);
    Next(59);
  }else if(Stage==59){
    V->SetGarage(false);V->TestThrottle=0;V->TestBrake=1;
    if(!SoilCamera)SoilCamera=GetWorld()->SpawnActor<ACameraActor>();
    auto *PC=UGameplayStatics::GetPlayerController(this,0);PC->SetViewTarget(SoilCamera);if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;
    const FVector Target(5800,22900,2472),Eye(5800,34900,2472);
    SoilCamera->GetCameraComponent()->SetFieldOfView(49);SoilCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
    if(StageTime>1&&!Captured){Capture(TEXT("native-round-loop.png"));Captured=true;}
    if(StageTime>1.5f)Next(60);
  }else if(Stage==60){
    const FVector Target(22900,-28300,V->Terrain->Data->GetNumberField(TEXT("quarryBaseM"))*100+300),Eye=Target+FVector(2200,3600,1800);
    SoilCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
    if(StageTime>1&&!Captured){Capture(TEXT("native-fab-slate-quarry.png"));Captured=true;}
    if(StageTime>1.5f){if(FParse::Param(FCommandLine::Get(),TEXT("TerraVisualOnly")))FinishValidation();else Next(61);}
  }else if(Stage==61){
    if(!Captured){
      V->SelectVehicle(5);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportRoute(8);
      V->TestDriverInput=false;V->TestThrottle=0;V->TestBrake=1;V->TestSteer=0;
      TrailClosestSample=0;TrailMaximumError=0;Captured=true;
      UE_LOG(LogTemp,Display,TEXT("TERRA_TRAIL_BODY mass=%.1f inertia=%s"),V->Chassis->GetMass(),*V->Chassis->GetInertiaTensor().ToString());
      if(auto *PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(V);if(PC->GetHUD())PC->GetHUD()->bShowHUD=true;}
      Check(TEXT("Slate Rim trail is available as the ninth native challenge"),V->Terrain->Routes.Num()==9&&V->Terrain->Routes[8].Gates.Num()==20);
      Check(TEXT("Urus body uses the new surface and cabin revision"),V->Terrain->Data->GetArrayField(TEXT("vehicles"))[5]->AsObject()->GetObjectField(TEXT("nativeModel"))->GetObjectField(TEXT("bodyShape"))->GetIntegerField(TEXT("version"))==7);
      int ScanRockHits=0,GrassCount=0;
      TArray<UInstancedStaticMeshComponent*> Components;V->Terrain->GetComponents(Components);
      for(auto *C:Components)if(C->GetStaticMesh()){
        const FString Name=C->GetStaticMesh()->GetName();
        if(Name.StartsWith(TEXT("scan_grass_medium_01")))GrassCount+=C->GetInstanceCount();
        if((Name.StartsWith(TEXT("scan_mountainside"))||Name.StartsWith(TEXT("scan_boulder_01")))&&C->GetInstanceCount()>0){
          FTransform T;C->GetInstanceTransform(0,T,true);const FVector P=T.TransformPosition(C->GetStaticMesh()->GetBoundingBox().GetCenter());
          FHitResult Hit;FCollisionQueryParams Q(SCENE_QUERY_STAT(TerraTrailRock),true,V);
          if(GetWorld()->LineTraceSingleByChannel(Hit,P+FVector(0,0,2000),P-FVector(0,0,2000),ECC_Visibility,Q)&&Hit.GetComponent()==C)++ScanRockHits;
        }
      }
      Check(TEXT("new scanned quarry rocks supply native collision"),ScanRockHits==2,ScanRockHits);
      Check(TEXT("varied meadow grass instances load along the quarry trail"),GrassCount>2000,GrassCount);
      bool GroundTextures=true;
      for(const TCHAR *Stem:{TEXT("dry_ground_rocks"),TEXT("rocks_ground_05")})for(const TCHAR *Map:{TEXT("diff"),TEXT("nor_gl"),TEXT("rough")})
        GroundTextures&=LoadObject<UTexture2D>(nullptr,*FString::Printf(TEXT("/Game/Textures/%s_%s_2k"),Stem,Map))!=nullptr;
      Check(TEXT("both new quarry ground sets are present in the cooked game"),GroundTextures);
    }
    if(StageTime>2){Check(TEXT("stock Urus settles upright at the trail entrance"),V->ContactCount>=2&&V->GetActorUpVector().Z>.8f,V->ContactCount);Start=V->GetActorLocation();V->TestBrake=0;Next(62);}
  }else if(Stage==62){
    if(int(StageTime)!=int(StageTime-Dt)){
      float Load=0,Rut=0,Slip=0;for(const auto &W:V->WheelState){Load+=W.Load;Rut=FMath::Max(Rut,W.RutDepth);Slip=FMath::Max(Slip,FMath::Abs(W.Slip));}
      UE_LOG(LogTemp,Display,TEXT("TERRA_TRAIL_PROGRESS t=%.1f gate=%d sample=%d speed=%.2f gear=%d rpm=%.0f load=%.0f wheels=%.0f/%.0f/%.0f/%.0f force=%.0f rut=%.3f slip=%.2f yaw=%.1f steer=%.2f throttle=%.2f brake=%.2f velocity=%s position=%s"),StageTime,V->GateIndex,TrailClosestSample,V->Speed,V->Gear,V->RPM,Load,V->WheelState[0].Load,V->WheelState[1].Load,V->WheelState[2].Load,V->WheelState[3].Load,V->LastTireForceN,Rut,Slip,V->GetActorRotation().Yaw,V->Steer,V->Throttle,V->Brake,*V->Chassis->GetPhysicsLinearVelocity().ToString(),*V->GetActorLocation().ToString());
    }
    const auto Samples=V->Terrain->Data->GetObjectField(TEXT("quarryTrail"))->GetArrayField(TEXT("samples"));
    const FVector P=V->GetActorLocation();float Best=FLT_MAX;int Closest=TrailClosestSample;
    auto Point=[&](int I){const auto S=Samples[I]->AsObject();return FVector(S->GetNumberField(TEXT("x"))*100,S->GetNumberField(TEXT("y"))*100,S->GetNumberField(TEXT("z"))*100);};
    for(int I=FMath::Max(0,TrailClosestSample-3);I<FMath::Min(Samples.Num(),TrailClosestSample+12);++I){const float D=FVector::DistSquared2D(P,Point(I));if(D<Best){Best=D;Closest=I;}}
    TrailClosestSample=FMath::Max(TrailClosestSample,Closest);TrailMaximumError=FMath::Max(TrailMaximumError,FMath::Sqrt(Best));
    FVector Target=Point(FMath::Min(Closest+3,Samples.Num()-1));
    if(Closest>=Samples.Num()-4){const auto S=Samples.Last()->AsObject();Target+=FVector(S->GetNumberField(TEXT("tx")),S->GetNumberField(TEXT("ty")),0)*1000;}
    const float Error=FMath::FindDeltaAngleDegrees(V->GetActorRotation().Yaw,(Target-P).Rotation().Yaw);
    // Pure pursuit expresses the required curvature as a front wheel angle;
    // a heading-only gain overcorrects when climbing uneven soft shoulders.
    const float Lookahead=FMath::Max(3.f,FVector::Dist2D(Target,P)/100);
    const float Wheelbase=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[5]->AsObject()->GetNumberField(TEXT("wheelbase"));
    const float WheelAngle=FMath::Atan2(2*Wheelbase*FMath::Sin(FMath::DegreesToRadians(Error)),Lookahead);
    V->TestSteer=FMath::Clamp(WheelAngle/FMath::DegreesToRadians(34)*(1+FMath::Abs(V->Speed)*.025f),-.75f,.75f);
    const float Desired=FMath::Abs(Error)>25?2.6f:4.0f;
    V->TestThrottle=FMath::Clamp((Desired-V->Speed)*.18f,.02f,.55f);V->TestBrake=V->Speed>Desired+.6f?.32f:0;
    if(StageTime>12&&!Captured){Capture(TEXT("native-urus-quarry-driving.png"));Captured=true;}
    if(V->GateIndex==20||StageTime>165||V->Overturned){
      Check(TEXT("stock Urus drives the entire Slate Rim trail through every gate"),V->GateIndex==20,V->GateIndex);
      Check(TEXT("Urus quarry drive stays upright with a controlled trail line"),V->GetActorUpVector().Z>.7f&&TrailMaximumError<450,TrailMaximumError);
      Check(TEXT("native quarry drive covers more than 700 feet without teleporting"),V->RouteTime>25&&TrailClosestSample>115,TrailClosestSample);
      V->TestThrottle=0;V->TestSteer=0;V->TestBrake=1;Next(63);
    }
  }else if(Stage==63){
    if(!SoilCamera)SoilCamera=GetWorld()->SpawnActor<ACameraActor>();
    if(auto *PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(SoilCamera);if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}
    const auto S=V->Terrain->Data->GetObjectField(TEXT("quarryTrail"))->GetArrayField(TEXT("samples"))[40]->AsObject();
    const FVector Target(S->GetNumberField(TEXT("x"))*100,S->GetNumberField(TEXT("y"))*100,S->GetNumberField(TEXT("z"))*100+180),Eye=Target+FVector(-2500,2200,1000);
    SoilCamera->GetCameraComponent()->SetFieldOfView(58);SoilCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
    if(StageTime>1&&!Captured){Capture(TEXT("native-slate-rim-trail.png"));Captured=true;}
    if(StageTime>1.6f)Next(64);
  }else if(Stage==64){
    if(!Captured){
      const bool AllModels=FParse::Param(FCommandLine::Get(),TEXT("TerraModelHeroOnly"));
      const int PhotoVehicle=AllModels?ModelVehicle:5;
      V->SelectVehicle(PhotoVehicle);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);
      V->TestDriverInput=false;V->TestThrottle=0;V->TestBrake=1;V->TestSteer=0;
      int AutomotiveSlots=0;bool HasPaint=false,HasCarbon=false;
      const FString Style=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[PhotoVehicle]->AsObject()->GetStringField(TEXT("bodyStyle"));
      const FString Prefix=PhotoVehicle==5?TEXT("MI_Urus_"):FString::Printf(TEXT("MI_Vehicle_%s_"),*Style);
      for(int I=0;I<V->Body->GetNumMaterials();++I)if(auto *M=V->Body->GetMaterial(I)){
        const FString Name=M->GetName();AutomotiveSlots+=Name.StartsWith(Prefix);
        HasPaint|=Name.StartsWith(Prefix+TEXT("paint_"));HasCarbon|=Name.StartsWith(Prefix+TEXT("carbon_"));
      }
      Check(FString::Printf(TEXT("Vehicle %d cooked body uses Epic automotive paint and trim"),PhotoVehicle),HasPaint&&(PhotoVehicle!=5||HasCarbon)&&AutomotiveSlots>=6,AutomotiveSlots);
      if(!SoilCamera)SoilCamera=GetWorld()->SpawnActor<ACameraActor>();
      if(auto *PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(SoilCamera);if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}
      Captured=true;
    }
    if(StageTime>5){ModelView=0;Next(65);}
  }else if(Stage==65){
    const bool AllModels=FParse::Param(FCommandLine::Get(),TEXT("TerraModelHeroOnly"));
    const FVector Target=V->GetActorLocation()+FVector(0,0,18),F=V->GetActorForwardVector(),S=V->GetActorRightVector();
    const FVector Offsets[]={F*850+FVector(0,0,160),S*900+FVector(0,0,90),-F*850+FVector(0,0,150),F*650+S*560+FVector(0,0,280),-F*680+S*570+FVector(0,0,230),F*690-S*550+FVector(0,0,100)};
    const float PhotoScale=AllModels?FMath::Clamp(float(V->Terrain->Data->GetArrayField(TEXT("vehicles"))[ModelVehicle]->AsObject()->GetNumberField(TEXT("length"))/5.137),.86f,1.18f):1.f;
    const FVector Eye=Target+Offsets[ModelView]*PhotoScale;SoilCamera->GetCameraComponent()->SetFieldOfView(40);
    SoilCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
    if(StageTime>2&&!Captured){
      Check(FString::Printf(TEXT("Vehicle %d body renders in close photo view %d"),AllModels?ModelVehicle:5,ModelView),V->Body->WasRecentlyRendered(.4f));
      const FString Name=AllModels?FString::Printf(TEXT("native-vehicle-%d-hero-%d.png"),ModelVehicle,ModelView):FString::Printf(TEXT("native-urus-hero-%d.png"),ModelView);
      Capture(*Name);Captured=true;
    }
    if(StageTime>2.5f){
      if(++ModelView==6){
        if(AllModels){if(++ModelVehicle==6)FinishValidation();else Next(64);}
        else if(FParse::Param(FCommandLine::Get(),TEXT("TerraHeroOnly"))||FParse::Param(FCommandLine::Get(),TEXT("TerraTrailOnly")))FinishValidation();else Next(66);
      }else Next(65);
    }
  }else if(Stage==66){
    // Query the actual cooked rock course, including compressed and banked
    // tire poses. A mesh-load or spawn check cannot catch missing wheel support.
    int Missing=0,Tested=0;
    for(float X=12800;X<=14600;X+=50)for(float Y:{-28180.f,-28100.f,-28020.f}){
      FHitResult H;FCollisionQueryParams Q(SCENE_QUERY_STAT(TerraGroundRegression),true,V);
      if(!GetWorld()->LineTraceSingleByChannel(H,FVector(X,Y,7000),FVector(X,Y,0),ECC_Visibility,Q)||!H.GetComponent()->ComponentHasTag(TEXT("TerraConstructed")))continue;
      for(float Roll:{-18.f,0.f,18.f})for(float D:{-20.f,15.f,45.f}){
        const FVector U=FRotator(0,0,Roll).RotateVector(FVector::UpVector);
        const FVector Mount=H.ImpactPoint+H.ImpactNormal*44.21f+U*D;
        const auto S=V->Terrain->CastTireSupport(Mount,U,FVector::ForwardVector,44.21f,32.5f,-30,67,V);
        ++Tested;if(!S.Hit||!S.Constructed){++Missing;if(Missing<=12)UE_LOG(LogTemp,Display,TEXT("TERRA_MISSING_SUPPORT point=%s roll=%.0f distance=%.0f hit=%d constructed=%d"),*H.ImpactPoint.ToString(),Roll,D,S.Hit,S.Constructed);}
      }
    }
    Check(TEXT("Axlebreaker cooked rock supports banked and compressed tires"),Tested>900&&Missing==0,Missing);
    ModelVehicle=0;Next(67);
  }else if(Stage==69){
    if(!Captured){
      V->SelectVehicle(5);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportRoute(8);
      V->TestThrottle=V->TestSteer=0;V->TestBrake=1;Captured=true;return;
    }
    if(StageTime<3)return;
    V->SetActorTickEnabled(false);V->Chassis->SetSimulatePhysics(false);
    SoilCamera=GetWorld()->SpawnActor<ACameraActor>();SoilCamera->GetCameraComponent()->SetFieldOfView(64);
    auto *PC=GetWorld()->GetFirstPlayerController();PC->SetViewTarget(SoilCamera);if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;
    TArray<UInstancedStaticMeshComponent*> Components;V->Terrain->GetComponents(Components);
    for(auto *C:Components)if(C->ComponentHasTag(TEXT("TerraFabScenery"))&&C->GetStaticMesh()&&C->GetInstanceCount()>0){
      const FString Name=C->GetStaticMesh()->GetName();
      if(Name.StartsWith(TEXT("MW_"))){Check(Name+TEXT(" avoids distant grass shadow passes"),!C->CastShadow&&C->InstanceEndCullDistance==8000);continue;}
      if(C->GetCollisionEnabled()==ECollisionEnabled::NoCollision)continue;
      if(Name.Contains(TEXT("Ice")))continue;
      bool Opaque=true,TwoSided=true;
      for(int Slot=0;Slot<C->GetNumMaterials();++Slot){auto *M=C->GetMaterial(Slot);Opaque&=M&&M->GetBlendMode()==BLEND_Opaque;TwoSided&=M&&M->IsTwoSided();}
      Check(Name+TEXT(" rock is opaque and renders backfaces"),Opaque&&TwoSided);
      RockViews.Add(C);
    }
    Check(TEXT("all eleven acquired non-ice rock groups inspected"),RockViews.Num()==11,RockViews.Num());
    if(FParse::Param(FCommandLine::Get(),TEXT("TerraPerfOnly"))){
      // Reproducible quarry overlook. Warm shaders/streaming before sampling.
      const FVector P=V->GetActorLocation()+FVector(-750,-950,700);
      SoilCamera->SetActorLocationAndRotation(P,(V->GetActorLocation()+FVector(1000,0,70)-P).Rotation());
      ModelView=0;Next(72);
    }else{
      const int Original=TerraGraphics::Preset();
      const FString Path=FPaths::ProjectSavedDir()/TEXT("Validation/render-graphics-test.json");
      for(int I=0;I<3;++I){TerraGraphics::Select(I,false);
        const float Scale=IConsoleManager::Get().FindConsoleVariable(TEXT("r.ScreenPercentage"))->GetFloat();
        Check(FString::Printf(TEXT("graphics preset %d applies resolution and bounded frame limit"),I),FMath::IsNearlyEqual(Scale,I==0?75.f:I==1?85.f:100.f)&&TerraGraphics::FrameLimit(false,false)<=60,Scale);
        Check(FString::Printf(TEXT("graphics preset %d saves and reloads independently"),I),TerraGraphics::Save(Path)&&TerraGraphics::Load(Path)&&TerraGraphics::Preset()==I);
      }
      FFileHelper::SaveStringToFile(TEXT("{\"version\":1,\"preset\":200}"),*Path);
      Check(TEXT("invalid graphics save preserves selected preset"),!TerraGraphics::Load(Path)&&TerraGraphics::Preset()==2);
      Check(TEXT("background and garage have lower frame caps"),TerraGraphics::FrameLimit(true,false)<=20&&TerraGraphics::FrameLimit(false,true)<=15);
      TerraGraphics::Tick(false,true);
      Check(TEXT("background cap reaches the engine frame limiter"),IConsoleManager::Get().FindConsoleVariable(TEXT("t.MaxFPS"))->GetFloat()<=15);
      TerraGraphics::Tick(true,false);
      Check(TEXT("garage cap reaches the engine frame limiter"),IConsoleManager::Get().FindConsoleVariable(TEXT("t.MaxFPS"))->GetFloat()<=20);
      TerraGraphics::Select(Original,false);ModelVehicle=ModelView=0;Next(70);
    }
  }else if(Stage==70){
    if(!RockViews.IsValidIndex(ModelVehicle)){V->SetActorTickEnabled(true);V->SetGarage(true);Next(73);return;}
    auto *C=RockViews[ModelVehicle].Get();FTransform T;C->GetInstanceTransform(0,T,true);
    const FBox Box=C->GetStaticMesh()->GetBoundingBox();
    const FVector Target=T.TransformPosition(Box.GetCenter());
    const float Radius=FMath::Max(100.f,float((Box.GetExtent()*T.GetScale3D()).Size()));
    const float Angle=ModelView*PI*.5f+.37f;
    FVector Eye=Target+FVector(FMath::Cos(Angle),FMath::Sin(Angle),.25f)*Radius*2.5f;
    Eye.Z=FMath::Max(Eye.Z,V->Terrain->Sample(Eye).Height+100.f);
    SoilCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());Next(71);
  }else if(Stage==71&&StageTime>1.2f){
    auto *C=RockViews[ModelVehicle].Get();
    const FString Filename=FString::Printf(TEXT("native-rock-%s-view-%d.png"),*C->GetStaticMesh()->GetName(),ModelView);
    Capture(*Filename);Check(Filename+TEXT(" rendered"),C->IsVisible());
    if(++ModelView==4){ModelView=0;++ModelVehicle;}Next(70);
  }else if(Stage==72){
    if(StageTime>10){
      if(!RenderFrames){RenderSampleStart=FPlatformTime::Seconds();UE_LOG(LogTemp,Display,TEXT("TERRA_GPU_SAMPLE_BEGIN mode=%d"),TerraGraphics::Preset());}
      ++RenderFrames;RenderSampleSeconds=FPlatformTime::Seconds()-RenderSampleStart;
    }
    if(StageTime>35){
      const double FPS=(RenderFrames-1)/FMath::Max(.001,RenderSampleSeconds);
      const float Cap=TerraGraphics::FrameLimit(false,false);
      Check(TEXT("measured native frame rate respects preset cap"),FPS<=Cap*1.08f,FPS);
      UE_LOG(LogTemp,Display,TEXT("TERRA_GPU_SAMPLE_END mode=%d frames=%d seconds=%.3f fps=%.2f cap=%.0f"),TerraGraphics::Preset(),RenderFrames,RenderSampleSeconds,FPS,Cap);
      Capture(*FString::Printf(TEXT("native-gpu-preset-%d.png"),TerraGraphics::Preset()));Next(74);
    }
  }else if(Stage==73&&StageTime>2){
    if(auto *PC=GetWorld()->GetFirstPlayerController())PC->SetViewTarget(V);
    Capture(TEXT("native-graphics-menu.png"));Next(74);
  }else if(Stage==74&&StageTime>.5f){FinishValidation();}
  else if(Stage==80){
    Check(TEXT("cooked ground coverage and blended material are loaded"),V->Terrain->HasSurfaceBlend());
    bool Textures=true;
    for(const TCHAR *Name:{TEXT("TerrainBlendA"),TEXT("TerrainBlendB")}){
      auto *T=LoadObject<UTexture2D>(nullptr,*FString::Printf(TEXT("/Game/Textures/%s"),Name));
      Textures&=T&&T->GetSizeX()==1601&&T->GetSizeY()==1601;
    }
    Check(TEXT("both linear coverage textures retain the native grid resolution"),Textures);
    const auto Data=V->Terrain->TransitionData;
    const bool Fixtures=Data.IsValid()&&Data->GetArrayField(TEXT("fixtures")).Num()==7;
    Check(TEXT("all seven terrain boundary fixtures are available"),Fixtures);
    TArray<UProceduralMeshComponent*> Ground;V->Terrain->GetComponents(Ground);int Sections=0;bool Unified=true;
    for(auto *C:Ground)if(C->ComponentHasTag(TEXT("TerraGround")))for(int S=0;S<C->GetNumSections();++S){
      auto *Section=C->GetProcMeshSection(S);if(!Section||Section->ProcIndexBuffer.Num()==0)continue;
      ++Sections;auto *M=C->GetMaterial(S);Unified&=M&&M->GetName()==TEXT("Terrain_GroundBlend");
    }
    Check(TEXT("coarse and detailed ground sections share the coverage material"),Unified&&Sections>0,Sections);
    if(!Fixtures){FinishValidation();return;}
    for(const auto &Item:Data->GetArrayField(TEXT("fixtures"))){
      const auto F=Item->AsObject();const auto P=F->GetArrayField(TEXT("p")),N=F->GetArrayField(TEXT("normal")),Pair=F->GetArrayField(TEXT("pair"));
      const FVector2D Center(P[0]->AsNumber(),P[1]->AsNumber()),Normal(N[0]->AsNumber(),N[1]->AsNumber());
      const int A=Pair[0]->AsNumber(),B=Pair[1]->AsNumber();const float Half=F->GetNumberField(TEXT("halfWidthM"))*100;
      bool Valid=true,Rigid=true;int Mixed=0;float Jump=0,MuJump=0,RollJump=0;FTerraSurfaceBlend Previous;FTerraSample PreviousSample;
      for(int I=0;I<=160;++I){const FVector2D Q=Center+Normal*FMath::Lerp(-2*Half,2*Half,I/160.f);
        const auto W=V->Terrain->SurfaceBlend(Q.X,Q.Y);const auto S=V->Terrain->Sample(FVector(Q.X,Q.Y,0));float Sum=0;
        for(int K=0;K<7;++K){Sum+=W.Weight[K];Valid&=FMath::IsFinite(W.Weight[K])&&W.Weight[K]>=0&&W.Weight[K]<=1;
          if(I)Jump=FMath::Max(Jump,FMath::Abs(W.Weight[K]-Previous.Weight[K]));}
        Valid&=FMath::Abs(Sum-1)<.001f&&FMath::IsFinite(S.Mu)&&FMath::IsFinite(S.Rolling);
        if(W.Weight[A]>.05f&&W.Weight[B]>.05f)++Mixed;
        if(S.Surface==1||S.Surface==4)Rigid&=S.Softness==0&&S.MaxSink==0;
        if(I){MuJump=FMath::Max(MuJump,FMath::Abs(S.Mu-PreviousSample.Mu));RollJump=FMath::Max(RollJump,FMath::Abs(S.Rolling-PreviousSample.Rolling));}
        Previous=W;PreviousSample=S;
      }
      const FString Name=F->GetStringField(TEXT("name"));
      Check(Name+TEXT(" weights remain finite and normalized"),Valid);
      Check(Name+TEXT(" contains a mixed fringe"),Mixed>3,Mixed);
      Check(Name+TEXT(" coverage changes gradually across the border"),Jump<.3f,Jump);
      Check(Name+TEXT(" grip and rolling resistance change gradually"),MuJump<.15f&&RollJump<.05f,MuJump);
      Check(Name+TEXT(" keeps any rock and pavement substrate rigid"),Rigid);
    }
    V->SetGarage(false);V->TeleportZone(1);V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    V->SetActorTickEnabled(false);V->Chassis->SetSimulatePhysics(false);
    SoilCamera=GetWorld()->SpawnActor<ACameraActor>();SoilCamera->GetCameraComponent()->SetFieldOfView(62);
    auto *PC=GetWorld()->GetFirstPlayerController();PC->SetViewTarget(SoilCamera);if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;
    ModelVehicle=ModelView=0;Next(81);
  }else if(Stage==81){
    const auto F=V->Terrain->TransitionData->GetArrayField(TEXT("fixtures"))[ModelVehicle]->AsObject();
    const auto P=F->GetArrayField(TEXT("p")),N=F->GetArrayField(TEXT("normal"));
    const FVector Normal(N[0]->AsNumber(),N[1]->AsNumber(),0),Tangent(-Normal.Y,Normal.X,0);
    const FVector Target(P[0]->AsNumber(),P[1]->AsNumber(),V->Terrain->Height(P[0]->AsNumber(),P[1]->AsNumber())+15);
    const float Scale=FMath::Clamp(float(F->GetNumberField(TEXT("halfWidthM")))/3.f,1.f,2.f);
    FVector Eye=Target-Normal*(ModelView?1000.f:1800.f)*Scale+Tangent*500.f*Scale+FVector(0,0,ModelView?380.f:1700.f)*Scale;
    Eye.Z=FMath::Max(Eye.Z,V->Terrain->Height(Eye.X,Eye.Y)+180.f);
    SoilCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());Next(82);
  }else if(Stage==82&&StageTime>2){
    const auto F=V->Terrain->TransitionData->GetArrayField(TEXT("fixtures"))[ModelVehicle]->AsObject();
    const FString Name=FString::Printf(TEXT("native-transition-%s-view-%d.png"),*F->GetStringField(TEXT("name")),ModelView);
    Capture(*Name);Check(Name+TEXT(" camera remains above the ground"),SoilCamera->GetActorLocation().Z>V->Terrain->Height(SoilCamera->GetActorLocation().X,SoilCamera->GetActorLocation().Y)+100);
    if(++ModelView==2){ModelView=0;++ModelVehicle;}Next(ModelVehicle==7?83:81);
  }else if(Stage==83&&StageTime>.5f){FinishValidation();}
  else if(Stage==84){
    for(const TCHAR *Name:{TEXT("Ground_T_CleanSnow_BC"),TEXT("Ground_T_CleanSnow_N"),TEXT("Ground_T_Road_Extra_BC"),TEXT("Ground_TEX_MWAM_Grass_col"),TEXT("Ground_TEX_MWAM_Grass_nrm")}){
      auto *Texture=LoadObject<UTexture2D>(nullptr,*FString::Printf(TEXT("/Game/Textures/%s"),Name));
      const int SourceWidth=FString(Name)==TEXT("Ground_T_Road_Extra_BC")?512:2048;
      Check(FString(Name)+TEXT(" retains the acquired ground scan resolution"),Texture&&Texture->GetSizeX()>=SourceWidth,Texture?Texture->GetSizeX():0);
      if(Texture)UE_LOG(LogTemp,Display,TEXT("TERRA_GROUND_MIPS %s resident=%d total=%d"),Name,Texture->GetNumResidentMips(),Texture->GetNumMips());
    }
    float MinDrift=FLT_MAX,MaxDrift=0;bool Finite=true;
    for(int X=21000;X<=28500;X+=150)for(int Y=17500;Y<=27000;Y+=150){
      const float D=V->Terrain->SnowDrift(X,Y);MinDrift=FMath::Min(MinDrift,D);MaxDrift=FMath::Max(MaxDrift,D);
      const auto S=V->Terrain->Sample(FVector(X,Y,0));Finite&=FMath::IsFinite(S.Height)&&S.Normal.Z>.25f;
    }
    Check(TEXT("snow drifts have physical height variation"),MaxDrift-MinDrift>20,MaxDrift-MinDrift);
    Check(TEXT("wind relief retains finite driveable terrain"),Finite);
    int Banks=0,Grass=0;
    TArray<UInstancedStaticMeshComponent*> Instances;V->Terrain->GetComponents(Instances);
    for(auto *C:Instances)if(C->GetStaticMesh()){
      const FString Name=C->GetStaticMesh()->GetName();
      if(Name.StartsWith(TEXT("Snow_Chunk")))Banks+=C->GetInstanceCount();
      if(Name.StartsWith(TEXT("MW_Grass")))Grass+=C->GetInstanceCount();
    }
    Check(TEXT("Winter Scene snowbanks populate the native basin"),Banks>=30,Banks);
    Check(TEXT("textured MW meadow clumps increase local coverage"),Grass>=1000,Grass);
    V->SetGarage(false);V->TestThrottle=0;V->TestBrake=1;V->SetActorTickEnabled(false);V->Chassis->SetSimulatePhysics(false);
    V->SetActorLocation(FVector(-19000,10000,200),false,nullptr,ETeleportType::TeleportPhysics);
    SoilCamera=GetWorld()->SpawnActor<ACameraActor>();SoilCamera->GetCameraComponent()->SetFieldOfView(58);
    auto *PC=GetWorld()->GetFirstPlayerController();PC->SetViewTarget(SoilCamera);if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;
    ModelView=0;Next(85);
  }else if(Stage==85){
    const FVector2D Spots[]={{24400,19100},{24400,19100},{24800,15925},{24400,16300},{-4600,-1800},{-4600,-1800}};
    const auto P=Spots[ModelView];const FVector Target(P.X,P.Y,V->Terrain->Height(P.X,P.Y)+8);
    const bool Close=ModelView==1||ModelView==5;
    FVector Eye=Target+(Close?FVector(-320,-420,135):FVector(-1350,-2100,760));
    Eye.Z=FMath::Max(Eye.Z,V->Terrain->Height(Eye.X,Eye.Y)+(Close?100.f:500.f));
    SoilCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());Next(86);
  }else if(Stage==86&&StageTime>2){
    if(ModelView==1||ModelView==5){
      for(const TCHAR *Name:{TEXT("Ground_T_CleanSnow_N"),TEXT("Ground_TEX_MWAM_Grass_col")}){
        if(auto *Texture=LoadObject<UTexture2D>(nullptr,*FString::Printf(TEXT("/Game/Textures/%s"),Name)))
          UE_LOG(LogTemp,Display,TEXT("TERRA_CAPTURE_MIPS view=%d %s resident=%d total=%d"),ModelView,Name,Texture->GetNumResidentMips(),Texture->GetNumMips());
      }
    }
    const TCHAR *Names[]={TEXT("snow-drifts-wide"),TEXT("snow-scan-close"),TEXT("snow-slush-edge"),TEXT("snowbanks"),TEXT("meadow-wide"),TEXT("meadow-close")};
    Capture(*FString::Printf(TEXT("native-detail-%s.png"),Names[ModelView]));
    Check(FString(Names[ModelView])+TEXT(" camera above surface"),SoilCamera->GetActorLocation().Z>V->Terrain->Height(SoilCamera->GetActorLocation().X,SoilCamera->GetActorLocation().Y)+75);
    if(++ModelView==6)Next(87);else Next(85);
  }else if(Stage==87&&StageTime>.5f){FinishValidation();}
  else if(Stage==67){
    V->SelectVehicle(ModelVehicle);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportRoute(4);
    if(auto *PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(V);if(PC->GetHUD())PC->GetHUD()->bShowHUD=true;}
    V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    const FVector Floor=V->Terrain->Routes[4].Spawn+FVector(400,0,0);
    V->SetActorLocationAndRotation(Floor+FVector(0,0,V->ExpectedRideHeight()*100-24),FRotator(0,0,18),false,nullptr,ETeleportType::TeleportPhysics);
    Start=Floor;Next(68);
  }else if(Stage==68){
    if(StageTime>3&&!Captured){
      float Buried=0;int Solid=0;
      for(const auto &W:V->WheelState){
        FHitResult H;FCollisionQueryParams Q(SCENE_QUERY_STAT(TerraWheelBurial),true,V);
        if(GetWorld()->LineTraceSingleByChannel(H,W.Center+FVector(0,0,150),W.Center-FVector(0,0,180),ECC_Visibility,Q)){
          const float TireRadius=V->TireDiameter()*2.54f*.5f;
          Buried=FMath::Max(Buried,float(H.ImpactPoint.Z-(W.Center.Z-TireRadius)));
        }
        if(W.ContactValid&&W.Constructed&&W.Load>50)++Solid;
        UE_LOG(LogTemp,Display,TEXT("TERRA_GROUND vehicle=%d center=%s distance=%.3f load=%.0f valid=%d solid=%d"),ModelVehicle,*W.Center.ToString(),W.Distance,W.Load,W.ContactValid,W.Constructed);
      }
      Check(FString::Printf(TEXT("vehicle %d regains solid support after banked compression"),ModelVehicle),Solid>=3&&V->GetActorUpVector().Z>.9f,Solid);
      Check(FString::Printf(TEXT("vehicle %d tires stay above the hard quarry floor"),ModelVehicle),Buried<7,Buried);
      Capture(*FString::Printf(TEXT("native-ground-contact-%d.png"),ModelVehicle));Captured=true;
      V->TestBrake=0;V->TestThrottle=.5f;V->Direction=-1;Start=V->GetActorLocation();
    }
    if(StageTime>7){
      Check(FString::Printf(TEXT("vehicle %d can reverse out of the quarry compression"),ModelVehicle),V->GetActorLocation().X<Start.X-150, (Start.X-V->GetActorLocation().X)/100);
      if(++ModelVehicle<ATerraVehicle::VehicleCount)Next(67);else FinishValidation();
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
