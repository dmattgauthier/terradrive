#include "TerraWinter.h"
#include "TerraVehicle.h"
#include "TerraSimCore.h"
#include "Components/PrimitiveComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace {
FBox WinterBounds(FVector(-2000000,-2000000,-200000),FVector(2000000,2000000,200000));
TArray<float> WinterSpawnYaws;
TMap<FIntPoint,float> FloorHeightCache;
TArray<FVector> WinterRoadDiagnosticJoins;
TSet<int32> WinterRoadReportedJoins;
bool WinterSupportDiagnostics=false;
struct FTravelBuild {
  TerraSim::UpgradeSetup Builds[ATerraVehicle::VehicleCount];
  float Pressure=35;
  int Vehicle=0;
  bool Tracks=false,Pending=false;
} TravelBuild;

FVector ReadVector(const TArray<TSharedPtr<FJsonValue>> &A) {
  return A.Num()==3?FVector(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber()):FVector::ZeroVector;
}
enum class EWinterSurface { Snow,PackedSnow,Ice,Rock,Earth,Pavement };
EWinterSurface Classify(const UPrimitiveComponent *Component) {
  if(!Component)return EWinterSurface::Snow;
  FString Identity=Component->GetName();
  if(const auto *Mesh=Cast<UStaticMeshComponent>(Component)) {
    if(Mesh->GetStaticMesh())Identity+=Mesh->GetStaticMesh()->GetPathName();
    for(int I=0;I<Mesh->GetNumMaterials();++I)
      if(auto *Material=Mesh->GetMaterial(I))Identity+=Material->GetPathName();
  }
  // The source's road is snow-covered: a road mesh is not automatically dry
  // tarmac.  Explicit dry-asphalt materials are the only pavement category.
  Identity=Identity.ToLower();
  if(Identity.Contains(TEXT("asphalt"))||Identity.Contains(TEXT("tarmac")))return EWinterSurface::Pavement;
  if(Identity.Contains(TEXT("road")))return EWinterSurface::PackedSnow;
  if(Identity.Contains(TEXT("ice"))&&!Identity.Contains(TEXT("iceland")))return EWinterSurface::Ice;
  if(Identity.Contains(TEXT("rock"))||Identity.Contains(TEXT("cliff"))||Identity.Contains(TEXT("outcrop")))return EWinterSurface::Rock;
  if(Identity.Contains(TEXT("pebble"))||Identity.Contains(TEXT("gravel")))return EWinterSurface::Earth;
  return EWinterSurface::Snow;
}
FTerraSample SurfaceSample(const FHitResult &Hit) {
  FTerraSample Result;
  Result.Height=Hit.ImpactPoint.Z;
  Result.Normal=Hit.ImpactNormal.GetSafeNormal();
  switch(Classify(Hit.GetComponent())) {
  case EWinterSurface::Pavement:Result.Surface=1;Result.Mu=.91f;Result.Rolling=.014f;Result.Softness=Result.MaxSink=0;break;
  case EWinterSurface::PackedSnow:Result.Surface=6;Result.Mu=.42f;Result.Rolling=.028f;Result.Softness=.20f;Result.MaxSink=.035f;Result.Packing=.80f;break;
  case EWinterSurface::Ice:Result.Surface=6;Result.Mu=.18f;Result.Rolling=.009f;Result.Softness=Result.MaxSink=0;Result.Packing=1;break;
  case EWinterSurface::Rock:Result.Surface=4;Result.Mu=.78f;Result.Rolling=.022f;Result.Softness=Result.MaxSink=0;break;
  case EWinterSurface::Earth:Result.Surface=0;Result.Mu=.63f;Result.Rolling=.045f;Result.Softness=.12f;Result.MaxSink=.025f;break;
  default:Result.Surface=6;Result.Mu=.33f;Result.Rolling=.060f;Result.Softness=.72f;Result.MaxSink=.24f;break;
  }
  return Result;
}
bool Floor(UWorld *World,FVector Point,FHitResult &Hit,bool Global=false) {
  if(!World)return false;
  FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraWinterFloor),true);
  FCollisionObjectQueryParams Objects(ECC_WorldStatic);
  // Static scenery is the authored floor.  Vehicle bodies, detached debris
  // and the camera never become terrain height samples.
  const float Top=Global?WinterBounds.Max.Z+2000.f:Point.Z+350.f;
  return World->LineTraceSingleByObjectType(Hit,FVector(Point.X,Point.Y,Top),
      FVector(Point.X,Point.Y,WinterBounds.Min.Z-2000.f),Objects,Params);
}
}

bool TerraWinter::IsActive(const UWorld *World) {
  return World&&World->GetMapName().Contains(TEXT("WinterExpedition"));
}
bool TerraWinter::Initialize(ATerraWorld &Terrain) {
  if(!IsActive(Terrain.GetWorld()))return false;
  FString Text;TSharedPtr<FJsonObject> Manifest;
  if(!FFileHelper::LoadFileToString(Text,*(FPaths::ProjectContentDir()/TEXT("NativeData/winter-level.json")))||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Manifest)||!Manifest.IsValid()) {
    UE_LOG(LogTemp,Error,TEXT("TERRA_WINTER_ERROR native winter level manifest missing"));return false;
  }
  WinterBounds=FBox(ReadVector(Manifest->GetArrayField(TEXT("boundsMin"))),ReadVector(Manifest->GetArrayField(TEXT("boundsMax"))));
  FloorHeightCache.Empty();
  WinterRoadDiagnosticJoins.Empty();WinterRoadReportedJoins.Empty();
  WinterSupportDiagnostics=FParse::Param(FCommandLine::Get(),TEXT("TerraWinterSupportDebug"));
  WinterSpawnYaws.Empty();Terrain.Spawns.Empty();Terrain.ZoneNames.Empty();Terrain.Routes.Empty();
  for(const auto &Value:Manifest->GetArrayField(TEXT("spawns"))) {
    const auto Spawn=Value->AsObject();
    Terrain.Spawns.Add(ReadVector(Spawn->GetArrayField(TEXT("position"))));
    Terrain.ZoneNames.Add(Spawn->GetStringField(TEXT("name")));
    WinterSpawnYaws.Add(Spawn->GetNumberField(TEXT("yaw")));
  }
  if(Terrain.Spawns.IsEmpty())return false;
  const TArray<TSharedPtr<FJsonValue>> *RoutePoints=nullptr;
  if(Manifest->TryGetArrayField(TEXT("roadRoute"),RoutePoints)&&RoutePoints->Num()>1) {
    FTerraRoute Route;Route.Name=TEXT("Winter expedition / Ice Road");
    Route.Hint=TEXT("Snow-covered road: ease into the throttle, leave braking room. 0 returns to the proving ground.");
    Route.Spawn=Terrain.Spawns[0];Route.Yaw=WinterSpawnYaws[0];Route.Zone=0;Route.GateWidth=14;
    for(const auto &Point:*RoutePoints)Route.Gates.Add(ReadVector(Point->AsArray()));
    WinterRoadDiagnosticJoins=Route.Gates;
    Terrain.Routes.Add(Route);
  }
  int Actors=0,Primitives=0,WindVisuals=0;
  for(TActorIterator<AActor> It(Terrain.GetWorld());It;++It) {
    if(It->IsA<ATerraWorld>()||It->IsA<ATerraVehicle>())continue;
    ++Actors;
    TInlineComponentArray<UPrimitiveComponent*> Components(*It);
    for(auto *Component:Components) {
      if(Component->IsRegistered())++Primitives;
      const auto *Mesh=Cast<UStaticMeshComponent>(Component);
      if(Mesh&&Mesh->GetStaticMesh()&&Mesh->GetStaticMesh()->GetPathName().StartsWith(TEXT("/Game/AutomotiveWinterScene/FX/Wind/"))) {
        // The sample's moving snow/wind cards are visual effects. Their
        // inherited mesh collision otherwise forms invisible sheets above
        // the authored road, taking tire support and snagging the chassis.
        Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        ++WindVisuals;
      }
    }
  }
  Terrain.Ready=true;
  UE_LOG(LogTemp,Display,TEXT("TERRA_WINTER_READY fullAuthoredScene=1 actors=%d primitives=%d spawns=%d bounds=%s"),
      Actors,Primitives,Terrain.Spawns.Num(),*WinterBounds.ToString());
  UE_LOG(LogTemp,Display,TEXT("TERRA_WINTER_WIND_VISUALS nonColliding=%d"),WindVisuals);
  return true;
}
float TerraWinter::Height(UWorld *World,float X,float Y) {
  // Spray and secondary visual marks repeatedly ask for the same floor.
  // Cache a bounded 9.84-inch grid for those queries. Actual tire contact
  // and its surface normal still come from exact authored-scene collision.
  constexpr float Cell=25;
  const int GX=FMath::FloorToInt(X/Cell),GY=FMath::FloorToInt(Y/Cell);
  const float U=X/Cell-GX,V=Y/Cell-GY;
  if(FloorHeightCache.Num()>32764)FloorHeightCache.Empty();
  auto Read=[&](int I,int J) {
    const FIntPoint Key(I,J);
    if(const auto *Cached=FloorHeightCache.Find(Key))return *Cached;
    FHitResult Hit;
    const float Value=Floor(World,FVector(I*Cell,J*Cell,0),Hit,true)?float(Hit.ImpactPoint.Z):float(WinterBounds.Min.Z-10000.f);
    FloorHeightCache.Add(Key,Value);return Value;
  };
  const float A=Read(GX,GY),B=Read(GX+1,GY),C=Read(GX,GY+1),D=Read(GX+1,GY+1);
  return FMath::Lerp(FMath::Lerp(A,B,U),FMath::Lerp(C,D,U),V);
}
FTerraSample TerraWinter::Sample(UWorld *World,FVector Point) {
  FHitResult Hit;
  if(Floor(World,Point,Hit))return SurfaceSample(Hit);
  FTerraSample Result;Result.Height=WinterBounds.Min.Z-10000.f;Result.Surface=6;
  Result.Mu=.33f;Result.Rolling=.06f;Result.Softness=.72f;Result.MaxSink=.24f;
  return Result;
}
FTerraSupport TerraWinter::Support(UWorld *World,FVector Mount,FVector Up,float RadiusCM,
    float MinCM,float MaxCM,const AActor *Ignore) {
  FTerraSupport Result;if(!World)return Result;
  Up=Up.GetSafeNormal();
  FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraWinterSuspension),true,Ignore);
  FCollisionObjectQueryParams Objects(ECC_WorldStatic);
  TArray<FHitResult> Hits;
  FHitResult SelectedHit;
  World->SweepMultiByObjectType(Hits,Mount-Up*MinCM,Mount-Up*MaxCM,FQuat::Identity,
      Objects,FCollisionShape::MakeSphere(RadiusCM),Params);
  for(const auto &Hit:Hits) {
    if(!Hit.GetComponent()||Hit.bStartPenetrating)continue;
    const float Distance=MinCM+Hit.Distance;
    if(!TerraSim::ValidSupport(Distance,MinCM,MaxCM,FVector::DotProduct(Up,Hit.ImpactNormal)))continue;
    if(!Result.Hit||Distance<Result.Distance) {
      const auto Surface=SurfaceSample(Hit);
      // Authored snow/road/landscape use their own surface friction.  Rocks
      // remain rigid obstacles and can support a tire without soil digging.
      const bool Rigid=Surface.Surface==4;
      Result={Hit.ImpactPoint,Hit.ImpactNormal,Distance,true,Rigid,Surface.Surface};
      SelectedHit=Hit;
    }
  }
  if(Result.Hit&&WinterSupportDiagnostics&&WinterRoadReportedJoins.Num()<25) {
    int Join=INDEX_NONE;double Nearest=FMath::Square(150.);
    for(int I=0;I+1<WinterRoadDiagnosticJoins.Num();++I) {
      const double Distance=FVector::DistSquared2D(Mount,WinterRoadDiagnosticJoins[I]);
      if(Distance<Nearest){Nearest=Distance;Join=I;}
    }
    if(Join!=INDEX_NONE&&!WinterRoadReportedJoins.Contains(Join)) {
      FHitResult FloorHit;
      const bool HasFloor=Floor(World,SelectedHit.ImpactPoint,FloorHit);
      const auto Kind=Classify(SelectedHit.GetComponent());
      const auto FloorKind=HasFloor?Classify(FloorHit.GetComponent()):EWinterSurface::Snow;
      // Include reference joins too, so a surface mismatch introduced by
      // averaging footprint contacts can be distinguished from buried road.
      {
        WinterRoadReportedJoins.Add(Join);
        auto ComponentName=[](const FHitResult &Hit) {
          auto *Component=Hit.GetComponent();
          FString Name=Component?Component->GetPathName():TEXT("none");
          if(const auto *Mesh=Cast<UStaticMeshComponent>(Component))
            if(Mesh->GetStaticMesh())Name+=TEXT(" mesh=")+Mesh->GetStaticMesh()->GetPathName();
          return Name;
        };
        UE_LOG(LogTemp,Warning,TEXT("TERRA_WINTER_SUPPORT_DIAG join=%d gate=%s mount=%s supportPoint=%s distance=%.3f kind=%d collider=%s floorZ=%.3f floorKind=%d floorCollider=%s"),
            Join,*WinterRoadDiagnosticJoins[Join].ToString(),*Mount.ToString(),*SelectedHit.ImpactPoint.ToString(),
            Result.Distance,int(Kind),*ComponentName(SelectedHit),HasFloor?FloorHit.ImpactPoint.Z:-999999.,
            int(FloorKind),*ComponentName(FloorHit));
        TArray<FHitResult> Layers;
        World->LineTraceMultiByObjectType(Layers,SelectedHit.ImpactPoint+FVector(0,0,350),
            FVector(SelectedHit.ImpactPoint.X,SelectedHit.ImpactPoint.Y,WinterBounds.Min.Z-2000),Objects,Params);
        for(int Layer=0;Layer<FMath::Min(6,Layers.Num());++Layer)
          UE_LOG(LogTemp,Warning,TEXT("TERRA_WINTER_SUPPORT_LAYER join=%d layer=%d z=%.3f kind=%d collider=%s"),
              Join,Layer,Layers[Layer].ImpactPoint.Z,int(Classify(Layers[Layer].GetComponent())),*ComponentName(Layers[Layer]));
      }
    }
  }
  return Result;
}
bool TerraWinter::OutsideBounds(const UWorld *World,FVector Point) {
  if(!IsActive(World))return Point.Z< -3000||Point.Size2D()>56000;
  return Point.Z<WinterBounds.Min.Z-5000||Point.X<WinterBounds.Min.X-20000||
      Point.X>WinterBounds.Max.X+20000||Point.Y<WinterBounds.Min.Y-20000||Point.Y>WinterBounds.Max.Y+20000;
}
float TerraWinter::SpawnYaw(const UWorld *World,int Zone) {
  return IsActive(World)&&WinterSpawnYaws.IsValidIndex(Zone)?WinterSpawnYaws[Zone]:0;
}
void TerraWinter::Travel(ATerraVehicle *Vehicle) {
  if(!Vehicle||!Vehicle->Terrain||!Vehicle->Terrain->Ready)return;
  if(!Vehicle->AutoTest&&!Vehicle->SaveGarage(Vehicle->GaragePath())) {
    Vehicle->Notice=TEXT("Could not save this garage before travel.");return;
  }
  for(int I=0;I<ATerraVehicle::VehicleCount;++I)TravelBuild.Builds[I]=Vehicle->Builds[I];
  TravelBuild.Vehicle=Vehicle->VehicleIndex;TravelBuild.Pressure=Vehicle->Pressure;
  TravelBuild.Tracks=Vehicle->Tracks;TravelBuild.Pending=true;
  const bool FromWinter=IsActive(Vehicle->GetWorld());
  Vehicle->SetGarage(false);
  UGameplayStatics::OpenLevel(Vehicle,FromWinter?TEXT("/Game/Maps/ProvingGround"):TEXT("/Game/Maps/WinterExpedition"));
}
void TerraWinter::RestoreTravel(ATerraVehicle *Vehicle) {
  if(!Vehicle)return;
  if(TravelBuild.Pending) {
    for(int I=0;I<ATerraVehicle::VehicleCount;++I)Vehicle->Builds[I]=TravelBuild.Builds[I];
    Vehicle->SelectVehicle(TravelBuild.Vehicle);Vehicle->Pressure=TravelBuild.Pressure;
    Vehicle->SetTracks(TravelBuild.Tracks);TravelBuild.Pending=false;
  }
  if(IsActive(Vehicle->GetWorld()))Vehicle->SetActorRotation(FRotator(0,SpawnYaw(Vehicle->GetWorld(),Vehicle->Zone),0));
  // Retain the authored cinematic viewpoints without allowing an activated
  // sample camera to take over the native player's driving/garage camera.
  if(auto *PC=Cast<APlayerController>(Vehicle->GetController()))PC->SetViewTarget(Vehicle);
}
