#include "TerraWorld.h"
#include "TerraSimCore.h"
#include "TerraSoilVariation.h"
#include "TerraContact.h"
#include "TerraWinter.h"
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
#include "Engine/StaticMesh.h"
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
uint16 StoreSoilHeading(FVector2D Direction){
  return uint16(FMath::Clamp(FMath::RoundToInt((FMath::Atan2(Direction.Y,Direction.X)+PI)*(65535.f/(2*PI))),0,65535));
}
FVector2D ReadSoilHeading(uint16 Heading){
  const float Angle=Heading*((2*PI)/65535.f)-PI;
  return FVector2D(FMath::Cos(Angle),FMath::Sin(Angle));
}
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
float ATerraWorld::SnowDrift(float X,float Y) const {
  if(TerraWinter::IsActive(GetWorld()))return 0;
  const float Snow=SurfaceBlend(X,Y).Weight[6];
  if(Snow<.001f)return 0;
  // Broad wind-built shelves (in cm), not collision-only decoration. Sampling
  // these at the same metre vertices as the rendered field keeps support and
  // chassis collision on exactly the same surface. Original terrain.bin stays
  // the recovery reference; tire deformation is applied above this snow base.
  // X/Y are centimetres: these wavelengths are about 12–120 feet, rather
  // than nearly basin-wide undulations that read as an untextured plane.
  const float Shelf=.5f+.5f*FMath::Sin(X*.0017f+Y*.0011f+1.4f*FMath::Sin(Y*.0009f));
  const float Wind=.5f+.5f*FMath::Sin(X*.0063f+Y*.0028f+FMath::Sin(Y*.0021f));
  const float Ripple=3.f*(1+FMath::Sin(X*.016f+Y*.007f));
  return Snow*Snow*(8.f+30.f*Wind*Wind*Wind+18.f*FMath::Pow(Shelf,6)+Ripple);
}
float ATerraWorld::BaseHeight(float X, float Y) const {
  if(TerraWinter::IsActive(GetWorld()))return TerraWinter::Height(GetWorld(),X,Y);
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
  auto Node=[&](int Row,int Col){return Heights[Row*N+Col]*100;};
  const float A=Node(IX,IY),B=Node(IX+2,IY),C=Node(IX,IY+2),D=Node(IX+2,IY+2);
  return U+V<=1?A+(B-A)*U+(C-A)*V:D+(C-D)*(1-U)+(B-D)*(1-V);
}
uint8 ATerraWorld::SurfaceAt(float X, float Y) const {
  if(TerraWinter::IsActive(GetWorld()))return TerraWinter::Sample(GetWorld(),FVector(X,Y,TerraWinter::Height(GetWorld(),X,Y))).Surface;
  if (!N)
    return 0;
  int I = FMath::Clamp(FMath::RoundToInt((X / 100 - Origin) / Step), 0, N - 1),
      J = FMath::Clamp(FMath::RoundToInt((Y / 100 - Origin) / Step), 0, N - 1);
  return Surfaces[I * N + J];
}
float ATerraWorld::LooseDirt(float X,float Y) const {
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
FTerraSurfaceBlend ATerraWorld::SurfaceBlend(float X,float Y) const {
  FTerraSurfaceBlend Result;
  if(TerraWinter::IsActive(GetWorld())){Result.Weight[SurfaceAt(X,Y)]=1;return Result;}
  if(N<2||BlendWeights.Num()!=N*N*7){Result.Weight[SurfaceAt(X,Y)]=1;return Result;}
  const float GX=FMath::Clamp((X/100-Origin)/Step,0.f,float(N-1)-.0001f),GY=FMath::Clamp((Y/100-Origin)/Step,0.f,float(N-1)-.0001f);
  const int I=FMath::FloorToInt(GX),J=FMath::FloorToInt(GY);const float U=GX-I,V=GY-J;
  float Sum=0;
  for(int S=0;S<7;++S){const auto Read=[&](int R,int C){return BlendWeights[(R*N+C)*7+S]/255.f;};
    Result.Weight[S]=FMath::Lerp(FMath::Lerp(Read(I,J),Read(I+1,J),U),FMath::Lerp(Read(I,J+1),Read(I+1,J+1),U),V);Sum+=Result.Weight[S];}
  if(Sum>0)for(float &W:Result.Weight)W/=Sum;
  return Result;
}
float ATerraWorld::Height(float X, float Y) const {
  if(TerraWinter::IsActive(GetWorld()))return TerraWinter::Height(GetWorld(),X,Y);
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
float ATerraWorld::SoilSinkLimit(float X,float Y,const FTerraSurfaceBlend &Blend,uint8 Surface) const {
  if(Surface==1||Surface==4)return 0;
  static const float Sink[]={.025f,0,.36f,.48f,0,.28f,.6f};
  float Limit=0;for(int K=0;K<7;++K)Limit+=Sink[K]*Blend.Weight[K];
  if(Blend.Weight[6]>0){
    const float SnowLayer=SnowDrift(X,Y)*.01f+.12f;
    Limit+=(FMath::Min(Sink[6],SnowLayer*.70f)-Sink[6])*Blend.Weight[6];
  }
  if(Blend.Weight[0]>0)Limit+=LooseDirt(X,Y)*Blend.Weight[0]*.24f;
  return FMath::Max(0.f,Limit);
}
FTerraSample ATerraWorld::Sample(FVector P) const {
  if(TerraWinter::IsActive(GetWorld()))return TerraWinter::Sample(GetWorld(),P);
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
                     Soft[] = {.06, 0, .83, .92, 0, .75, .88};
  const auto Blend=SurfaceBlend(P.X,P.Y);
  S.Mu=S.Rolling=S.Softness=S.MaxSink=0;
  for(int K=0;K<7;++K){const float W=Blend.Weight[K];S.Mu+=Mu[K]*W;S.Rolling+=RR[K]*W;S.Softness+=Soft[K]*W;}
  S.MaxSink=SoilSinkLimit(P.X,P.Y,Blend,S.Surface);
  S.Mu*=Rain?.76f:1.f;
  if(Blend.Weight[0]>0){const float Loose=LooseDirt(P.X,P.Y)*Blend.Weight[0];
    S.Softness+=Loose*.65f;S.Rolling*=1+Loose*2.f;}
  // Thin soil at a rock/pavement edge cannot excavate the rigid substrate.
  if(S.Surface==1||S.Surface==4){S.Softness=0;S.MaxSink=0;}
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
    const float GX=FMath::Clamp((P.X-K.X*TileCM)/CellCM,0.f,float(Div)-.0001f),
                GY=FMath::Clamp((P.Y-K.Y*TileCM)/CellCM,0.f,float(Div)-.0001f);
    const int I=FMath::FloorToInt(GX),J=FMath::FloorToInt(GY),A=J*(Div+1)+I;
    const float U=GX-I,V=GY-J;
    const auto &Packing=T?T->Packing:Cached->Packing;
    // Use the same two triangles as rendered height. Nearest-node packing
    // made the grip, roughness and rolling response jump at each cell centre.
    S.Packing=U+V<=1?Packing[A]+(Packing[A+1]-Packing[A])*U+(Packing[A+Div+1]-Packing[A])*V:
      Packing[A+Div+2]+(Packing[A+Div+1]-Packing[A+Div+2])*(1-U)+(Packing[A+1]-Packing[A+Div+2])*(1-V);
    const auto &Churn=T?T->Churn:Cached->Churn;
    S.Churn=U+V<=1?Churn[A]+(Churn[A+1]-Churn[A])*U+(Churn[A+Div+1]-Churn[A])*V:
      Churn[A+Div+2]+(Churn[A+Div+1]-Churn[A+Div+2])*(1-U)+(Churn[A+1]-Churn[A+Div+2])*(1-V);
    S.Mu += S.Surface == 6 ? S.Packing * .23f : 0;
    S.Rolling *= 1 - S.Packing * .35f;
  }
  return S;
}
FTerraSupport ATerraWorld::GroundSupport(FVector Mount,FVector Up,float RadiusCM,
    float MinCM,float MaxCM) const {
  if(TerraWinter::IsActive(GetWorld()))return TerraWinter::Support(GetWorld(),Mount,Up,RadiusCM,MinCM,MaxCM,nullptr);
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
  if(TerraWinter::IsActive(GetWorld()))return TerraWinter::Support(GetWorld(),Mount,Up,RadiusCM,MinCM,MaxCM,Ignore);
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
  if(TerraWinter::IsActive(GetWorld())){TerraWinter::Initialize(*this);return;}
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
  TArray<uint8> BlendFile;
  if(FFileHelper::LoadFileToArray(BlendFile,*(FPaths::ProjectContentDir()/TEXT("NativeData/terrain-blend.bin")))&&BlendFile.Num()==16+N*N*7){
    FMemoryReader BR(BlendFile);uint32 BM=0;int BN=0;float BS=0,BO=0;BR<<BM;BR<<BN;BR<<BS;BR<<BO;
    if(BM==0x54425731&&BN==N&&BS==Step&&BO==Origin){BlendWeights.SetNum(N*N*7);FMemory::Memcpy(BlendWeights.GetData(),BlendFile.GetData()+16,BlendWeights.Num());}
  }
  // Bake the native wind relief once into this actor's in-memory height
  // field. The source file stays untouched. Re-evaluating coverage/noise for
  // every triangle/normal during soil activation and repair caused avoidable
  // CPU stalls; all later render, collision and tire samples share this data.
  for(int Row=0;Row<N;++Row)for(int Col=0;Col<N;++Col){
    const int I=Row*N+Col;
    if((BlendWeights.Num()==N*N*7&&BlendWeights[I*7+6]>0)||
       (BlendWeights.IsEmpty()&&Surfaces[I]==6))
      Heights[I]+=SnowDrift((Origin+Row*Step)*100,(Origin+Col*Step)*100)/100;
  }
  FString TransitionJson;
  if(FFileHelper::LoadFileToString(TransitionJson,*(FPaths::ProjectContentDir()/TEXT("NativeData/terrain-transitions.json"))))FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(TransitionJson),TransitionData);
  GroundBlendMaterial=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Materials/Terrain_GroundBlend"));
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
      // Ground textures use world position. UV0 is reserved for the local
      // tire tangent on detailed tiles, neutral on untouched coarse ground.
      UV.Add(FVector2D(1,0));
      C.Add(FLinearColor(1,LooseDirt(X,Y),128.f/255.f,0));
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
      Mesh->SetMaterial(S, GroundBlendMaterial?GroundBlendMaterial.Get():Materials[S].Get());
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
    State.Churn=MoveTemp(Old.Churn);State.Heading.SetNumUninitialized(Old.UV.Num());
    for(int I=0;I<Old.UV.Num();++I)State.Heading[I]=StoreSoilHeading(Old.UV[I]);
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
    T.Delta=MoveTemp(Stored->Delta);T.Packing=MoveTemp(Stored->Packing);
    T.Churn=MoveTemp(Stored->Churn);T.UV.SetNumUninitialized(Stored->Heading.Num());
    for(int I=0;I<Stored->Heading.Num();++I)T.UV[I]=ReadSoilHeading(Stored->Heading[I]);
    SoilCache.Remove(Key);
  }else{
    T.Delta.Init(0,(Div+1)*(Div+1));T.Packing.Init(0,T.Delta.Num());
    T.Churn.Init(0,T.Delta.Num());T.UV.Init(FVector2D(1,0),T.Delta.Num());
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
      T.Colors.Add(FLinearColor(1,LooseDirt(X,Y),128.f/255.f,0));
      // Immutable local layer limit is cached once, not re-evaluated for
      // every swept substep. It protects neighbouring thin-snow vertices
      // from a footprint centred over a deeper drift.
      const uint8 Surface=SurfaceAt(X,Y);
      T.SinkLimit.Add(SoilSinkLimit(X,Y,SurfaceBlend(X,Y),Surface));
    }
  FTerraTile &New = Detail.Add(Key, MoveTemp(T));
  UpdateTile(New);
  RebuildGround(
      {FMath::FloorToInt(Key.X / 8.f), FMath::FloorToInt(Key.Y / 8.f)});
  return &New;
}
void ATerraWorld::ActivateSoil(FVector P,float RadiusCM){
  if(TerraWinter::IsActive(GetWorld()))return;
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
      // PMC packs vertex colour to UNorm8. Use its exact 128/255 neutral,
      // plus signed square-root encoding for millimetre-scale shallow marks.
      // The decoder spans +/- 80 cm; A stores churn, not opacity.
      const float Encoded=FMath::Sign(T.Delta[A])*FMath::Sqrt(FMath::Min(1.f,FMath::Abs(T.Delta[A])/80.f));
      T.Colors[A].B=(128.f+127.f*Encoded)/255.f;
      T.Colors[A].A=T.Churn[A];
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
      T.Mesh->UpdateMeshSection_LinearColor(S,V,T.Normals,T.UV,T.Colors,{},false);
    else{
      T.Mesh->CreateMeshSection_LinearColor(S,V,Idx[S],T.Normals,T.UV,T.Colors,{},true);
      T.Mesh->SetMaterial(S, GroundBlendMaterial?GroundBlendMaterial.Get():Materials[S].Get());
    }
  }
  T.Dirty = false;
}
void ATerraWorld::Deform(FVector P, FVector F, float Load, float Pressure,
                         float Width, float Length, float Slip, float Speed,
                         float Dt) {
  if(TerraWinter::IsActive(GetWorld()))return;
  auto S = Sample(P);
  if (S.MaxSink <= 0 || Load < 50)
    return;
  F.Z = 0;
  if(!F.Normalize())return;
  FVector Side(-F.Y, F.X, 0);
  const float CellReach=CellCM*.5f*(FMath::Abs(F.X)+FMath::Abs(F.Y));
  const float HalfL = FMath::Max(.025f, Length * .5f) * 100,
              HalfW = FMath::Max(.09f, Width * .5f) * 100;
  // The floor and collapse material use immutable world-space fields. A new
  // passing stamp must not move a random floor under a supported tire.
  const auto CenterForm=TerraSoil::Variation(P.X,P.Y,S.Surface,1,Slip,S.Churn);
  const float Ordinary=TerraSim::SoilTarget(1,Load,Width,Length,Slip,0),
              Churned=TerraSim::SoilTarget(1,Load,Width,Length,Slip,1);
  const float Target=FMath::Min(S.MaxSink,S.MaxSink*FMath::Lerp(Ordinary,Churned,S.Churn)*CenterForm.Strength);
  const float GrooveOuter=TerraSim::GrooveOuterHalfWidth(HalfW*.01f,Target)*100;
  auto Bank=TerraSim::SoilBankShape(S.Surface,Width,Target,LooseDirt(P.X,P.Y),Slip);
  FVector2D Heading(F.X,F.Y);
  // A tire's imprint has the same tangent when the vehicle reverses. Select
  // one hemisphere before averaging, avoiding an artificial zero direction.
  if(Heading.X<-.001f||(FMath::Abs(Heading.X)<=.001f&&Heading.Y<0))Heading=-Heading;
  const FVector CanonicalSide(-Heading.Y,Heading.X,0);
  struct FCell {
    FTerraTile *T;
    int I;
    float W,Ceiling;
  };
  TArray<FCell> Receivers;
  double Removed = 0;
  float MaximumDose=0;
  // A rectangle's rotated corners extend beyond max(halfLength,halfWidth).
  // The former bound clipped long track footprints and bank envelopes.
  const float SideReach=GrooveOuter*1.06f+Bank.width*126.f+18.f;
  const float Radius=FMath::Sqrt(FMath::Square(HalfL+20)+FMath::Square(SideReach))+CellCM;
  // Allocate the bounded stencil before taking pointers (TMap growth moves
  // values).
  for (int X = FMath::FloorToInt((P.X - Radius) / TileCM);
       X <= FMath::FloorToInt((P.X + Radius) / TileCM); X++)
    for (int Y = FMath::FloorToInt((P.Y - Radius) / TileCM);
         Y <= FMath::FloorToInt((P.Y + Radius) / TileCM); Y++)
      EnsureTile({X, Y});
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
          if (FMath::Abs(U) > HalfL + 20 || FMath::Abs(V) > SideReach)
            continue;
          if (SurfaceAt(T->Vertices[A].X, T->Vertices[A].Y) != S.Surface)
            continue;
          const float Along=TerraSim::FootprintCoverage(U,HalfL,CellReach);
          const float CanonicalV=FVector::DotProduct(D,CanonicalSide);
          const auto Form=TerraSoil::Variation(T->Vertices[A].X,T->Vertices[A].Y,S.Surface,CanonicalV,Slip,S.Churn);
          const float Core=HalfW*.64f,Outer=GrooveOuter*Form.Wall;
          const float Across=1-TerraSim::SmoothSoilEdge((FMath::Abs(V)-Core)/FMath::Max(1.f,Outer-Core));
          if (Along>0&&Across>0) {
            // Area-weighted cells keep short contact patches effective even
            // when their center lies between grid nodes.
            // Longitudinal overlap weights contact exposure, not the final
            // floor depth. A 10 cm patch must converge to the same groove
            // as it passes nodes at different sub-cell phases.
            const float Edge=Across;
            // Packing stiffens subsequent passes but never raises an already
            // compacted groove. Rolling load creates a rut without wheelspin.
            const float Response=TerraSim::SoilResponse(Dt*Along,Speed,Length,Slip,T->Packing[A]);
            T->Churn[A]=TerraSim::SoilChurnDose(T->Churn[A],Slip,Speed,Dt,Along*Across);
            MaximumDose=FMath::Max(MaximumDose,T->Churn[A]);
            const float NodeLimit=T->SinkLimit[A];
            const float NodeTarget=FMath::Min(NodeLimit,NodeLimit*FMath::Lerp(Ordinary,Churned,T->Churn[A])*Form.Strength);
            const float Delta=TerraSim::SoilCutDepth(T->Delta[A]*.01f,NodeTarget,Edge,Response)*100;
            T->Delta[A] -= Delta;
            Removed += Delta * .01 * CellArea;
            T->Packing[A] =
                FMath::Clamp(T->Packing[A]+(1-T->Packing[A])*Response*Edge,0.f,1.f);
            const float Influence=FMath::Clamp(Response*Edge*2,0.f,1.f);
            T->UV[A]=(T->UV[A]*(1-Influence)+Heading*Influence).GetSafeNormal();
            T->Dirty = true;
          } else {
            const float NodeWidth=Bank.width*Form.BankWidth;
            const float SideShape=TerraSim::SoilBankProfile(V*.01f,Outer*.01f,NodeWidth);
            // Small low deposits merge with the bank's outer flank. Their
            // lobes vary in XY, material and shear, while the smooth envelope
            // returns to undisturbed ground well before the 3-foot shoulder.
            const float Satellite=TerraSim::SoilBankProfile(V*.01f,Outer*.01f+NodeWidth*.58f,.12f+.06f*Form.Scatter)*Form.Lobe*Form.Scatter;
            const float Longitudinal=1-TerraSim::SmoothSoilEdge((FMath::Abs(U)-HalfL-2)/14.f);
            // Ordinary rolling leaves a groove and banks. A front pile at
            // every substep was re-excavated on the next step, amplifying
            // snow into a repeated row of steep triangular mounds. A small
            // forward toe is permitted only under substantial wheelspin,
            // and is bound by the same low repose envelope as the banks.
            const float Churn=FMath::Clamp((FMath::Abs(Slip)-.75f)/1.25f,0.f,1.f);
            const float TravelSign=FMath::Abs(Speed)>.2f?(Speed<0?-1.f:1.f):(Slip<0?-1.f:1.f);
            const float Ahead=U*TravelSign-HalfL;
            const float Toe=(Ahead>0?Churn:0)*.12f*(1-TerraSim::SmoothSoilEdge(FMath::Abs(V)/FMath::Max(1.f,HalfW)))*
              TerraSim::SoilBankProfile(Ahead*.01f,.01f,.16f);
            const float W=(SideShape*(.82f+.18f*Form.Lobe)+Satellite*.32f)*Longitudinal*Form.Weight+Toe;
            const float Envelope=FMath::Max(FMath::Max(SideShape,Satellite*.24f),Toe);
            if(W>.001f)Receivers.Add({T,A,W,Bank.height*100*Form.Height*Envelope});
          }
        }
    }
  double Available = Removed * Bank.fraction, Placed = 0;
  // Normalize using receivers that still have capacity. Once a low bank is
  // full, distribute its unused share to neighbouring bank cells rather than
  // growing an unlimited spike. Remaining pore-volume loss is compaction.
  for(int Pass=0;Pass<4&&Available>1e-10;++Pass){
    float Sum=0;
    for(const auto &C:Receivers)if(C.Ceiling-C.T->Delta[C.I]>.0001f)Sum+=C.W;
    if(Sum<=0)break;
    double ThisPass=0;
    for(auto &C:Receivers){
      const float Capacity=FMath::Max(0.f,C.Ceiling-C.T->Delta[C.I]);
      if(Capacity<=.0001f)continue;
      const float Add=FMath::Min(float(Available*C.W/Sum/CellArea*100),Capacity);
      C.T->Delta[C.I]+=Add;
      C.T->UV[C.I]=Heading;
      C.T->Churn[C.I]=FMath::Max(C.T->Churn[C.I],MaximumDose*.60f);
      C.T->Dirty=true;
      ThisPass+=Add*.01*CellArea;
    }
    Placed+=ThisPass;Available=FMath::Max(0.,Available-ThisPass);
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
        const float D=Active?Active->Delta[Source]:Stored->Delta[Source],C=Active?Active->Packing[Source]:Stored->Packing[Source],H=Active?Active->Churn[Source]:Stored->Churn[Source];
        const FVector2D Fwd=Active?Active->UV[Source]:ReadSoilHeading(Stored->Heading[Source]);
        const float OldChurn=T?T->Churn[Destination]:Cached->Churn[Destination];
        const FVector2D OldDirection=T?T->UV[Destination]:ReadSoilHeading(Cached->Heading[Destination]);
        if(Delta[Destination]!=D||Packing[Destination]!=C||OldChurn!=H||OldDirection!=Fwd){
          Delta[Destination]=D;Packing[Destination]=C;
          if(T){T->Churn[Destination]=H;T->UV[Destination]=Fwd;T->Dirty=true;}
          else {Cached->Churn[Destination]=H;Cached->Heading[Destination]=StoreSoilHeading(Fwd);}}
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
      bool Bend=false;O->TryGetBoolField(TEXT("crushable"),Bend);
      // Retain instance indices used by tree/plant references, but bury
      // summer ground-cover cards under deep snow instead of sprouting
      // oversized green leaves through the winter basin.
      if(Bend&&SurfaceBlend(T.GetLocation().X,T.GetLocation().Y).Weight[6]>.65f)
        T.SetScale3D(FVector::ZeroVector);
      const int Instance=C->AddInstance(T);
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
      // Small grass clumps need neither distant draws nor shadow-map passes.
      // Solid formations keep their original visibility and collision range.
      C->SetCastShadow(Solid);
      C->SetCullDistances(Solid?16000:3500,Solid?36000:8000);
      C->RegisterComponent();Scenery.Add(C);++FabAssetCount;
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
      const FVector Position=Vec(A->GetArrayField(TEXT("p")));
      FVector Scale=Vec(A->GetArrayField(TEXT("s")));
      if(!Solid&&SurfaceBlend(Position.X,Position.Y).Weight[6]>.65f)Scale=FVector::ZeroVector;
      const int Index=C->AddInstance(FTransform(FQuat(Q[0]->AsNumber(),Q[1]->AsNumber(),Q[2]->AsNumber(),Q[3]->AsNumber()),Position,Scale));
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
bool ATerraWorld::IsLooseGround(FVector P) const{
  return !P.ContainsNaN()&&LooseDirt(P.X,P.Y)>.45f;
}
float ATerraWorld::VegetationCoverage(FVector P) const{
  if(P.ContainsNaN())return 0;
  // Query the existing four-metre plant grid rather than every scenery
  // instance. Eight metres covers the source pivots of the installed tufts
  // and shrubs; their actual transformed footprint determines the result.
  constexpr float Reach=800.f;
  float Coverage=0;
  for(int X=FMath::FloorToInt((P.X-Reach)/400);X<=FMath::FloorToInt((P.X+Reach)/400);++X)
    for(int Y=FMath::FloorToInt((P.Y-Reach)/400);Y<=FMath::FloorToInt((P.Y+Reach)/400);++Y){
      const auto* Entries=PlantGrid.Find({X,Y});if(!Entries)continue;
      for(int Entry:*Entries){
        if(!Crushable.IsValidIndex(Entry))continue;
        const auto& Plant=Crushable[Entry];
        if(!Plant.Mesh||!Plant.Mesh->GetStaticMesh())continue;
        const FBox Bounds=Plant.Mesh->GetStaticMesh()->GetBoundingBox();
        const FVector Center=Plant.Original.TransformPosition(FVector(Bounds.GetCenter().X,Bounds.GetCenter().Y,Bounds.Min.Z));
        const FVector D=P-Center;
        // Do not emit vegetation through a bridge or another elevated deck.
        // Original transforms remain the footprint after a plant is crushed.
        if(FMath::Abs(D.Z)>100.f)continue;
        const FVector A=Plant.Original.TransformVector(FVector(Bounds.GetExtent().X,0,0));
        const FVector B=Plant.Original.TransformVector(FVector(0,Bounds.GetExtent().Y,0));
        const double Det=A.X*B.Y-A.Y*B.X;
        if(FMath::Abs(Det)<.01)continue;
        const double U=(D.X*B.Y-D.Y*B.X)/Det,V=(A.X*D.Y-A.Y*D.X)/Det;
        const float Radial=FMath::Sqrt(float(U*U+V*V));
        Coverage=FMath::Max(Coverage,1-Smooth(.65f,1.f,Radial));
        if(Coverage>=.999f)return 1;
      }
    }
  return Coverage;
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
