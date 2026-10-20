#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "GameFramework/Actor.h"
#include "TerraWorld.generated.h"
class UProceduralMeshComponent;
class UInstancedStaticMeshComponent;
class UCapsuleComponent;
class UMaterialInterface;
struct FTerraSample {
  float Height = 0, Water = 0, Mu = .7f, Rolling = .025f, Softness = .05f,
        MaxSink = .025f, Packing = 0;
  uint8 Surface = 0;
  FVector Normal = FVector::UpVector;
};
struct FTerraTile {
  UProceduralMeshComponent *Mesh = nullptr;
  TArray<FVector> Vertices, Normals;
  TArray<FVector2D> UV;
  TArray<FLinearColor> Colors;
  TArray<float> Delta, Packing;
  FIntPoint Key;
  bool Dirty = true;
};
struct FTerraTree {
  FVector Base, Direction = FVector::UpVector, Push = FVector::ForwardVector;
  float Radius = 25, Height = 1000, Damage = 0, Angle = 0, Omega = 0;
  bool Falling = false;
  UCapsuleComponent *Collider = nullptr;
  TArray<TPair<UInstancedStaticMeshComponent *, int32>> Parts;
  TArray<FTransform> Original;
};
UCLASS()
class TERRADRIVE_API ATerraWorld : public AActor {
  GENERATED_BODY()
public:
  ATerraWorld();
  virtual void BeginPlay() override;
  virtual void Tick(float Dt) override;
  FTerraSample Sample(FVector P) const;
  float Height(float X, float Y) const;
  void Deform(FVector P, FVector Forward, float Load, float Pressure,
              float Width, float Length, float Slip, float Speed, float Dt);
  void HitTree(UPrimitiveComponent *Component, FVector Impulse, FVector Point);
  void SetRain(bool Enabled);
  void ResetSoil();
  TSharedPtr<FJsonObject> Data;
  TArray<FTerraTree> Trees;
  TArray<FVector> Spawns;
  TArray<FString> ZoneNames;
  double DepressedVolume = 0, DisplacedVolume = 0, CompactedVolume = 0;
  bool Rain = false, Ready = false;
  int32 DetailCount() const { return Detail.Num(); }
  FVector FindAnchor(FVector P, float MaxDistance = 4500) const;

private:
  TArray<float> Heights, Water;
  TArray<uint8> Surfaces;
  int32 N = 0;
  float Step = .5f, Origin = -400, VisualTimer = 0;
  TMap<FIntPoint, FTerraTile> Detail;
  TMap<FIntPoint, UProceduralMeshComponent *> Ground;
  UPROPERTY() TArray<TObjectPtr<UMaterialInterface>> Materials;
  UPROPERTY() TArray<TObjectPtr<UInstancedStaticMeshComponent>> Scenery;
  float BaseHeight(float X, float Y) const;
  uint8 SurfaceAt(float X, float Y) const;
  FTerraTile *EnsureTile(FIntPoint Key);
  void RebuildGround(FIntPoint Key);
  void UpdateTile(FTerraTile &Tile);
  void LoadScenery();
};
