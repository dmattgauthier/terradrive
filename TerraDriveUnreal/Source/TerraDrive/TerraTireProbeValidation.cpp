#include "TerraTireProbeValidation.h"
#include "TerraVehicle.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
namespace TerraTireProbeValidation {
namespace {
struct FProfile {FString Asset;TArray<FVector> Points;};
FProfile Profiles[ATerraVehicle::VehicleCount][4];bool Ready=false;
const FProfile* Profile(const ATerraVehicle* V){
  const int Stage=V->UpgradeStage(TerraSim::TireSize);
  return Ready&&V->VehicleIndex>=0&&V->VehicleIndex<ATerraVehicle::VehicleCount&&Stage>=0&&Stage<4?&Profiles[V->VehicleIndex][Stage]:nullptr;
}
}
bool Load(){
  if(Ready)return true;
  FString Json;TSharedPtr<FJsonObject> Root;const TArray<TSharedPtr<FJsonValue>>* Vehicles=nullptr;
  if(!FFileHelper::LoadFileToString(Json,*(FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-tire-probes.json")))||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||
      Root->GetIntegerField(TEXT("version"))!=1||!Root->TryGetArrayField(TEXT("vehicles"),Vehicles)||Vehicles->Num()!=ATerraVehicle::VehicleCount)return false;
  for(int I=0;I<Vehicles->Num();++I){const auto Vehicle=(*Vehicles)[I]->AsObject();const TArray<TSharedPtr<FJsonValue>>* Stages=nullptr;
    if(!Vehicle.IsValid()||!Vehicle->TryGetArrayField(TEXT("stages"),Stages)||Stages->Num()!=4)return false;
    for(int S=0;S<4;++S){auto& P=Profiles[I][S];P.Points.Reset();const auto Item=(*Stages)[S]->AsObject();const TArray<TSharedPtr<FJsonValue>>* Points=nullptr;
      FString Hash;if(!Item.IsValid()||Item->GetIntegerField(TEXT("stage"))!=S||!Item->TryGetStringField(TEXT("asset"),P.Asset)||
          !Item->TryGetStringField(TEXT("sha256"),Hash)||Hash.Len()!=64||!Item->TryGetArrayField(TEXT("pointsCm"),Points)||Points->Num()<24||Points->Num()>96)return false;
      for(const auto& Value:*Points){const auto& A=Value->AsArray();if(A.Num()!=3)return false;const FVector Point(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber());if(Point.ContainsNaN())return false;P.Points.Add(Point);}
    }
  }
  Ready=true;return true;
}
bool Matches(const ATerraVehicle* V){
  const auto* P=Profile(V);if(!P||V->Tracks||V->Wheels.Num()!=V->WheelCount())return false;
  for(const auto& Wheel:V->Wheels){if(!Wheel||!Wheel->GetStaticMesh())return false;const FString Asset=Wheel->GetStaticMesh()->GetName();
    if(Asset!=P->Asset&&!(V->UpgradeStage(TerraSim::TireSize)==0&&Asset.StartsWith(P->Asset+TEXT("_"))))return false;
  }
  return true;
}
TArray<FVector> ActorLocalPoints(const ATerraVehicle* V){
  TArray<FVector> Result;const auto* P=Profile(V);if(!P)return Result;
  const auto Inverse=V->GetActorTransform().Inverse();
  for(const auto& Wheel:V->Wheels)for(const auto& Point:P->Points)Result.Add(Inverse.TransformPosition(Wheel->GetComponentTransform().TransformPosition(Point)));
  return Result;
}
float MinimumClearance(const ATerraVehicle* V){
  const auto* P=Profile(V);if(!P||!V->Terrain||!Matches(V))return -UE_BIG_NUMBER;
  float Clearance=UE_BIG_NUMBER;
  for(const auto& Wheel:V->Wheels)for(const auto& Local:P->Points){const auto Point=Wheel->GetComponentTransform().TransformPosition(Local);
    if(Point.ContainsNaN())return -UE_BIG_NUMBER;
    Clearance=FMath::Min(Clearance,float(Point.Z-V->Terrain->Height(Point.X,Point.Y)));
  }
  return Clearance;
}
}
