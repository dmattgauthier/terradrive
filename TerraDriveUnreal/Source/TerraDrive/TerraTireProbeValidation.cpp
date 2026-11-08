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
struct FProfile {FName Asset;TArray<FVector> Points;};
struct FVehicleProfiles {FProfile Sizes[4],Compounds[3];};
FVehicleProfiles Profiles[ATerraVehicle::VehicleCount];bool Ready=false;

bool ReadProfile(const TSharedPtr<FJsonValue>& Value,int Stage,FProfile& P){
  const auto Item=Value->AsObject();const TArray<TSharedPtr<FJsonValue>>* Points=nullptr;
  FString Asset,Hash;
  if(!Item.IsValid()||Item->GetIntegerField(TEXT("stage"))!=Stage||!Item->TryGetStringField(TEXT("asset"),Asset)||Asset.IsEmpty()||
      !Item->TryGetStringField(TEXT("sha256"),Hash)||Hash.Len()!=64||!Item->TryGetArrayField(TEXT("pointsCm"),Points)||Points->Num()<24||Points->Num()>96)return false;
  P.Asset=FName(*Asset);P.Points.Reset();
  for(const auto& Entry:*Points){
    const auto& A=Entry->AsArray();if(A.Num()!=3)return false;
    const FVector Point(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber());
    if(Point.ContainsNaN())return false;
    P.Points.Add(Point);
  }
  return true;
}
const FProfile* MatchedProfile(const ATerraVehicle* V){
  if(!Ready||V->VehicleIndex<0||V->VehicleIndex>=ATerraVehicle::VehicleCount||V->Tracks||V->Wheels.Num()!=V->WheelCount())return nullptr;
  const auto& Set=Profiles[V->VehicleIndex];
  const int Size=V->UpgradeStage(TerraSim::TireSize),Compound=V->UpgradeStage(TerraSim::Tires);
  if(Size<0||Size>=UE_ARRAY_COUNT(Set.Sizes)||Compound<0||Compound>UE_ARRAY_COUNT(Set.Compounds))return nullptr;
  const FProfile* P=&Set.Sizes[Size];
  // Diameter kits use their own mesh. At factory diameter, compounds use
  // bead-remapped meshes with different sidewall vertices from stock.
  if(Compound>0&&P->Asset==Set.Sizes[0].Asset)P=&Set.Compounds[Compound-1];
  if(P->Points.IsEmpty())return nullptr;
  for(const auto& Wheel:V->Wheels)
    if(!Wheel||!Wheel->GetStaticMesh()||Wheel->GetStaticMesh()->GetFName()!=P->Asset)return nullptr;
  return P;
}
}
bool Load(){
  if(Ready)return true;
  FString Json;TSharedPtr<FJsonObject> Root;const TArray<TSharedPtr<FJsonValue>>* Vehicles=nullptr;
  if(!FFileHelper::LoadFileToString(Json,*(FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-tire-probes.json")))||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||
      !Root->TryGetArrayField(TEXT("vehicles"),Vehicles)||Vehicles->Num()!=ATerraVehicle::VehicleCount)return false;
  const int Version=Root->GetIntegerField(TEXT("version"));
  if(Version!=1&&Version!=2)return false;
  for(int I=0;I<Vehicles->Num();++I){
    auto& Set=Profiles[I];
    const auto Vehicle=(*Vehicles)[I]->AsObject();const TArray<TSharedPtr<FJsonValue>>* Stages=nullptr;
    if(!Vehicle.IsValid()||!Vehicle->TryGetArrayField(TEXT("stages"),Stages)||Stages->Num()!=4)return false;
    for(int S=0;S<4;++S)if(!ReadProfile((*Stages)[S],S,Set.Sizes[S]))return false;
    // Older cooks contain exact stock and diameter-kit probes only.
    for(auto& P:Set.Compounds)P=FProfile();
    if(Version==2){
      const TArray<TSharedPtr<FJsonValue>>* Compounds=nullptr;
      if(!Vehicle->TryGetArrayField(TEXT("compounds"),Compounds)||Compounds->Num()!=3)return false;
      for(int S=0;S<3;++S)if(!ReadProfile((*Compounds)[S],S+1,Set.Compounds[S]))return false;
    }
  }
  Ready=true;return true;
}
bool Matches(const ATerraVehicle* V){return MatchedProfile(V)!=nullptr;}
TArray<FVector> ActorLocalPoints(const ATerraVehicle* V){
  TArray<FVector> Result;const auto* P=MatchedProfile(V);if(!P)return Result;
  const auto Inverse=V->GetActorTransform().Inverse();
  for(const auto& Wheel:V->Wheels)for(const auto& Point:P->Points)Result.Add(Inverse.TransformPosition(Wheel->GetComponentTransform().TransformPosition(Point)));
  return Result;
}
float MinimumClearance(const ATerraVehicle* V){
  const auto* P=MatchedProfile(V);if(!P||!V->Terrain)return -UE_BIG_NUMBER;
  float Clearance=UE_BIG_NUMBER;
  for(const auto& Wheel:V->Wheels)for(const auto& Local:P->Points){const auto Point=Wheel->GetComponentTransform().TransformPosition(Local);
    if(Point.ContainsNaN())return -UE_BIG_NUMBER;
    Clearance=FMath::Min(Clearance,float(Point.Z-V->Terrain->Height(Point.X,Point.Y)));
  }
  return Clearance;
}
}
