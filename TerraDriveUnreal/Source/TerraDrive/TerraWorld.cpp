#include "TerraWorld.h"
#include "TerraSimCore.h"
#include "TerraContact.h"
#include "Components/BoxComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/World.h"
#include "Engine/TextureCube.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/MemoryReader.h"

namespace {
constexpr int Div = 64;
// A 2.46-inch grid resolves tire shoulders instead of a two-vertex trough.
constexpr float TileCM = 400, CellCM = 6.25f;
constexpr float CellArea = .0625f*.0625f;
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
float ATerraWorld::LooseDirt(float X,float Y) const {
  if(SurfaceAt(X,Y)!=0)return 0;
  // Broad continuous loose-soil pockets, shared by physics and vertex material
  // data. Firm trails and loose dirt can coexist inside the dirt biome.
  const float Field=.5f+.5f*FMath::Sin(X*.0017f+FMath::Cos(Y*.0013f))*FMath::Sin(Y*.0019f-.8f);
  float Loose=Smooth(.65f,.92f,Field);
  if(X>8000&&X<29000&&Y> -36000&&Y< -15000&&QuarryTrailPolyline.Num()>1){
    const FVector2D P(X,Y);float Distance=FLT_MAX;
    for(int I=1;I<QuarryTrailPolyline.Num();++I){const FVector2D A=QuarryTrailPolyline[I-1],D=QuarryTrailPolyline[I]-A;
      const float T=FMath::Clamp(FVector2D::DotProduct(P-A,D)/D.SizeSquared(),0.,1.);Distance=FMath::Min(Distance,float((P-A-D*T).Size()));}
    // The pale quarry track is compacted earth. Loose shoulders remain soft;
    // the same 7.4-to-12.5-foot transition is used by the ground shader.
    Loose*=FMath::Lerp(.08f,1.f,Smooth(225,380,Distance));
  }
  return Loose;
}
float ATerraWorld::Height(float X, float Y) const {
  FIntPoint K(FMath::FloorToInt(X / TileCM), FMath::FloorToInt(Y / TileCM));
  const FTerraTile *T = Detail.Find(K);
  const FTerraSoilState *Cached=T?nullptr:SoilCache.Find(K);
  float H = BaseHeight(X, Y);
  if (!T&&!Cached)
    return H;
  float GX = FMath::Clamp((X - K.X * TileCM) / CellCM, 0.f, 63.9999f),
        GY = FMath::Clamp((Y - K.Y * TileCM) / CellCM, 0.f, 63.9999f);
  int I = FMath::FloorToInt(GX), J = FMath::FloorToInt(GY),
      A = J * (Div + 1) + I;
  float U = GX - I, V = GY - J;
  auto Z = [&](int Index) { return T?T->Vertices[Index].Z+T->Delta[Index]:
      BaseHeight(K.X*TileCM+(Index%(Div+1))*CellCM,K.Y*TileCM+(Index/(Div+1))*CellCM)+Cached->Delta[Index]; };
  return U + V <= 1
             ? Z(A) + (Z(A + 1) - Z(A)) * U + (Z(A + Div + 1) - Z(A)) * V
             : Z(A + Div + 2) + (Z(A + Div + 1) - Z(A + Div + 2)) * (1 - U) +
                   (Z(A + 1) - Z(A + Div + 2)) * (1 - V);
}
FTerraSample ATerraWorld::Sample(FVector P) const {
  FTerraSample S;
  S.Height = Height(P.X, P.Y);
  S.Displacement=(S.Height-BaseHeight(P.X,P.Y))/100;
  S.RutDepth = FMath::Max(0.f,BaseHeight(P.X,P.Y)-S.Height)/100;
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
  if(S.Surface==0){const float Loose=LooseDirt(P.X,P.Y);
    S.MaxSink+=Loose*.24f;S.Softness+=Loose*.65f;S.Rolling*=1+Loose*2.f;}
  if (N) {
    int I = FMath::Clamp(FMath::RoundToInt((P.X / 100 - Origin) / Step), 0,
                         N - 1),
        J = FMath::Clamp(FMath::RoundToInt((P.Y / 100 - Origin) / Step), 0,
                         N - 1);
    S.Water = FMath::Max(0.f, 100 * Water[I * N + J] + BaseHeight(P.X, P.Y) -
                                  S.Height);
  }
  FIntPoint K(FMath::FloorToInt(P.X / TileCM), FMath::FloorToInt(P.Y / TileCM));
  const auto *T = Detail.Find(K);const auto *Cached=T?nullptr:SoilCache.Find(K);
  if (T||Cached) {
    int I = FMath::Clamp(FMath::RoundToInt((P.X - K.X * TileCM) / CellCM), 0,
                         Div),
        J = FMath::Clamp(FMath::RoundToInt((P.Y - K.Y * TileCM) / CellCM), 0,
                         Div);
    S.Packing = T?T->Packing[J*(Div+1)+I]:Cached->Packing[J*(Div+1)+I];
    S.Mu += S.Surface == 6 ? S.Packing * .23f : 0;
    S.Rolling *= 1 - S.Packing * .35f;
  }
  return S;
}
FTerraSupport ATerraWorld::GroundSupport(FVector Mount,FVector Up,float RadiusCM,
    float MinCM,float MaxCM) const {
  FTerraSupport Result;
  Up = Up.GetSafeNormal();
  // A tire's finite suspension ray points away from the ground on a rolled
  // chassis. Never invent a world-vertical contact behind that ray.
  if (Up.Z > .15f) {
    float D = (Mount.Z - Height(Mount.X, Mount.Y) - RadiusCM) / Up.Z;
    FVector Normal = FVector::UpVector, P;
    for (int I = 0; I < 5; ++I) {
      const FVector Center = Mount - Up * D;
      const auto S = Sample(Center);
      Normal = S.Normal;
      const float Alignment = FVector::DotProduct(Up, Normal);
      if (Alignment <= .15f) break;
      D += (FVector::DotProduct(Center - FVector(Center.X, Center.Y, S.Height), Normal) - RadiusCM) / Alignment;
    }
    P = Mount - Up * D - Normal * RadiusCM;
    if (TerraSim::ValidSupport(D, MinCM, MaxCM, FVector::DotProduct(Up, Normal)) &&
        FMath::Abs(P.Z - Height(P.X, P.Y)) < 12) {
      Result = {P, Normal, D, true, false, Sample(P).Surface};
    }
  }
  return Result;
}
FTerraSupport ATerraWorld::CastSupport(FVector Mount, FVector Up, float RadiusCM,
    float MinCM, float MaxCM, const AActor *Ignore, bool *RigidEncountered) const {
  Up=Up.GetSafeNormal();
  auto Result=GroundSupport(Mount,Up,RadiusCM,MinCM,MaxCM);
  FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraSuspension), true, Ignore);
  TArray<FHitResult> Hits;
  GetWorld()->SweepMultiByChannel(Hits, Mount - Up * MinCM, Mount - Up * MaxCM,
      FQuat::Identity, ECC_Visibility, FCollisionShape::MakeSphere(RadiusCM), Params);
  for (const auto &Hit : Hits) {
    if (!Hit.Component.IsValid() || Hit.Component->ComponentHasTag(TEXT("TerraGround"))) continue;
    if(RigidEncountered)*RigidEncountered=true;
    if(Hit.bStartPenetrating)continue;
    const float D = MinCM + Hit.Distance;
    if (!TerraSim::ValidSupport(D, MinCM, MaxCM, FVector::DotProduct(Up, Hit.ImpactNormal))) continue;
    if (!Result.Hit || D < Result.Distance) {
      // Logs, trunks and obstacle boxes are rigid support too; their tires
      // must not excavate the soil underneath as if it were the contact.
      const bool Built = true;
      const uint8 Surface = Built ? (Hit.Component->ComponentHasTag(TEXT("TerraRock")) ? 4 : 1) : Sample(Hit.ImpactPoint).Surface;
      Result = {Hit.ImpactPoint, Hit.ImpactNormal, D, true, Built, Surface};
    }
  }
  return Result;
}
FTerraSupport ATerraWorld::CastTireSupport(FVector Mount,FVector Up,FVector Forward,
    float RadiusCM,float WidthCM,float MinCM,float MaxCM,const AActor *Ignore) const {
  Up=Up.GetSafeNormal();
  bool RigidEncountered=false;
  auto Central=CastSupport(Mount,Up,RadiusCM,MinCM,MaxCM,Ignore,&RigidEncountered);
  FTerraSupport Best;
  const FVector Side=FVector::CrossProduct(Up,Forward).GetSafeNormal();
  // A sphere is useful for rolling contact, but it is wider than a real tire.
  // Reject its side hits beyond the physical tread instead of gaining grip
  // on a boulder beside the wheel. The small margin covers rounded shoulders.
  if(Central.Hit&&Central.Constructed&&
      FMath::Abs(FVector::DotProduct(Central.Point-Mount,Side))>WidthCM*.5f+2.f){
    // On a broad banked face, the real shoulder can still carry load. Solve
    // the finite cylinder against that face and confirm the shoulder point
    // exists on actual geometry; an isolated rock outside the tread fails.
    const FVector Nrm=Central.Normal;
    const float NSide=FVector::DotProduct(Nrm,Side),Alignment=FVector::DotProduct(Nrm,Up);
    const FVector CircleNormal=(Nrm-Side*NSide).GetSafeNormal();
    const float Extent=RadiusCM*FVector::DotProduct(Nrm,CircleNormal)+WidthCM*.5f*FMath::Abs(NSide);
    const float Distance=(FVector::DotProduct(Mount-Central.Point,Nrm)-Extent)/FMath::Max(.15f,Alignment);
    const FVector Point=Mount-Up*Distance-CircleNormal*RadiusCM-Side*(FMath::Sign(NSide)*WidthCM*.5f);
    FHitResult Shoulder;FCollisionQueryParams Q(SCENE_QUERY_STAT(TerraTreadWidth),true,Ignore);
    if(TerraSim::ValidSupport(Distance,MinCM,MaxCM,Alignment)&&
        GetWorld()->LineTraceSingleByChannel(Shoulder,Point+Nrm*6,Point-Nrm*6,ECC_Visibility,Q)&&
        Shoulder.Component.IsValid()&&FVector::Dist(Shoulder.ImpactPoint,Point)<2&&
        FVector::DotProduct(Shoulder.ImpactNormal,Up)>.15f&&!Shoulder.Component->ComponentHasTag(TEXT("TerraGround"))){
      Central.Point=Shoulder.ImpactPoint;Central.Normal=Shoulder.ImpactNormal;Central.Distance=Distance;
    }else Central=FTerraSupport();
  }
  if(RigidEncountered&&(!Central.Hit||!Central.Constructed)){
    // A rejected sphere side-hit is not evidence that the real tread has no
    // floor. On an articulated rock ledge that erased suspension support.
    // Trace points on a finite cylindrical tire instead. Starting above the
    // upper tread also handles an initial sphere overlap without accepting
    // an overlap normal or extending the permitted suspension travel.
    FCollisionQueryParams Q(SCENE_QUERY_STAT(TerraRigidTread),true,Ignore);
    for(float L:{-.8f,-.4f,0.f,.4f,.8f})for(float W:{-.45f,0.f,.45f}){
      const float Arc=RadiusCM*FMath::Sqrt(1-L*L);
      const FVector Offset=Forward*(RadiusCM*L)+Side*(WidthCM*W);
      FHitResult H;
      if(!GetWorld()->LineTraceSingleByChannel(H,Mount+Offset+Up*(RadiusCM-MinCM+4),
          Mount+Offset-Up*(MaxCM+Arc),ECC_Visibility,Q)||!H.Component.IsValid()||
          H.Component->ComponentHasTag(TEXT("TerraGround")))continue;
      const float D=FVector::DotProduct(Mount+Offset-H.ImpactPoint,Up)-Arc;
      if(!TerraSim::ValidSupport(D,MinCM,MaxCM,FVector::DotProduct(Up,H.ImpactNormal)))continue;
      if(!Central.Hit||!Central.Constructed||D<Central.Distance)
        Central={H.ImpactPoint,H.ImpactNormal,D,true,true,uint8(H.Component->ComponentHasTag(TEXT("TerraRock"))?4:1)};
    }
  }
  // A circular rolling envelope at three points across the real tread width.
  // The shoulder/front samples can bridge a narrow rut or meet a bump before
  // the axle is directly above it. No probe can reach behind its suspension.
  TArray<FTerraSupport,TInlineAllocator<9>> Contacts;
  for(float L:{-.60f,0.f,.60f})for(float W:{-.42f,0.f,.42f}){
    auto S=GroundSupport(Mount+Forward*(RadiusCM*L)+Side*(WidthCM*W),Up,
                         RadiusCM*FMath::Sqrt(1-L*L),MinCM,MaxCM);
    if(S.Hit){Contacts.Add(S);if(!Best.Hit||S.Distance<Best.Distance)Best=S;}
  }
  if(Best.Hit){
    FVector Normal=FVector::ZeroVector,Point=FVector::ZeroVector;float Weight=0;
    for(const auto &S:Contacts){
      const float W=FMath::Max(0.f,1.f-(S.Distance-Best.Distance)/2.f);
      Normal+=S.Normal*W;Point+=S.Point*W;Weight+=W;
    }
    Best.Normal=Normal.GetSafeNormal();if(Weight>0)Best.Point=Point/Weight;
  }
  if(Central.Hit&&Central.Constructed&&(!Best.Hit||Central.Distance<Best.Distance))return Central;
  return Best.Hit?Best:Central;
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
  // A soft, unshadowed ground-bounce light keeps the underside of the loop
  // and an inverted vehicle readable in this non-baked procedural world.
  auto *Bounce = GetWorld()->SpawnActor<ADirectionalLight>(FVector(0,0,-10000),FRotator(62,140,0));
  Bounce->GetLightComponent()->SetMobility(EComponentMobility::Movable);
  Bounce->GetLightComponent()->SetIntensity(.65f);
  Bounce->GetLightComponent()->SetLightColor(FLinearColor(.74f,.68f,.60f));
  Bounce->GetLightComponent()->SetCastShadows(false);
  auto *Sky = GetWorld()->SpawnActor<ASkyLight>();
  Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable);
  Sky->GetLightComponent()->SetIntensity(.45f);
  Sky->GetLightComponent()->SourceType=SLS_SpecifiedCubemap;
  Sky->GetLightComponent()->SetCubemap(LoadObject<UTextureCube>(nullptr,TEXT("/Game/Textures/kloofendal_48d_partly_cloudy_puresky_1k")));
  // Ground bounce keeps downward-facing surfaces readable inside the loop.
  // The default black lower hemisphere makes the inverted car disappear.
  Sky->GetLightComponent()->SetLowerHemisphereColor(FLinearColor(.16f,.14f,.11f));
  Sky->GetLightComponent()->bRealTimeCapture = false;
  auto *Fog = GetWorld()->SpawnActor<AExponentialHeightFog>();
  Fog->GetComponent()->SetFogDensity(.006f);
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
    Mesh->ComponentTags.Add(TEXT("TerraGround"));
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
      C.Add(FLinearColor(1,LooseDirt(X,Y),1));
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
  if(Detail.Num()>=FMath::Clamp(ActiveTileLimit,8,768)){
    FIntPoint Farthest=Key;double Distance=-1;
    for(const auto &Pair:Detail){const double D=FMath::Square(double(Pair.Key.X-Key.X))+FMath::Square(double(Pair.Key.Y-Key.Y));
      if(D>Distance){Distance=D;Farthest=Pair.Key;}}
    auto &Old=Detail.FindChecked(Farthest);
    FTerraSoilState State;State.Delta=MoveTemp(Old.Delta);State.Packing=MoveTemp(Old.Packing);
    SoilCache.Add(Farthest,MoveTemp(State));Old.Mesh->DestroyComponent();Detail.Remove(Farthest);
    RebuildGround({FMath::FloorToInt(Farthest.X/8.f),FMath::FloorToInt(Farthest.Y/8.f)});
    // Bound offscreen history separately. Exhausting render tiles must never
    // disable new ruts everywhere, as the former fixed pool did.
    if(SoilCache.Num()>8192){
      FIntPoint Drop=Key;double Far=-1;
      for(const auto &Pair:SoilCache){const double D=FMath::Square(double(Pair.Key.X-Key.X))+FMath::Square(double(Pair.Key.Y-Key.Y));
        if(D>Far){Far=D;Drop=Pair.Key;}}
      SoilCache.Remove(Drop);
    }
  }
  FTerraTile T;
  T.Key = Key;
  if(auto *Stored=SoilCache.Find(Key)){
    T.Delta=MoveTemp(Stored->Delta);T.Packing=MoveTemp(Stored->Packing);SoilCache.Remove(Key);
  }else{
    T.Delta.Init(0,(Div+1)*(Div+1));T.Packing.Init(0,T.Delta.Num());
  }
  T.Mesh = NewObject<UProceduralMeshComponent>(this);
  T.Mesh->SetupAttachment(RootComponent);
  T.Mesh->RegisterComponent();
  T.Mesh->SetCollisionProfileName(TEXT("BlockAll"));
  T.Mesh->ComponentTags.Add(TEXT("TerraGround"));
  T.Mesh->bUseAsyncCooking = true;
  for (int J = 0; J <= Div; J++)
    for (int I = 0; I <= Div; I++) {
      float X = Key.X * TileCM + I * CellCM, Y = Key.Y * TileCM + J * CellCM;
      T.Vertices.Add(FVector(X, Y, BaseHeight(X, Y)));
      T.Normals.Add(FVector::UpVector);
      T.UV.Add(FVector2D(X / 350, Y / 350));
      T.Colors.Add(FLinearColor(1,LooseDirt(X,Y),1));
    }
  FTerraTile &New = Detail.Add(Key, MoveTemp(T));
  UpdateTile(New);
  RebuildGround(
      {FMath::FloorToInt(Key.X / 8.f), FMath::FloorToInt(Key.Y / 8.f)});
  return &New;
}
void ATerraWorld::ActivateSoil(FVector P,float RadiusCM){
  for(int X=FMath::FloorToInt((P.X-RadiusCM)/TileCM);X<=FMath::FloorToInt((P.X+RadiusCM)/TileCM);++X)
    for(int Y=FMath::FloorToInt((P.Y-RadiusCM)/TileCM);Y<=FMath::FloorToInt((P.Y+RadiusCM)/TileCM);++Y)
      if(SoilCache.Contains({X,Y}))EnsureTile({X,Y});
}
void ATerraWorld::UpdateTile(FTerraTile &T) {
  TArray<FVector> V = T.Vertices;
  TArray<TArray<int32>> Idx;
  const bool Create=T.Mesh->GetNumSections()==0;
  if(Create)Idx.SetNum(7);
  for(int A=0;A<V.Num();++A)V[A].Z+=T.Delta[A];
  for (int J = 0; J <= Div; J++)
    for (int I = 0; I <= Div; I++) {
      int A = J * (Div + 1) + I;
      float X = V[A].X, Y = V[A].Y;
      // At grid nodes the old short probes interpolated these same adjacent
      // heights. Read local vertices directly; only boundary probes need the
      // neighbouring tile. The loose-soil field depends on XY and is cached.
      const float Left=I>0?V[A-1].Z:Height(X-CellCM,Y),Right=I<Div?V[A+1].Z:Height(X+CellCM,Y);
      const float Down=J>0?V[A-Div-1].Z:Height(X,Y-CellCM),Up=J<Div?V[A+Div+1].Z:Height(X,Y+CellCM);
      T.Normals[A] = FVector(Left-Right,Down-Up,CellCM*2)
                         .GetSafeNormal();
      T.Colors[A].R=1-T.Packing[A];
    }
  if(Create)for (int J = 0; J < Div; J++)
    for (int I = 0; I < Div; I++) {
      int A = J * (Div + 1) + I;
      uint8 S = SurfaceAt(V[A].X + 6, V[A].Y + 6);
      Idx[S].Append({A, A + Div + 1, A + 1, A + 1, A + Div + 1, A + Div + 2});
    }
  for (int S = 0; S < 7; S++) {
    auto *Section=T.Mesh->GetProcMeshSection(S);
    if(Section&&Section->ProcVertexBuffer.IsEmpty())Section=nullptr;
    if (!Section&&(!Create||Idx[S].IsEmpty())) continue;
    // Topology is fixed. Update both render and collision vertices in place;
    // repeatedly cooking new bodies for every rut wastes memory and CPU.
    if (Section)
      T.Mesh->UpdateMeshSection_LinearColor(S,V,T.Normals,T.UV,T.Colors,{});
    else{
      T.Mesh->CreateMeshSection_LinearColor(S,V,Idx[S],T.Normals,T.UV,T.Colors,{},true);
      T.Mesh->SetMaterial(S, Materials[S]);
    }
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
  if(!F.Normalize())return;
  FVector Side(-F.Y, F.X, 0);
  const float CellReach=CellCM*.5f*(FMath::Abs(F.X)+FMath::Abs(F.Y));
  float HalfL = FMath::Max(.025f, Length * .5f) * 100,
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
      // Each world grid node has one owner (left/bottom inclusive). Border
      // copies are synchronized below so tires do not hit undeformed seams.
      const int MinI=FMath::Clamp(FMath::FloorToInt((P.X-Radius-X*TileCM)/CellCM),0,Div-1);
      const int MaxI=FMath::Clamp(FMath::CeilToInt((P.X+Radius-X*TileCM)/CellCM),0,Div-1);
      const int MinJ=FMath::Clamp(FMath::FloorToInt((P.Y-Radius-Y*TileCM)/CellCM),0,Div-1);
      const int MaxJ=FMath::Clamp(FMath::CeilToInt((P.Y+Radius-Y*TileCM)/CellCM),0,Div-1);
      for (int J = MinJ; J <= MaxJ; J++)
        for (int I = MinI; I <= MaxI; I++) {
          int A = J * (Div + 1) + I;
          FVector D = T->Vertices[A] - P;
          D.Z = 0;
          float U = FVector::DotProduct(D, F), V = FVector::DotProduct(D, Side);
          if (FMath::Abs(U) > HalfL + 42 || FMath::Abs(V) > HalfW + 42)
            continue;
          if (SurfaceAt(T->Vertices[A].X, T->Vertices[A].Y) != S.Surface)
            continue;
          if (FMath::Abs(U) < HalfL+CellReach && FMath::Abs(V) < HalfW+CellReach) {
            // Area-weighted cells keep short contact patches effective even
            // when their center lies between grid nodes.
            float Edge=TerraSim::FootprintCoverage(U,HalfL,CellReach)*
                       TerraSim::FootprintCoverage(V,HalfW,CellReach);
            // Packing stiffens subsequent passes but never raises an already
            // compacted groove. Rolling load creates a rut without wheelspin.
            float Aim = -Target * 100 * Edge;
            const float Response=TerraSim::SoilResponse(Dt,Speed,Length,Slip,T->Packing[A]);
            float Delta = FMath::Max(
                0.f, (T->Delta[A] - Aim) * Response);
            Delta = FMath::Min(Delta, 5.f);
            T->Delta[A] -= Delta;
            Removed += Delta * .01 * CellArea;
            T->Packing[A] =
                FMath::Clamp(T->Packing[A]+(1-T->Packing[A])*Response*Edge,0.f,1.f);
            T->Dirty = true;
          } else {
            float SideB = FMath::Exp(-FMath::Square(
                              (FMath::Abs(V) - HalfW - 9) / 9.f)) *
                          (1 - Smooth(HalfL, HalfL + 14, FMath::Abs(U)));
            float Leading =
                FMath::Exp(-FMath::Square(
                    (U * (Speed < 0 ? -1 : 1) - HalfL - 9) / 12.f)) *
                (1 - Smooth(HalfW, HalfW + 12, FMath::Abs(V)));
            float W = SideB + Leading * .15f;
            if (W > .01f)
              Receivers.Add({T, A, W});
          }
        }
    }
  float Fraction = S.Surface == 6 ? .35f : S.Surface == 5 ? .78f : S.Surface==0?FMath::Lerp(.10f,.78f,LooseDirt(P.X,P.Y)):.82f;
  double Available = Removed * Fraction, Placed = 0;
  float Sum = 0;
  for (const auto &C : Receivers)
    Sum += C.W;
  for (auto &C : Receivers) {
    float Add =
        Sum > 0 ? float(Available * C.W / Sum / CellArea * 100) : 0;
    float Capacity = FMath::Max(0.f, 22 - C.T->Delta[C.I]);
    Add = FMath::Min(Add, Capacity);
    C.T->Delta[C.I] += Add;
    C.T->Dirty = true;
    Placed += Add * .01 * CellArea;
  }
  DepressedVolume += Removed;
  DisplacedVolume += Placed;
  CompactedVolume += Removed - Placed;
  if(S.Surface==0||S.Surface==3)CrushPlants(P,F,HalfW,HalfL,FMath::Clamp(Load/3500.f,0.f,1.f));
  for(int X=FMath::FloorToInt((P.X-Radius)/TileCM)-1;X<=FMath::FloorToInt((P.X+Radius)/TileCM);++X)
    for(int Y=FMath::FloorToInt((P.Y-Radius)/TileCM)-1;Y<=FMath::FloorToInt((P.Y+Radius)/TileCM);++Y){
      auto *T=Detail.Find({X,Y});auto *Cached=T?nullptr:SoilCache.Find({X,Y});if(!T&&!Cached)continue;
      auto &Delta=T?T->Delta:Cached->Delta;auto &Packing=T?T->Packing:Cached->Packing;
      auto Copy=[&](int Destination,FIntPoint SourceKey,int Source){
        const auto *Active=Detail.Find(SourceKey);const auto *Stored=Active?nullptr:SoilCache.Find(SourceKey);
        if(!Active&&!Stored)return;
        const float D=Active?Active->Delta[Source]:Stored->Delta[Source],C=Active?Active->Packing[Source]:Stored->Packing[Source];
        if(Delta[Destination]!=D||Packing[Destination]!=C){Delta[Destination]=D;Packing[Destination]=C;if(T)T->Dirty=true;}
      };
      for(int I=0;I<Div;++I){Copy(I*(Div+1)+Div,{X+1,Y},I*(Div+1));Copy(Div*(Div+1)+I,{X,Y+1},I);}
      Copy(Div*(Div+1)+Div,{X+1,Y+1},0);
    }
}
void ATerraWorld::LoadScenery() {
  QuarryTrailPolyline.Empty();
  const TSharedPtr<FJsonObject>* Trail=nullptr;
  if(Data->TryGetObjectField(TEXT("quarryTrail"),Trail)){
    const auto Samples=(*Trail)->GetArrayField(TEXT("samples"));
    for(int I=0;I<Samples.Num();I+=6){const auto P=Samples[I]->AsObject();QuarryTrailPolyline.Add(FVector2D(P->GetNumberField(TEXT("x"))*100,P->GetNumberField(TEXT("y"))*100));}
  }
  const TArray<TSharedPtr<FJsonValue>> *Built = nullptr;
  if (Data->TryGetArrayField(TEXT("constructed"), Built)) for (auto V : *Built) {
    auto O = V->AsObject();
    const FString Visual = O->GetStringField(TEXT("asset"));
    FString Collision = Visual;
    O->TryGetStringField(TEXT("collision"), Collision);
    for (int Pass = 0; Pass < (Visual == Collision ? 1 : 2); ++Pass) {
      auto *C = NewObject<UStaticMeshComponent>(this);
      C->SetupAttachment(RootComponent);
      C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, *(TEXT("/Game/Meshes/") + (Pass == 0 ? Visual : Collision))));
      const bool Physical = Visual == Collision || Pass == 1;
      C->SetCollisionProfileName(Physical ? TEXT("BlockAll") : TEXT("NoCollision"));
      C->ComponentTags.Add(TEXT("TerraConstructed"));
      if (O->GetIntegerField(TEXT("surface")) == 4) C->ComponentTags.Add(TEXT("TerraRock"));
      C->SetVisibility(Pass == 0);
      C->SetCastShadow(Pass == 0);
      C->RegisterComponent();
      ConstructedMeshes.Add(C);
      if (C->GetStaticMesh()) ++ConstructedMeshCount;
    }
  }
  const TArray<TSharedPtr<FJsonValue>> *RouteData = nullptr;
  if (Data->TryGetArrayField(TEXT("routes"), RouteData)) for (auto V : *RouteData) {
    auto O = V->AsObject(); FTerraRoute R;
    R.Name = O->GetStringField(TEXT("name")); R.Hint = O->GetStringField(TEXT("hint"));
    R.Spawn = Vec(O->GetArrayField(TEXT("spawn"))); R.Yaw = O->GetNumberField(TEXT("yaw"));
    R.Zone = O->GetIntegerField(TEXT("zone")); R.GateWidth = O->GetNumberField(TEXT("gateWidth"));
    for (auto G : O->GetArrayField(TEXT("gates"))) R.Gates.Add(Vec(G->AsArray()));
    const TArray<TSharedPtr<FJsonValue>> *Directions = nullptr;
    if (O->TryGetArrayField(TEXT("gateDirections"),Directions))
      for (auto D : *Directions) R.GateDirections.Add(D->AsNumber()<0?-1:1);
    Routes.Add(R);
  }
  if (Spawns.IsValidIndex(8) && Routes.IsValidIndex(4)) Spawns[8] = Routes[4].Spawn;
  for (auto G : Data->GetArrayField(TEXT("placements"))) {
    auto O = G->AsObject();
    auto *Mesh = LoadObject<UStaticMesh>(
        nullptr, *(TEXT("/Game/Meshes/") + O->GetStringField(TEXT("asset"))));
    auto *C = NewObject<UInstancedStaticMeshComponent>(this);
    C->SetupAttachment(RootComponent);
    C->SetStaticMesh(Mesh);
    C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    C->SetMobility(EComponentMobility::Movable);
    C->SetNumCustomDataFloats(3);
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
      const int Instance=C->AddInstance(T);
      bool Bend=false;O->TryGetBoolField(TEXT("crushable"),Bend);
      if(Bend)RegisterCrushable(C,Instance);
      const TArray<TSharedPtr<FJsonValue>> *Color=nullptr;
      for(int Channel=0;Channel<3;++Channel)
        C->SetCustomDataValue(Instance,Channel,A->TryGetArrayField(TEXT("color"),Color)?float((*Color)[Channel]->AsNumber()):1.f);
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
  const TArray<TSharedPtr<FJsonValue>> *Details=nullptr;
  const TSharedPtr<FJsonObject> *Fab=nullptr;
  if(Data->TryGetObjectField(TEXT("fabScenery"),Fab)&&(*Fab)->GetBoolField(TEXT("enabled"))){
    for(auto Group:(*Fab)->GetArrayField(TEXT("groups"))){
      const auto O=Group->AsObject();
      auto *Mesh=LoadObject<UStaticMesh>(nullptr,*(TEXT("/Game/FabScenery/Meshes/")+O->GetStringField(TEXT("asset"))));
      if(!ensureMsgf(Mesh,TEXT("Enabled Fab scenery mesh is missing")))continue;
      auto *C=NewObject<UInstancedStaticMeshComponent>(this);C->SetupAttachment(RootComponent);C->SetStaticMesh(Mesh);
      const bool Solid=O->GetBoolField(TEXT("solid"));
      C->SetCollisionProfileName(Solid?TEXT("BlockAll"):TEXT("NoCollision"));
      if(!Solid)C->SetMobility(EComponentMobility::Movable);
      if(Solid){C->ComponentTags.Add(TEXT("TerraConstructed"));C->ComponentTags.Add(TEXT("TerraRock"));}
      C->ComponentTags.Add(TEXT("TerraFabScenery"));
      C->SetCullDistances(16000,36000);C->RegisterComponent();Scenery.Add(C);++FabAssetCount;
      const FBox Bounds=Mesh->GetBoundingBox();
      const FVector Anchor(Bounds.GetCenter().X,Bounds.GetCenter().Y,Bounds.Min.Z);
      int Snapped=0,Traced=0;
      for(auto Instance:O->GetArrayField(TEXT("instances"))){
        const auto A=Instance->AsObject();const auto Q=A->GetArrayField(TEXT("q"));
        FTransform T(FQuat(Q[0]->AsNumber(),Q[1]->AsNumber(),Q[2]->AsNumber(),Q[3]->AsNumber()),Vec(A->GetArrayField(TEXT("p"))),Vec(A->GetArrayField(TEXT("s"))));
        FHitResult FabGroundHit;FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraFabGround),true);
        for(auto Ignore:Scenery)Query.AddIgnoredComponent(Ignore.Get());
        for(const auto &Tree:Trees)Query.AddIgnoredComponent(Tree.Collider);
        FVector P=T.GetLocation();
        const FTerraSample Natural=Sample(P);float GroundZ=Natural.Height;FVector GroundNormal=Natural.Normal;
        // Distant coarse terrain collision is streamed. Its native triangle
        // height remains available even when there is no loaded query mesh.
        // Rigid quarry approaches/courses override that natural height.
        if(GetWorld()->LineTraceSingleByChannel(FabGroundHit,P+FVector(0,0,10000),P-FVector(0,0,10000),ECC_Visibility,Query)){
          GroundZ=FabGroundHit.ImpactPoint.Z;GroundNormal=FabGroundHit.ImpactNormal;++Traced;
        }
        const FVector Forward=FVector::VectorPlaneProject(T.GetRotation().GetForwardVector(),GroundNormal).GetSafeNormal();
        if(!Forward.IsNearlyZero())T.SetRotation(FRotationMatrix::MakeFromXZ(Forward,GroundNormal).ToQuat());
        const FString Kind=O->GetStringField(TEXT("kind"));
        const float Fraction=Kind==TEXT("grass")?.02f:Kind==TEXT("outcrop")||Kind==TEXT("ledge")?.38f:Kind==TEXT("rubble")?.24f:.14f;
        P.Z=GroundZ-FMath::Max(2.f,float(Bounds.GetSize().Z*T.GetScale3D().Z)*Fraction);T.SetLocation(P);++Snapped;
        // Source pivots differ. Place the bottom-centre of each imported mesh
        // on the authored ground anchor, with its slope/yaw/scale applied.
        T.AddToTranslation(-T.TransformVector(Anchor));
        const int32 Index=C->AddInstance(T);
        if(Kind==TEXT("grass"))RegisterCrushable(C,Index);
        ++FabInstanceCount;++DetailInstanceCount;if(Solid)++SolidDetailCount;
      }
      UE_LOG(LogTemp,Display,TEXT("TERRA_FAB_GROUNDED %s %d/%d"),*O->GetStringField(TEXT("asset")),Snapped,O->GetArrayField(TEXT("instances")).Num());
      UE_LOG(LogTemp,Display,TEXT("TERRA_FAB_TRACED %s %d"),*O->GetStringField(TEXT("asset")),Traced);
    }
  }
  if(Data->TryGetArrayField(TEXT("nativeDetails"),Details))for(auto V:*Details){
    auto O=V->AsObject();auto *C=NewObject<UInstancedStaticMeshComponent>(this);
    C->SetupAttachment(RootComponent);
    C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,*(TEXT("/Game/Meshes/")+O->GetStringField(TEXT("asset")))));
    const bool Solid=O->GetBoolField(TEXT("solid"));
    C->SetCollisionProfileName(Solid?TEXT("BlockAll"):TEXT("NoCollision"));
    C->SetNumCustomDataFloats(3);
    C->SetMobility(EComponentMobility::Movable);
    if(Solid){C->ComponentTags.Add(TEXT("TerraConstructed"));C->ComponentTags.Add(TEXT("TerraRock"));}
    C->SetCullDistances(Solid?8000:3500,Solid?22000:11000);
    if(O->GetStringField(TEXT("asset")).StartsWith(TEXT("native_boulder")))C->SetMaterial(0,Materials[4]);
    C->RegisterComponent();Scenery.Add(C);
    for(auto I:O->GetArrayField(TEXT("instances"))){
      auto A=I->AsObject();const auto Q=A->GetArrayField(TEXT("q"));
      const int Index=C->AddInstance(FTransform(FQuat(Q[0]->AsNumber(),Q[1]->AsNumber(),Q[2]->AsNumber(),Q[3]->AsNumber()),Vec(A->GetArrayField(TEXT("p"))),Vec(A->GetArrayField(TEXT("s")))));
      const auto Color=A->GetArrayField(TEXT("color"));
      if(!Solid)RegisterCrushable(C,Index);
      for(int Channel=0;Channel<3;++Channel)C->SetCustomDataValue(Index,Channel,Color[Channel]->AsNumber());
      ++DetailInstanceCount;if(Solid)++SolidDetailCount;
    }
    C->MarkRenderStateDirty();
  }
}
void ATerraWorld::RegisterCrushable(UInstancedStaticMeshComponent *Mesh,int32 Index){
  FTransform Original;if(!Mesh->GetInstanceTransform(Index,Original,true))return;
  if(Original.GetScale3D().IsNearlyZero())return;
  const FVector P=Original.GetLocation();
  const int32 Entry=Crushable.Add({Mesh,Index,Original,0});
  PlantGrid.FindOrAdd({FMath::FloorToInt32(P.X/400),FMath::FloorToInt32(P.Y/400)}).Add(Entry);
}
FVector ATerraWorld::NearestCrushable(FVector P) const{
  FVector Best=P;double Distance=TNumericLimits<double>::Max();
  for(const auto &Plant:Crushable){const auto Q=Plant.Original.GetLocation();
    if(SurfaceAt(Q.X,Q.Y)!=0)continue;
    const double D=FVector::DistSquared2D(P,Q);if(D<Distance){Best=Q;Distance=D;}}
  return Best;
}
void ATerraWorld::CrushPlants(FVector P,FVector F,float HalfW,float HalfL,float Strength){
  const float Radius=FMath::Max(HalfW,HalfL)+35;
  const FVector Side(-F.Y,F.X,0);
  for(int X=FMath::FloorToInt((P.X-Radius)/400);X<=FMath::FloorToInt((P.X+Radius)/400);++X)
    for(int Y=FMath::FloorToInt((P.Y-Radius)/400);Y<=FMath::FloorToInt((P.Y+Radius)/400);++Y){
      auto *Entries=PlantGrid.Find({X,Y});if(!Entries)continue;
      for(int Entry:*Entries){auto &Plant=Crushable[Entry];const FVector D=Plant.Original.GetLocation()-P;
        if(FMath::Abs(FVector::DotProduct(D,F))>HalfL+18||FMath::Abs(FVector::DotProduct(D,Side))>HalfW+12)continue;
        if(Strength<=Plant.Flattened)continue;
        if(Plant.Flattened==0)++CrushedPlantCount;Plant.Flattened=Strength;
        auto T=Plant.Original;auto Scale=T.GetScale3D();Scale.Z*=1-.82f*Strength;T.SetScale3D(Scale);
        T.SetRotation(FQuat(Side,Strength*1.05f)*T.GetRotation());
        auto Location=T.GetLocation();Location.Z+=Height(Location.X,Location.Y)-BaseHeight(Location.X,Location.Y);
        T.SetLocation(Location);Plant.Mesh->UpdateInstanceTransform(Plant.Index,T,true,true,true);
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
    if(MarksDirty||(!TireMarks.IsEmpty()&&ThrottleMarkRefresh++%4==0))RebuildTireMarks();
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
  for(auto &Plant:Crushable)if(Plant.Flattened>0){
    Plant.Mesh->UpdateInstanceTransform(Plant.Index,Plant.Original,true,true,true);Plant.Flattened=0;
  }
  CrushedPlantCount=0;
  for (auto &P : Detail) {
    P.Value.Mesh->DestroyComponent();
  }
  Detail.Empty();
  SoilCache.Empty();
  TireMarks.Empty();NextMark=0;SkidMarkCount=SoftMarkCount=0;BreakTireMarks();
  if(TireMarkMesh)TireMarkMesh->ClearAllMeshSections();
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
