#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace {
struct FCoachwork {
  FString Asset,Hash;
  TArray<TArray<FVector>> Hulls;
};
TArray<FCoachwork> LoadCoachwork(){
  TArray<FCoachwork> Profiles;FString File=FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-collision.json"),Json;
  if(FParse::Param(FCommandLine::Get(),TEXT("TerraValidate")))FParse::Value(FCommandLine::Get(),TEXT("TerraCoachworkData="),File);
  TSharedPtr<FJsonObject> Root;const TArray<TSharedPtr<FJsonValue>>* Vehicles=nullptr;
  if(!FFileHelper::LoadFileToString(Json,*File)||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||
      !Root->TryGetArrayField(TEXT("vehicles"),Vehicles)||Vehicles->Num()!=ATerraVehicle::VehicleCount)return Profiles;
  for(const auto& Value:*Vehicles){
    const auto Item=Value->AsObject();FCoachwork P;const TArray<TSharedPtr<FJsonValue>>* Hulls=nullptr;
    if(!Item.IsValid()||!Item->TryGetStringField(TEXT("asset"),P.Asset)||!Item->TryGetStringField(TEXT("objSha256"),P.Hash)||P.Hash.Len()!=64||
        !Item->TryGetArrayField(TEXT("hulls"),Hulls)||Hulls->Num()!=12)return {};
    for(const auto& HullValue:*Hulls){const auto Hull=HullValue->AsObject();const TArray<TSharedPtr<FJsonValue>>* Points=nullptr;
      if(!Hull.IsValid()||!Hull->TryGetArrayField(TEXT("points"),Points)||Points->Num()<4||Points->Num()>64)return {};
      TArray<FVector> Vertices;FBox Bounds(ForceInit);
      for(const auto& Point:*Points){const auto& A=Point->AsArray();if(A.Num()!=3)return {};const FVector V(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber());if(V.ContainsNaN())return {};Vertices.Add(V);Bounds+=V;}
      if(Bounds.GetSize().GetMin()<=1)return {};P.Hulls.Add(MoveTemp(Vertices));
    }
    Profiles.Add(MoveTemp(P));
  }
  return Profiles;
}
TMap<FString,FString> LoadMeshHashes(){
  TMap<FString,FString> Result;FString Json;TSharedPtr<FJsonObject> Root;const TArray<TSharedPtr<FJsonValue>>* Vehicles=nullptr;
  if(!FFileHelper::LoadFileToString(Json,*(FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-ground-probes.json")))||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||!Root->TryGetArrayField(TEXT("vehicles"),Vehicles))return Result;
  for(const auto& Value:*Vehicles){const auto V=Value->AsObject();FString Asset,Hash;if(V.IsValid()&&V->TryGetStringField(TEXT("asset"),Asset)&&V->TryGetStringField(TEXT("objSha256"),Hash))Result.Add(Asset,Hash);}
  return Result;
}
}
void ATerraVehicle::ConfigureCoachworkCollision(){
  static const TArray<FCoachwork> Profiles=LoadCoachwork();
  static const TMap<FString,FString> MeshHashes=LoadMeshHashes();
  CoachworkCollisionReady=false;CoachworkHullCount=0;CoachworkCollisionSource.Empty();
  const FString Expected=Body->GetStaticMesh()?Body->GetStaticMesh()->GetName():FString();
  const FCoachwork* Match=Profiles.FindByPredicate([&](const FCoachwork& P){const FString* Hash=MeshHashes.Find(P.Asset);return P.Asset==Expected&&Hash&&*Hash==P.Hash;});
  if(!Match){
    CoachworkCollision->ClearCollisionConvexMeshes();CoachworkCollision->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    RoofCollision->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    UE_LOG(LogTemp,Error,TEXT("TERRA_COACHWORK_MISSING model=%s; a matching full native-data cook is required"),*Expected);return;
  }
  // Mesh-local centimetres already contain the rendering datum/CG offset.
  // The convex parts replace the undersized cabin box. Root undertray and
  // raised approach/departure collision stay active, with the same low-friction
  // material, mass and intended centre of mass. There is no pose/velocity fix.
  CoachworkCollision->SetRelativeTransform(FTransform::Identity);
  CoachworkCollision->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
  CoachworkCollision->SetCollisionConvexMeshes(Match->Hulls);
  RoofCollision->SetCollisionEnabled(ECollisionEnabled::NoCollision);
  CoachworkHullCount=Match->Hulls.Num();CoachworkCollisionSource=Match->Hash;
  CoachworkCollisionReady=CoachworkCollision->BodyInstance.WeldParent!=nullptr;
  // A selected garage model is kinematic. Its prepared convex parts weld when
  // the chassis resumes simulation; SetGarage refreshes readiness at that point.
  if(!Chassis->IsSimulatingPhysics()){
    UE_LOG(LogTemp,Display,TEXT("TERRA_COACHWORK_PREVIEW model=%s hulls=%d; prepared while chassis simulation is paused"),*Expected,CoachworkHullCount);
    return;
  }
  if(!CoachworkCollisionReady)UE_LOG(LogTemp,Error,TEXT("TERRA_COACHWORK_MISSING model=%s; coachwork did not weld to the simulated chassis"),*Expected);
  UE_LOG(LogTemp,Display,TEXT("TERRA_COACHWORK_READY model=%s hulls=%d source=%s welded=%d"),*Expected,CoachworkHullCount,*CoachworkCollisionSource,CoachworkCollision->BodyInstance.WeldParent!=nullptr);
}
