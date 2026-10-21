#include "TerraWorld.h"
#include "TerraSimCore.h"
#include "Components/BoxComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/World.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/MemoryReader.h"

namespace {
constexpr int Div = 64;
constexpr float TileCM = 800, CellCM = 12.5f;
float Smooth(float A, float B, float X) {
  float T = FMath::Clamp((X - A) / (B - A), 0.f, 1.f);
  return T * T * (3 - 2 * T);
}
FVector Vec(const TArray<TSharedPtr<FJsonValue>> &A) {
  return FVector(A[0]->AsNumber(), A[1]->AsNumber(), A[2]->AsNumber());
}
FLinearColor Tint(uint8 S) {
  static FLinearColor C[] = {
      FLinearColor(.46, .48, .33), FLinearColor(.55, .55, .55),
      FLinearColor(.38, .29, .21), FLinearColor(.31, .32, .23),
      FLinearColor(.65, .66, .62), FLinearColor(.8, .72, .52),
      FLinearColor(.94, .97, 1)};
  return C[FMath::Min<int>(S, 6)];
}
} // namespace
ATerraWorld::ATerraWorld() {
  PrimaryActorTick.bCanEverTick = true;
  RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("WorldRoot"));
}
float ATerraWorld::BaseHeight(float X, float Y) const {
  if (N < 2)
    return 0;
  float GX =
            FMath::Clamp((X / 100 - Origin) / Step, 0.f, float(N - 1) - .0001f),
        GY =
            FMath::Clamp((Y / 100 - Origin) / Step, 0.f, float(N - 1) - .0001f);
  // Rendered coarse triangles use metre cells; the exported half-metre source
  // remains available for subsequent detail work without regenerating terrain.
  int IX = FMath::FloorToInt(GX / 2) * 2, IY = FMath::FloorToInt(GY / 2) * 2;
  IX = FMath::Min(IX, N - 3);
  IY = FMath::Min(IY, N - 3);
  float U = (GX - IX) / 2, V = (GY - IY) / 2;
  // The exported stream has source-Z rows and reversed source-X columns:
  // Unreal X is the row, Unreal Y is the column (not a conventional Y/X grid).
  float A = Heights[IX * N + IY], B = Heights[(IX + 2) * N + IY],
        C = Heights[IX * N + IY + 2], D = Heights[(IX + 2) * N + IY + 2];
  return 100 * (U + V <= 1 ? A + (B - A) * U + (C - A) * V
                           : D + (C - D) * (1 - U) + (B - D) * (1 - V));
}
uint8 ATerraWorld::SurfaceAt(float X, float Y) const {
  if (!N)
    return 0;
  int I = FMath::Clamp(FMath::RoundToInt((X / 100 - Origin) / Step), 0, N - 1),
      J = FMath::Clamp(FMath::RoundToInt((Y / 100 - Origin) / Step), 0, N - 1);
  return Surfaces[I * N + J];
}
float ATerraWorld::Height(float X, float Y) const {
  FIntPoint K(FMath::FloorToInt(X / TileCM), FMath::FloorToInt(Y / TileCM));
  const FTerraTile *T = Detail.Find(K);
  float H = BaseHeight(X, Y);
  if (!T)
    return H;
  float GX = FMath::Clamp((X - K.X * TileCM) / CellCM, 0.f, 63.9999f),
        GY = FMath::Clamp((Y - K.Y * TileCM) / CellCM, 0.f, 63.9999f);
  int I = FMath::FloorToInt(GX), J = FMath::FloorToInt(GY),
      A = J * (Div + 1) + I;
  float U = GX - I, V = GY - J;
  auto Z = [&](int Index) { return T->Vertices[Index].Z + T->Delta[Index]; };
  return U + V <= 1
             ? Z(A) + (Z(A + 1) - Z(A)) * U + (Z(A + Div + 1) - Z(A)) * V
             : Z(A + Div + 2) + (Z(A + Div + 1) - Z(A + Div + 2)) * (1 - U) +
                   (Z(A + 1) - Z(A + Div + 2)) * (1 - V);
}
FTerraSample ATerraWorld::Sample(FVector P) const {
  FTerraSample S;
  S.Height = Height(P.X, P.Y);
  S.Surface = SurfaceAt(P.X, P.Y);
  S.Normal = FVector(Height(P.X - 8, P.Y) - Height(P.X + 8, P.Y),
                     Height(P.X, P.Y - 8) - Height(P.X, P.Y + 8), 16)
                 .GetSafeNormal();
  static const float Mu[] = {.72, .98, .48, .36, .84, .58, .30},
                     RR[] = {.03, .013, .11, .13, .022, .08, .085},
                     Soft[] = {.06, 0, .83, .92, 0, .75, .88},
                     Sink[] = {.025, 0, .36, .48, 0, .28, .6};
  S.Mu = Mu[S.Surface] * (Rain ? .76f : 1.f);
  S.Rolling = RR[S.Surface];
  S.Softness = Soft[S.Surface];
  S.MaxSink = Sink[S.Surface];
  if (N) {
    int I = FMath::Clamp(FMath::RoundToInt((P.X / 100 - Origin) / Step), 0,
                         N - 1),
        J = FMath::Clamp(FMath::RoundToInt((P.Y / 100 - Origin) / Step), 0,
                         N - 1);
    S.Water = FMath::Max(0.f, 100 * Water[I * N + J] + BaseHeight(P.X, P.Y) -
                                  S.Height);
  }
  FIntPoint K(FMath::FloorToInt(P.X / TileCM), FMath::FloorToInt(P.Y / TileCM));
  if (auto *T = Detail.Find(K)) {
    int I = FMath::Clamp(FMath::RoundToInt((P.X - K.X * TileCM) / CellCM), 0,
                         Div),
        J = FMath::Clamp(FMath::RoundToInt((P.Y - K.Y * TileCM) / CellCM), 0,
                         Div);
    S.Packing = T->Packing[J * (Div + 1) + I];
    S.Mu += S.Surface == 6 ? S.Packing * .23f : 0;
    S.Rolling *= 1 - S.Packing * .35f;
  }
  return S;
}
void ATerraWorld::BeginPlay() {
  Super::BeginPlay();
  FString Text;
  FFileHelper::LoadFileToString(
      Text, *(FPaths::ProjectContentDir() / TEXT("NativeData/world.json")));
  TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
  if (!FJsonSerializer::Deserialize(Reader, Data) || !Data.IsValid()) {
    UE_LOG(LogTemp, Error, TEXT("Terra world manifest missing"));
    return;
  }
  TArray<uint8> Bytes;
  if (!FFileHelper::LoadFileToArray(Bytes, *(FPaths::ProjectContentDir() /
                                             TEXT("NativeData/terrain.bin"))))
    return;
  FMemoryReader R(Bytes);
  uint32 Magic = 0;
  R << Magic;
  R << N;
  R << Step;
  R << Origin;
  if (Magic != 0x54445256 || N != 1601)
    return;
  Heights.SetNum(N * N);
  Water.SetNum(N * N);
  Surfaces.SetNum(N * N);
  for (int I = 0; I < N * N; I++) {
    R << Heights[I];
    R << Water[I];
    R << Surfaces[I];
  }
  FString Names[] = {TEXT("dirt"),    TEXT("asphalt"), TEXT("mud"),
                     TEXT("wetland"), TEXT("rock"),    TEXT("sand"),
                     TEXT("snow")};
  for (const FString &Name : Names)
    Materials.Add(LoadObject<UMaterialInterface>(
        nullptr, *(TEXT("/Game/Materials/Terrain_") + Name)));
  for (int X = -13; X < 13; X++)
    for (int Y = -13; Y < 13; Y++)
      RebuildGround({X, Y});
  for (auto Z : Data->GetArrayField(TEXT("zones"))) {
    auto O = Z->AsObject(), P = O->GetObjectField(TEXT("spawn"));
    float X = P->GetNumberField(TEXT("z")) * 100,
          Y = -P->GetNumberField(TEXT("x")) * 100;
    Spawns.Add(FVector(X, Y, Height(X, Y)));
    ZoneNames.Add(O->GetStringField(TEXT("name")));
  }
  LoadScenery();
  auto *Sun = GetWorld()->SpawnActor<ADirectionalLight>(FVector(0, 0, 10000),
                                                        FRotator(-36, -44, 0));
  Sun->GetLightComponent()->SetIntensity(4.f);
  Sun->GetLightComponent()->SetLightColor(FLinearColor(1, .91, .78));
  auto *Sky = GetWorld()->SpawnActor<ASkyLight>();
  Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable);
  Sky->GetLightComponent()->SetIntensity(1.1f);
  Sky->GetLightComponent()->bRealTimeCapture = true;
  auto *Fog = GetWorld()->SpawnActor<AExponentialHeightFog>();
  Fog->GetComponent()->SetFogDensity(.009f);
  Fog->GetComponent()->SetFogInscatteringColor(FLinearColor(.48, .61, .72));
  // A native sky dome gives the skylight something to capture.
  auto *Dome = GetWorld()->SpawnActor<AStaticMeshActor>();
  Dome->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(
      nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere")));
  Dome->SetActorScale3D(FVector(19000));
  Dome->GetStaticMeshComponent()->SetCollisionEnabled(
      ECollisionEnabled::NoCollision);
  Dome->GetStaticMeshComponent()->SetCastShadow(false);
  Dome->GetStaticMeshComponent()->SetMaterial(
      0,
      LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Materials/M_Sky")));
  Ready = true;
  UE_LOG(LogTemp, Display,
         TEXT("TERRA_WORLD_READY terrain=%d trees=%d zones=%d"), N, Trees.Num(),
         Spawns.Num());
}
void ATerraWorld::RebuildGround(FIntPoint Key) {
  UProceduralMeshComponent *&Mesh = Ground.FindOrAdd(Key);
  if (!Mesh) {
    Mesh = NewObject<UProceduralMeshComponent>(this);
    Mesh->SetupAttachment(RootComponent);
    Mesh->RegisterComponent();
    Mesh->bUseAsyncCooking = true;
    Mesh->SetCollisionProfileName(TEXT("BlockAll"));
  }
  const int D = 32;
  float X0 = Key.X * 3200.f, Y0 = Key.Y * 3200.f;
  TArray<FVector> V, Nr;
  TArray<FVector2D> UV;
  TArray<FLinearColor> C;
  TArray<TArray<int32>> Indices;
  Indices.SetNum(7);
  for (int J = 0; J <= D; J++)
    for (int I = 0; I <= D; I++) {
      float X = X0 + I * 100, Y = Y0 + J * 100;
      V.Add(FVector(X, Y, BaseHeight(X, Y)));
      Nr.Add(FVector(BaseHeight(X - 25, Y) - BaseHeight(X + 25, Y),
                     BaseHeight(X, Y - 25) - BaseHeight(X, Y + 25), 50)
                 .GetSafeNormal());
      UV.Add(FVector2D(X / 350, Y / 350));
      C.Add(FLinearColor::White);
    }
  for (int J = 0; J < D; J++)
    for (int I = 0; I < D; I++) {
      float X = X0 + (I + .5f) * 100, Y = Y0 + (J + .5f) * 100;
      if (FMath::Abs(X) > 40000 || FMath::Abs(Y) > 40000)
        continue;
      if (Detail.Contains(
              {FMath::FloorToInt(X / TileCM), FMath::FloorToInt(Y / TileCM)}))
        continue;
      int A = J * (D + 1) + I;
      auto &T = Indices[SurfaceAt(X, Y)];
      T.Append({A, A + D + 1, A + 1, A + 1, A + D + 1, A + D + 2});
    }
  for (int S = 0; S < 7; S++) {
    Mesh->CreateMeshSection_LinearColor(S, V, Indices[S], Nr, UV, C, {}, true);
    if (Materials.IsValidIndex(S))
      Mesh->SetMaterial(S, Materials[S]);
  }
}
FTerraTile *ATerraWorld::EnsureTile(FIntPoint Key) {
  if (auto *T = Detail.Find(Key))
    return T;
  if (Detail.Num() >= 192)
    return nullptr;
  FTerraTile T;
  T.Key = Key;
  T.Delta.Init(0, (Div + 1) * (Div + 1));
  T.Packing.Init(0, T.Delta.Num());
  T.Mesh = NewObject<UProceduralMeshComponent>(this);
  T.Mesh->SetupAttachment(RootComponent);
  T.Mesh->RegisterComponent();
  T.Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
  for (int J = 0; J <= Div; J++)
    for (int I = 0; I <= Div; I++) {
      float X = Key.X * TileCM + I * CellCM, Y = Key.Y * TileCM + J * CellCM;
      T.Vertices.Add(FVector(X, Y, BaseHeight(X, Y)));
      T.Normals.Add(FVector::UpVector);
      T.UV.Add(FVector2D(X / 350, Y / 350));
      T.Colors.Add(FLinearColor::White);
    }
  FTerraTile &New = Detail.Add(Key, MoveTemp(T));
  UpdateTile(New);
  RebuildGround(
      {FMath::FloorToInt(Key.X / 4.f), FMath::FloorToInt(Key.Y / 4.f)});
  return &New;
}
void ATerraWorld::UpdateTile(FTerraTile &T) {
  TArray<FVector> V = T.Vertices;
  TArray<TArray<int32>> Idx;
  Idx.SetNum(7);
  for (int J = 0; J <= Div; J++)
    for (int I = 0; I <= Div; I++) {
      int A = J * (Div + 1) + I;
      V[A].Z += T.Delta[A];
      float X = V[A].X, Y = V[A].Y;
      T.Normals[A] = FVector(Height(X - 5, Y) - Height(X + 5, Y),
                             Height(X, Y - 5) - Height(X, Y + 5), 10)
                         .GetSafeNormal();
      float Shade = 1 - T.Packing[A] * .17f;
      T.Colors[A] = FLinearColor(Shade, Shade, Shade);
    }
  for (int J = 0; J < Div; J++)
    for (int I = 0; I < Div; I++) {
      int A = J * (Div + 1) + I;
      uint8 S = SurfaceAt(V[A].X + 6, V[A].Y + 6);
      Idx[S].Append({A, A + Div + 1, A + 1, A + 1, A + Div + 1, A + Div + 2});
    }
  for (int S = 0; S < 7; S++) {
    T.Mesh->CreateMeshSection_LinearColor(S, V, Idx[S], T.Normals, T.UV,
                                          T.Colors, {}, false);
    T.Mesh->SetMaterial(S, Materials[S]);
  }
  T.Dirty = false;
}
void ATerraWorld::Deform(FVector P, FVector F, float Load, float Pressure,
                         float Width, float Length, float Slip, float Speed,
                         float Dt) {
  auto S = Sample(P);
  if (S.MaxSink <= 0 || Load < 50)
    return;
  F.Z = 0;
  F.Normalize();
  FVector Side(-F.Y, F.X, 0);
  float HalfL = FMath::Max(.1f, Length * .5f) * 100,
        HalfW = FMath::Max(.09f, Width * .5f) * 100;
  struct FCell {
    FTerraTile *T;
    int I;
    float W;
  };
  TArray<FCell> Receivers;
  double Removed = 0;
  const float Radius = FMath::Max(HalfL, HalfW) + 55;
  // Allocate the bounded stencil before taking pointers (TMap growth moves
  // values).
  for (int X = FMath::FloorToInt((P.X - Radius) / TileCM);
       X <= FMath::FloorToInt((P.X + Radius) / TileCM); X++)
    for (int Y = FMath::FloorToInt((P.Y - Radius) / TileCM);
         Y <= FMath::FloorToInt((P.Y + Radius) / TileCM); Y++)
      EnsureTile({X, Y});
  const float Target = TerraSim::SoilTarget(S.MaxSink,Load,Width,Length,Slip);
  for (int X = FMath::FloorToInt((P.X - Radius) / TileCM);
       X <= FMath::FloorToInt((P.X + Radius) / TileCM); X++)
    for (int Y = FMath::FloorToInt((P.Y - Radius) / TileCM);
         Y <= FMath::FloorToInt((P.Y + Radius) / TileCM); Y++) {
      auto *T = Detail.Find({X, Y});
      if (!T)
        continue;
      for (int J = 1; J < Div; J++)
        for (int I = 1; I < Div; I++) {
          int A = J * (Div + 1) + I;
          FVector D = T->Vertices[A] - P;
          D.Z = 0;
          float U = FVector::DotProduct(D, F), V = FVector::DotProduct(D, Side);
          if (FMath::Abs(U) > HalfL + 42 || FMath::Abs(V) > HalfW + 42)
            continue;
          if (SurfaceAt(T->Vertices[A].X, T->Vertices[A].Y) != S.Surface)
            continue;
          if (FMath::Abs(U) < HalfL && FMath::Abs(V) < HalfW) {
            float Edge = (1 - Smooth(.62f, 1.f, FMath::Abs(V) / HalfW)) *
                         (1 - Smooth(.68f, 1.f, FMath::Abs(U) / HalfL));
            float Aim = -Target * 100 * (1 - T->Packing[A] * .45f) * Edge;
            float Delta = FMath::Max(
                0.f, (T->Delta[A] - Aim) *
                         (1 - FMath::Exp(-Dt * (1.8f + FMath::Abs(Speed) * .4f +
                                                FMath::Abs(Slip) * 3.f))));
            Delta = FMath::Min(Delta, 1.f);
            T->Delta[A] -= Delta;
            Removed += Delta * .01 * .125 * .125;
            T->Packing[A] =
                FMath::Clamp(T->Packing[A] + Dt * .05f * Edge, 0.f, 1.f);
            T->Dirty = true;
          } else {
            float SideB = FMath::Exp(-FMath::Square(
                              (FMath::Abs(V) - HalfW - 14) / 17.f)) *
                          (1 - Smooth(HalfL, HalfL + 35, FMath::Abs(U)));
            float Leading =
                FMath::Exp(-FMath::Square(
                    (U * (Speed < 0 ? -1 : 1) - HalfL - 12) / 19.f)) *
                (1 - Smooth(HalfW, HalfW + 25, FMath::Abs(V)));
            float W = SideB + Leading * .45f;
            if (W > .01f)
              Receivers.Add({T, A, W});
          }
        }
    }
  float Fraction = S.Surface == 6 ? .20f : S.Surface == 5 ? .68f : .82f;
  double Available = Removed * Fraction, Placed = 0;
  float Sum = 0;
  for (const auto &C : Receivers)
    Sum += C.W;
  for (auto &C : Receivers) {
    float Add =
        Sum > 0 ? float(Available * C.W / Sum / (.125 * .125) * 100) : 0;
    float Capacity = FMath::Max(0.f, 13 - C.T->Delta[C.I]);
    Add = FMath::Min(Add, Capacity);
    C.T->Delta[C.I] += Add;
    C.T->Dirty = true;
    Placed += Add * .01 * .125 * .125;
  }
  DepressedVolume += Removed;
  DisplacedVolume += Placed;
  CompactedVolume += Removed - Placed;
}
void ATerraWorld::LoadScenery() {
  for (auto G : Data->GetArrayField(TEXT("placements"))) {
    auto O = G->AsObject();
    auto *Mesh = LoadObject<UStaticMesh>(
        nullptr, *(TEXT("/Game/Meshes/") + O->GetStringField(TEXT("asset"))));
    auto *C = NewObject<UInstancedStaticMeshComponent>(this);
    C->SetupAttachment(RootComponent);
    C->SetStaticMesh(Mesh);
    C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    C->SetMobility(EComponentMobility::Movable);
    C->RegisterComponent();
    Scenery.Add(C);
    for (auto V : O->GetArrayField(TEXT("instances"))) {
      auto A = V->AsObject();
      auto Q = A->GetArrayField(TEXT("q"));
      FTransform T(FQuat(Q[0]->AsNumber(), Q[1]->AsNumber(), Q[2]->AsNumber(),
                         Q[3]->AsNumber()),
                   Vec(A->GetArrayField(TEXT("p"))),
                   Vec(A->GetArrayField(TEXT("s"))));
      int Expected = A->GetIntegerField(TEXT("index"));
      while (C->GetInstanceCount() < Expected)
        C->AddInstance(FTransform(FQuat::Identity, FVector(0, 0, -100000),
                                  FVector::ZeroVector));
      C->AddInstance(T);
    }
  }
  for (auto V : Data->GetArrayField(TEXT("trees"))) {
    auto O = V->AsObject();
    FTerraTree T;
    T.Base = Vec(O->GetArrayField(TEXT("p")));
    T.Height = O->GetNumberField(TEXT("height"));
    T.Radius = O->GetNumberField(TEXT("radius"));
    T.Collider = NewObject<UCapsuleComponent>(this);
    T.Collider->SetupAttachment(RootComponent);
    T.Collider->InitCapsuleSize(T.Radius, T.Height * .45f);
    T.Collider->SetCollisionProfileName(TEXT("BlockAll"));
    T.Collider->RegisterComponent();
    T.Collider->SetWorldLocation(T.Base + FVector(0, 0, T.Height * .45f));
    for (auto Part : O->GetArrayField(TEXT("parts"))) {
      auto A = Part->AsObject();
      int G = A->GetIntegerField(TEXT("group")),
          I = A->GetIntegerField(TEXT("index"));
      if (Scenery.IsValidIndex(G)) {
        FTransform Original;
        if (Scenery[G]->GetInstanceTransform(I, Original, true)) {
          T.Parts.Add({Scenery[G], I});
          T.Original.Add(Original);
        }
      }
    }
    Trees.Add(MoveTemp(T));
  }
  // Original boxes and finite logs stay physical in native Chaos.
  for (auto V : Data->GetArrayField(TEXT("obstacles"))) {
    auto O = V->AsObject();
    FString Type = O->GetStringField(TEXT("type"));
    if (Type == TEXT("tree"))
      continue;
    const TSharedPtr<FJsonObject> *Center = nullptr;
    if (O->TryGetObjectField(TEXT("center"), Center) &&
        O->HasField(TEXT("halfExtents"))) {
      auto H = O->GetObjectField(TEXT("halfExtents"));
      FVector P((*Center)->GetNumberField(TEXT("z")) * 100,
                -(*Center)->GetNumberField(TEXT("x")) * 100,
                (*Center)->GetNumberField(TEXT("y")) * 100);
      auto *C = NewObject<UBoxComponent>(this);
      C->SetupAttachment(RootComponent);
      C->InitBoxExtent(FVector(H->GetNumberField(TEXT("z")) * 100,
                               H->GetNumberField(TEXT("x")) * 100,
                               H->GetNumberField(TEXT("y")) * 100));
      C->SetCollisionProfileName(TEXT("BlockAll"));
      C->RegisterComponent();
      C->SetWorldLocation(P);
    }
  }
}
void ATerraWorld::HitTree(UPrimitiveComponent *C, FVector Impulse,
                          FVector Point) {
  for (auto &T : Trees)
    if (T.Collider == C && !T.Falling) {
      float Energy = Impulse.Size() / 100;
      T.Damage += Energy / (3000 + T.Radius * 100);
      if (T.Damage > 1) {
        T.Falling = true;
        T.Push = FVector(Impulse.X, Impulse.Y, 0).GetSafeNormal();
        T.Angle = .02;
        T.Omega = .1f;
      }
      break;
    }
}
void ATerraWorld::Tick(float Dt) {
  Super::Tick(Dt);
  if (!Ready)
    return;
  VisualTimer += Dt;
  if (VisualTimer > .08f) {
    VisualTimer = 0;
    int Count = 0;
    for (auto &Pair : Detail)
      if (Pair.Value.Dirty && Count++ < 8)
        UpdateTile(Pair.Value);
  }
  for (auto &T : Trees)
    if (T.Falling) {
      float Remaining = FMath::Min(Dt, .1f);
      while (Remaining > 0) {
        float H = FMath::Min(Remaining, 1.f / 120);
        Remaining -= H;
        T.Omega += (9.81f / (T.Height * .0067f) * FMath::Sin(T.Angle) -
                    .16f * T.Omega) *
                   H;
        float Next = FMath::Clamp(T.Angle + T.Omega * H, 0.f, 1.7f);
        FVector D =
            T.Push * FMath::Sin(Next) + FVector::UpVector * FMath::Cos(Next);
        bool Contact = false;
        for (float A = .1f; A <= 1.001f; A += .05f) {
          FVector P = T.Base + D * T.Height * A;
          if (P.Z < Height(P.X, P.Y) + T.Radius * .65f) {
            Contact = true;
            break;
          }
        }
        if (Contact) {
          T.Omega *= -.12f;
          if (FMath::Abs(T.Omega) < .035f)
            T.Omega = 0;
        } else
          T.Angle = Next;
      }
      FVector Axis =
          FVector::CrossProduct(FVector::UpVector, T.Push).GetSafeNormal();
      FQuat Q(Axis, T.Angle);
      T.Direction = Q.RotateVector(FVector::UpVector);
      T.Collider->SetWorldLocationAndRotation(
          T.Base + T.Direction * T.Height * .45f, Q);
      for (int I = 0; I < T.Parts.Num(); I++) {
        FTransform M = T.Original[I];
        M.SetLocation(T.Base + Q.RotateVector(M.GetLocation() - T.Base));
        M.SetRotation(Q * M.GetRotation());
        T.Parts[I].Key->UpdateInstanceTransform(T.Parts[I].Value, M, true, true,
                                                true);
      }
    }
}
void ATerraWorld::SetRain(bool Enabled) { Rain = Enabled; }
void ATerraWorld::ResetSoil() {
  for (auto &P : Detail) {
    P.Value.Mesh->DestroyComponent();
  }
  Detail.Empty();
  for (auto &P : Ground)
    RebuildGround(P.Key);
  DepressedVolume = DisplacedVolume = CompactedVolume = 0;
}
FVector ATerraWorld::FindAnchor(FVector P, float MaxDistance) const {
  FVector Best = FVector::ZeroVector;
  float D = MaxDistance;
  for (const auto &T : Trees)
    if (!T.Falling && T.Damage < .7f) {
      FVector B = T.Base + FVector(0, 0, 80);
      float Distance = FVector::Dist(P, B);
      if (Distance < D && Distance > 400) {
        D = Distance;
        Best = B;
      }
    }
  return Best;
}
