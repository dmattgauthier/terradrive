#include "TerraWinterValidation.h"
#include "TerraWinter.h"
#include "TerraVehicle.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/LevelStreaming.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"

namespace {
struct FCase { FString Name;bool Pass;float Value; };
TArray<FCase> Cases;
int Stage=0,Zone=0;
float Time=0,Total=0,Peak=0;
FVector WinterTrialStart;
TWeakObjectPtr<ACameraActor> Overview;
const int Cars[]={0,5,4,2};
const TCHAR *Shots[]={TEXT("native-winter-north.png"),TEXT("native-winter-coast.png"),
    TEXT("native-winter-quarry.png"),TEXT("native-winter-south.png")};
void Add(const FString &Name,bool Pass,float Value=0) {
  Cases.Add({Name,Pass,Value});
  UE_LOG(LogTemp,Display,TEXT("TERRA_WINTER_TEST %s pass=%d value=%.4f"),*Name,Pass,Value);
}
void Next(int NewStage) { Stage=NewStage;Time=0;Peak=0; }
void Place(ATerraVehicle *V) {
  V->SelectVehicle(Cars[Zone]);V->ResetUpgrades(false);V->SetGarage(false);
  V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
  V->TeleportZone(Zone);Next(2);
}
}
bool TerraWinterValidation::Tick(ATerraVehicle *V,float Dt,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture) {
  if(!V||!V->Initialized||!V->Terrain||!V->Terrain->Ready)return false;
  Total+=Dt;Time+=Dt;
  if(Total>180&&Stage!=99) {Add(TEXT("complete winter expedition validation timeout"),false,Total);Next(99);}
  auto *World=V->GetWorld();
  if(Stage==0) {
    if(TerraWinter::IsActive(World)) {Next(1);}
    else {
      V->SelectVehicle(5);V->ResetUpgrades(false);V->SetUpgrade(TerraSim::Engine,1,false);
      V->Pressure=29;V->SetTracks(false);
      Add(TEXT("winter travel starts from native proving ground"),V->Terrain->Spawns.Num()==9,V->Terrain->Spawns.Num());
      Next(1);TerraWinter::Travel(V);return false;
    }
  }
  if(Stage==1&&TerraWinter::IsActive(World)&&Time>1) {
    Add(TEXT("whole winter destination loads after OpenLevel"),true);
    Add(TEXT("winter destination retains selected Urus and engine upgrade"),V->VehicleIndex==5&&V->UpgradeStage(TerraSim::Engine)==1,V->VehicleIndex);
    Add(TEXT("winter destination retains tire pressure"),FMath::Abs(V->Pressure-29)<.01f,V->Pressure);
    const auto *WinterPC=Cast<APlayerController>(V->GetController());
    Add(TEXT("winter destination camera belongs to native vehicle"),WinterPC&&WinterPC->GetViewTarget()==V);
    int Landscapes=0,Meshes=0,Cameras=0,Foliage=0;
    for(TActorIterator<AActor> It(World);It;++It) {
      const FString Name=It->GetClass()->GetName();
      Landscapes+=Name==TEXT("Landscape");Meshes+=Name==TEXT("StaticMeshActor");Cameras+=Name==TEXT("CineCameraActor");
      if(Name==TEXT("InstancedFoliageActor")) {
        TInlineComponentArray<UInstancedStaticMeshComponent*> Components(*It);
        for(auto *Component:Components)Foliage+=Component->GetInstanceCount();
      }
    }
    Add(TEXT("whole winter authored landscape retained"),Landscapes==1,Landscapes);
    Add(TEXT("whole winter 460 authored static mesh actors retained"),Meshes>=460,Meshes);
    Add(TEXT("whole winter 18 authored cinematic viewpoints retained"),Cameras==18,Cameras);
    Add(TEXT("whole winter 10646 foliage and snow clumps retained"),Foliage==10646,Foliage);
    bool Lighting=false;
    for(auto *Streaming:World->GetStreamingLevels())
      if(Streaming&&Streaming->GetWorldAssetPackageName().Contains(TEXT("IceRoad_Lighting")))
        Lighting=Streaming->IsLevelLoaded()&&Streaming->IsLevelVisible();
    Add(TEXT("whole winter authored lighting sublevel loaded and visible"),Lighting);
    Add(TEXT("whole winter four authored road starts"),V->Terrain->Spawns.Num()==4,V->Terrain->Spawns.Num());
    Add(TEXT("whole winter original proving ground mesh absent"),V->Terrain->ConstructedMeshCount==0&&V->Terrain->DetailCount()==0);
    Add(TEXT("whole winter authored road route available"),V->Terrain->Routes.Num()==1&&!V->Terrain->Routes[0].Gates.IsEmpty(),V->Terrain->Routes.Num()==1?V->Terrain->Routes[0].Gates.Num():0);
    int RoadJoinProbes=0,RoadJoinMissing=0;
    if(V->Terrain->Routes.Num()==1) {
      const auto &Road=V->Terrain->Routes[0];const auto &Gates=Road.Gates;
      // Gates[0] is already the first segment's internal endpoint; the
      // source's open start was omitted by the importer. Exclude only the
      // final open end. Landscape under a missing road must not pass.
      for(int I=0;I+1<Gates.Num();++I) {
        const FVector Point=Gates[I];
        const FVector Up=V->Terrain->Sample(Point+FVector(0,0,100)).Normal.GetSafeNormal();
        const FVector Previous=I>0?Gates[I-1]:Road.Spawn;
        const FVector Heading=Gates[I+1]-Previous;
        const FVector Forward=(Heading-Up*FVector::DotProduct(Heading,Up)).GetSafeNormal();
        const FVector Side=FVector::CrossProduct(Up,Forward).GetSafeNormal();
        const bool FrameValid=!Point.ContainsNaN()&&!Up.ContainsNaN()&&!Forward.ContainsNaN()&&
            !Side.ContainsNaN()&&Up.Z>.15f&&!Forward.IsNearlyZero()&&!Side.IsNearlyZero();
        for(float Along:{-30.f,0.f,30.f})for(float Across:{-60.f,0.f,60.f}) {
          ++RoadJoinProbes;
          const FVector Mount=Point+Forward*Along+Side*Across+Up*72;
          const auto Contact=FrameValid?V->Terrain->CastTireSupport(Mount,Up,Forward,42,28,-30,57,V):FTerraSupport();
          const auto Surface=Contact.Hit?V->Terrain->Sample(Contact.Point):FTerraSample();
          const bool Supported=FrameValid&&Contact.Hit&&!Contact.Point.ContainsNaN()&&
              !Contact.Normal.ContainsNaN()&&FMath::IsFinite(Contact.Distance)&&Contact.Surface==6&&
              Surface.Surface==6&&FMath::IsFinite(Surface.Packing)&&Surface.Packing>.5f;
          if(!Supported) {
            ++RoadJoinMissing;
            if(RoadJoinMissing<=20)UE_LOG(LogTemp,Warning,
                TEXT("TERRA_WINTER_ROAD_JOIN_MISSING join=%d along=%.0f across=%.0f point=%s hit=%d surface=%d packing=%.3f distance=%.3f"),
                I,Along,Across,*Point.ToString(),Contact.Hit,Contact.Surface,Surface.Packing,Contact.Distance);
          }
        }
      }
    }
    UE_LOG(LogTemp,Display,TEXT("TERRA_WINTER_ROAD_JOINS probes=%d missing=%d"),RoadJoinProbes,RoadJoinMissing);
    Add(TEXT("whole winter internal road joins retain packed snow tire support"),RoadJoinProbes>300&&RoadJoinMissing==0,RoadJoinProbes-RoadJoinMissing);
    Zone=0;Place(V);return false;
  }
  if(Stage==2&&Time>2.5f) {
    const auto Ground=V->Terrain->Sample(V->GetActorLocation());
    Add(FString::Printf(TEXT("winter start %d has packed snow road friction"),Zone),Ground.Surface==6&&Ground.Mu>.25f&&Ground.Mu<.6f,Ground.Mu);
    Add(FString::Printf(TEXT("winter start %d tire support uses authored collision"),Zone),V->ContactCount==4,V->ContactCount);
    bool Clear=true;float Worst=0;
    for(const auto &Wheel:V->WheelState) {
      Worst=FMath::Max(Worst,float(FMath::Abs(Wheel.Contact.Z-Wheel.Ground.Height)));
      Clear&=Wheel.ContactValid&&FMath::IsFinite(Wheel.Distance)&&Wheel.Distance>0;
    }
    Add(FString::Printf(TEXT("winter start %d settled finite wheel travel"),Zone),Clear,Worst);
    Capture(Shots[Zone]);WinterTrialStart=V->GetActorLocation();
    V->TestBrake=0;V->TestThrottle=.45f;Next(3);return false;
  }
  if(Stage==3) {
    Peak=FMath::Max(Peak,FMath::Abs(V->Speed));
    if(Time>4.f) {
      const float Distance=FVector::Dist2D(WinterTrialStart,V->GetActorLocation())/100;
      Add(FString::Printf(TEXT("winter start %d drives on original snow road"),Zone),Distance>2&&V->ContactCount>0,Distance);
      Add(FString::Printf(TEXT("winter start %d native speed remains finite"),Zone),FMath::IsFinite(Peak)&&Peak<35,Peak);
      V->TestThrottle=0;V->TestBrake=1;Next(4);return false;
    }
  }
  if(Stage==4&&Time>4.f) {
    Add(FString::Printf(TEXT("winter start %d Space brake stops vehicle on snow"),Zone),FMath::Abs(V->Speed)<.55f,V->Speed);
    Add(FString::Printf(TEXT("winter start %d brake lamps illuminate"),Zone),V->BrakeLampLevel>1,V->BrakeLampLevel);
    if(++Zone<4) {Place(V);return false;}
    Overview=World->SpawnActor<ACameraActor>();
    if(Overview.IsValid()) {
      const FVector Focus=V->Terrain->Spawns[1]+FVector(0,0,100);
      const FVector Eye=Focus+FVector(-2000,1300,1400);
      Overview->SetActorLocationAndRotation(Eye,(Focus-Eye).Rotation());
      Overview->GetCameraComponent()->SetFieldOfView(62);
      if(auto *PC=Cast<APlayerController>(V->GetController()))PC->SetViewTarget(Overview.Get());
    }
    Next(5);return false;
  }
  if(Stage==5&&Time>1.5f) {
    Capture(TEXT("native-winter-complete-coast-overview.png"));
    // Screenshot requests render later in this frame. Keep the coast camera
    // in place until a later tick before framing the second overview.
    Next(50);return false;
  }
  if(Stage==50&&Time>.15f) {
    if(Overview.IsValid()) {
      const FVector Focus=V->Terrain->Spawns[2]+FVector(0,0,150);
      const FVector Eye=Focus+FVector(1800,1000,1300);
      Overview->SetActorLocationAndRotation(Eye,(Focus-Eye).Rotation());
    }
    Next(6);return false;
  }
  if(Stage==6&&Time>1.5f) {
    Capture(TEXT("native-winter-complete-quarry-overview.png"));Next(7);return false;
  }
  if(Stage==7&&Time>1) {
    if(auto *PC=Cast<APlayerController>(V->GetController()))PC->SetViewTarget(V);
    if(Overview.IsValid())Overview->Destroy();Overview.Reset();
    V->SetUpgrade(TerraSim::Engine,1,false);V->Pressure=29;
    Next(8);TerraWinter::Travel(V);return false;
  }
  if(Stage==8&&!TerraWinter::IsActive(World)&&Time>1) {
    Add(TEXT("winter return restores complete native proving ground"),V->Terrain->Spawns.Num()==9&&V->Terrain->ConstructedMeshCount==3,V->Terrain->Spawns.Num());
    Add(TEXT("winter return retains selected Civic and engine upgrade"),V->VehicleIndex==2&&V->UpgradeStage(TerraSim::Engine)==1,V->VehicleIndex);
    Add(TEXT("winter return retains tire pressure"),FMath::Abs(V->Pressure-29)<.01f,V->Pressure);
    const auto *PC=Cast<APlayerController>(V->GetController());
    Add(TEXT("winter travel returns camera ownership to native vehicle"),PC&&PC->GetViewTarget()==V);
    Next(99);
  }
  if(Stage==99) {
    for(const auto &Case:Cases)Check(Case.Name,Case.Pass,Case.Value);
    return true;
  }
  return false;
}
