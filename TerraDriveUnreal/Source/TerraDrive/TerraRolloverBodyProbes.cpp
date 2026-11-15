#include "TerraRolloverBodyProbes.h"
#include "TerraTireProbeValidation.h"
#include "TerraVehicle.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

bool FTerraRolloverBodyProbes::Load(const FString& Path){
  FString Json;
  TSharedPtr<FJsonObject> Root;
  const TArray<TSharedPtr<FJsonValue>>* Vehicles=nullptr;
  if(!FFileHelper::LoadFileToString(Json,*Path)||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||
     !Root.IsValid()||!Root->TryGetArrayField(TEXT("vehicles"),Vehicles)||Vehicles->Num()!=ATerraVehicle::VehicleCount)return false;

  TArray<TSharedPtr<FJsonValue>> Entries=*Vehicles;
  if(Root->HasField(TEXT("variants"))){
    const TArray<TSharedPtr<FJsonValue>>* Variants=nullptr;
    if(!Root->TryGetArrayField(TEXT("variants"),Variants))return false;
    Entries.Append(*Variants);
  }
  TMap<FName,TArray<FVector>> Loaded;
  for(const auto& Entry:Entries){
    const TSharedPtr<FJsonObject>* Item=nullptr;
    const TArray<TSharedPtr<FJsonValue>>* Probes=nullptr;
    FString Asset;
    if(!Entry->TryGetObject(Item)||!Item->IsValid()||!(*Item)->TryGetStringField(TEXT("asset"),Asset)||Asset.IsEmpty()||
       !(*Item)->TryGetArrayField(TEXT("rolloverProbes"),Probes)||Probes->Num()<64||Probes->Num()>384)return false;
    const FName Name(*Asset);
    if(Loaded.Contains(Name))return false;
    auto& Points=Loaded.Add(Name);
    Points.Reserve(Probes->Num());
    for(const auto& Probe:*Probes){
      const TArray<TSharedPtr<FJsonValue>>* Coordinates=nullptr;
      FVector Point;
      if(!Probe->TryGetArray(Coordinates)||Coordinates->Num()!=3||
         !(*Coordinates)[0]->TryGetNumber(Point.X)||!(*Coordinates)[1]->TryGetNumber(Point.Y)||
         !(*Coordinates)[2]->TryGetNumber(Point.Z)||Point.ContainsNaN())return false;
      Points.Add(Point);
    }
  }
  MeshPoints=MoveTemp(Loaded);
  return true;
}

const TArray<FVector>* FTerraRolloverBodyProbes::Find(const ATerraVehicle* Vehicle) const{
  const UStaticMesh* Mesh=Vehicle->Body->GetStaticMesh();
  return Mesh?MeshPoints.Find(Mesh->GetFName()):nullptr;
}

float FTerraRolloverBodyProbes::DropHeight(const ATerraVehicle* Vehicle,const TArray<FVector>& Points,const FVector& Center,const FQuat& Rotation){
  const FTransform BodyToActor=Vehicle->Body->GetComponentTransform().GetRelativeTransform(Vehicle->GetActorTransform());
  float Height=-UE_BIG_NUMBER;
  const auto Accumulate=[&](const FVector& Local){
    const FVector Offset=Rotation.RotateVector(Local);
    Height=FMath::Max(Height,Vehicle->Terrain->Height(Center.X+Offset.X,Center.Y+Offset.Y)-float(Offset.Z));
  };
  for(const FVector& Point:Points)Accumulate(BodyToActor.TransformPosition(Point));
  for(const FVector& Point:TerraTireProbeValidation::ActorLocalPoints(Vehicle))Accumulate(Point);
  return Height;
}

float FTerraRolloverBodyProbes::MinimumClearance(const ATerraVehicle* Vehicle,const TArray<FVector>& Points){
  float Clearance=UE_BIG_NUMBER;
  for(const FVector& Local:Points){
    const FVector Point=Vehicle->Body->GetComponentTransform().TransformPosition(Local);
    Clearance=FMath::Min(Clearance,float(Point.Z-Vehicle->Terrain->Height(Point.X,Point.Y)));
  }
  return Clearance;
}
