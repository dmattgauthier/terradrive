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
struct FProfile {FName Asset;TArray<FVector> Points;FMeshEnvelope Envelope;};
TArray<FProfile> Profiles[ATerraVehicle::VehicleCount];bool Ready=false;

bool ReadProfile(const TSharedPtr<FJsonValue>& Value,int Stage,FProfile& P){
  const auto Item=Value->AsObject();const TArray<TSharedPtr<FJsonValue>>* Points=nullptr;
  FString Asset,Hash;
  if(!Item.IsValid()||Item->GetIntegerField(TEXT("stage"))!=Stage||!Item->TryGetStringField(TEXT("asset"),Asset)||Asset.IsEmpty()||
      !Item->TryGetStringField(TEXT("sha256"),Hash)||Hash.Len()!=64||!Item->TryGetArrayField(TEXT("pointsCm"),Points)||Points->Num()<24||Points->Num()>96)return false;
  P.Asset=FName(*Asset);P.Points.Reset();
  P.Envelope={};
  double RadiusM=0,HalfWidthM=0;
  if(Item->TryGetNumberField(TEXT("maxRadialM"),RadiusM)&&Item->TryGetNumberField(TEXT("maxAxialHalfWidthM"),HalfWidthM)&&
    FMath::IsFinite(RadiusM)&&RadiusM>0&&FMath::IsFinite(HalfWidthM)&&HalfWidthM>0)P.Envelope={RadiusM*100,HalfWidthM*100};
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
  const auto& Sizes=Profiles[V->VehicleIndex];
  const int Size=V->UpgradeStage(TerraSim::TireSize);
  if(Sizes.Num()!=V->UpgradeMaxStage(TerraSim::TireSize)+1||!Sizes.IsValidIndex(Size))return nullptr;
  // Compound changes leave the fitted wheel envelope and mesh unchanged.
  const FProfile* P=&Sizes[Size];
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
  if(Version!=3)return false;
  for(int I=0;I<Vehicles->Num();++I){
    auto& Sizes=Profiles[I];
    const auto Vehicle=(*Vehicles)[I]->AsObject();const TArray<TSharedPtr<FJsonValue>>* Stages=nullptr;
    if(!Vehicle.IsValid()||!Vehicle->TryGetArrayField(TEXT("stages"),Stages)||Stages->IsEmpty())return false;
    Sizes.SetNum(Stages->Num());
    for(int S=0;S<Sizes.Num();++S)if(!ReadProfile((*Stages)[S],S,Sizes[S]))return false;
  }
  Ready=true;return true;
}
bool Matches(const ATerraVehicle* V){return MatchedProfile(V)!=nullptr;}
FMeshEnvelope MeshEnvelope(const ATerraVehicle* V){
  const auto* P=MatchedProfile(V);
  return P?P->Envelope:FMeshEnvelope{};
}
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
