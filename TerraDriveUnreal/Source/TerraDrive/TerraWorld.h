#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "GameFramework/Actor.h"
#include "TerraWorld.generated.h"
class UProceduralMeshComponent;
class UInstancedStaticMeshComponent;
class UStaticMeshComponent;
class UCapsuleComponent;
class UMaterialInterface;
struct FTerraSample {
  float Height = 0, Water = 0, Mu = .7f, Rolling = .025f, Softness = .05f,
        MaxSink = .025f, Packing = 0, RutDepth = 0, Displacement = 0;
  uint8 Surface = 0;
  FVector Normal = FVector::UpVector;
};
struct FTerraSurfaceBlend { float Weight[7]={0,0,0,0,0,0,0}; };
struct FTerraSupport {
  FVector Point = FVector::ZeroVector, Normal = FVector::UpVector;
  float Distance = 0;
  bool Hit = false, Constructed = false;
  uint8 Surface = 0;
};
struct FTerraRoute {
  FString Name, Hint;
  FVector Spawn;
  float Yaw = 0, GateWidth = 5;
  int Zone = 6;
  TArray<FVector> Gates;
  TArray<int> GateDirections;
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
struct FTerraSoilState { TArray<float> Delta,Packing; };
struct FTerraTree {
  FVector Base, Direction = FVector::UpVector, Push = FVector::ForwardVector;
  float Radius = 25, Height = 1000, Damage = 0, Angle = 0, Omega = 0;
  bool Falling = false;
  UCapsuleComponent *Collider = nullptr;
  TArray<TPair<UInstancedStaticMeshComponent *, int32>> Parts;
  TArray<FTransform> Original;
};
struct FTerraTireMark {
  FVector A,B,Side;
  float Width=28,Phase=0;
  uint8 Surface=0;
};
struct FTerraCrushable {
  UInstancedStaticMeshComponent *Mesh=nullptr;
  int32 Index=0;
  FTransform Original;
  float Flattened=0;
};
UCLASS()
class TERRADRIVE_API ATerraWorld : public AActor {
  GENERATED_BODY()
public:
  ATerraWorld();
  virtual void BeginPlay() override;
  virtual void Tick(float Dt) override;
  FTerraSample Sample(FVector P) const;
  FTerraSurfaceBlend SurfaceBlend(float X,float Y) const;
  bool HasSurfaceBlend() const { return N>1&&BlendWeights.Num()==N*N*7&&GroundBlendMaterial!=nullptr; }
  TSharedPtr<FJsonObject> TransitionData;
  FTerraSupport CastSupport(FVector Mount, FVector Up, float RadiusCM,
                            float MinCM, float MaxCM, const AActor *Ignore,
                            bool *RigidEncountered=nullptr) const;
  FTerraSupport CastTireSupport(FVector Mount,FVector Up,FVector Forward,
      float RadiusCM,float WidthCM,float MinCM,float MaxCM,const AActor *Ignore) const;
  float Height(float X, float Y) const;
  float SnowDrift(float X,float Y) const;
  void Deform(FVector P, FVector Forward, float Load, float Pressure,
              float Width, float Length, float Slip, float Speed, float Dt);
  void HitTree(UPrimitiveComponent *Component, FVector Impulse, FVector Point);
  void SetRain(bool Enabled);
  void ResetSoil();
  void ActivateSoil(FVector P,float RadiusCM=350);
  void TireMark(int Wheel,FVector Point,FVector Forward,float Width,float Slip,
      float LongSpeed,float LateralSpeed,bool Grounded,bool Constructed,float Dt);
  void BreakTireMarks();
  int TireMarkCount() const { return TireMarks.Num(); }
  int SkidMarkCount=0,SoftMarkCount=0;
  int CrushedPlantCount=0;
  UPROPERTY() TObjectPtr<UProceduralMeshComponent> TireMarkMesh;
  TSharedPtr<FJsonObject> Data;
  TArray<FTerraTree> Trees;
  TArray<FVector> Spawns;
  TArray<FString> ZoneNames;
  TArray<FTerraRoute> Routes;
  int ConstructedMeshCount = 0;
  int DetailInstanceCount = 0, SolidDetailCount = 0;
  int FabAssetCount = 0, FabInstanceCount = 0;
  double DepressedVolume = 0, DisplacedVolume = 0, CompactedVolume = 0;
  bool Rain = false, Ready = false;
  int32 DetailCount() const { return Detail.Num(); }
  int32 CachedSoilCount() const { return SoilCache.Num(); }
  int ActiveTileLimit=768;
  FVector FindAnchor(FVector P, float MaxDistance = 4500) const;
  FVector NearestCrushable(FVector P) const;

private:
  TArray<float> Heights, Water;
  TArray<uint8> Surfaces;
  TArray<uint8> BlendWeights;
  TArray<FVector2D> QuarryTrailPolyline;
  int32 N = 0;
  float Step = .5f, Origin = -400, VisualTimer = 0;
  TMap<FIntPoint, FTerraTile> Detail;
  TMap<FIntPoint, FTerraSoilState> SoilCache;
  TMap<FIntPoint, UProceduralMeshComponent *> Ground;
  UPROPERTY() TArray<TObjectPtr<UMaterialInterface>> Materials;
  UPROPERTY() TObjectPtr<UMaterialInterface> GroundBlendMaterial;
  UPROPERTY() TArray<TObjectPtr<UInstancedStaticMeshComponent>> Scenery;
  UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> ConstructedMeshes;
  float BaseHeight(float X, float Y) const;
  uint8 SurfaceAt(float X, float Y) const;
  float LooseDirt(float X,float Y) const;
  FTerraSupport GroundSupport(FVector Mount,FVector Up,float RadiusCM,float MinCM,float MaxCM) const;
  FTerraTile *EnsureTile(FIntPoint Key);
  void RebuildGround(FIntPoint Key);
  void UpdateTile(FTerraTile &Tile);
  void LoadScenery();
  TArray<FTerraTireMark> TireMarks;
  FVector LastMark[4];
  bool MarkConnected[4]={false,false,false,false},MarksDirty=false;
  float MarkPhase[4]={0,0,0,0};
  int NextMark=0,ThrottleMarkRefresh=0;
  void RebuildTireMarks();
  TArray<FTerraCrushable> Crushable;
  TMap<FIntPoint,TArray<int32>> PlantGrid;
  void RegisterCrushable(UInstancedStaticMeshComponent *Mesh,int32 Index);
  void CrushPlants(FVector Point,FVector Forward,float HalfWidth,float HalfLength,float Strength);
};
