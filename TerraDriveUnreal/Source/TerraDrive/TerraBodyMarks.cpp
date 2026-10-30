#include "TerraWorld.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInterface.h"

void ATerraWorld::BodyGroundContact(FVector P,FVector F,float Load,float Width,float Length,float Speed,float Dt){
  if(!Ready||P.ContainsNaN()||Load<50||Dt<=0)return;
  const auto S=Sample(P);
  if(FMath::Abs(P.Z-S.Height)>18.f)return;
  F.Z=0;if(!F.Normalize())F=FVector::ForwardVector;
  Width=FMath::Clamp(Width,.30f,1.2f);Length=FMath::Clamp(Length,.5f,1.6f);
  // This runs on the game tick after collision notification. Never mutate
  // the terrain/collision meshes from inside a Chaos hit callback.
  if(S.MaxSink>0)Deform(P,F,Load,0,Width,Length,0,Speed,Dt,true);
  CrushPlants(P,F,Width*50,Length*50,FMath::Clamp(Load/3000.f,.15f,1.f));
  const bool Rigid=S.Surface==1||S.Surface==4;
  // A parked roof may continue receiving support notifications. Merge the
  // nearby scar instead of stacking thousands of coincident overlays.
  for(int Age=0;Age<FMath::Min(32,BodyMarks.Num());++Age){
    const int I=BodyMarks.Num()<1024?BodyMarks.Num()-1-Age:(NextBodyMark+BodyMarks.Num()-1-Age)%BodyMarks.Num();
    auto& M=BodyMarks[I];
    if(M.Surface==S.Surface&&FVector::DistSquared2D(M.Point,P)<FMath::Square(Width*32.f)){
      M.Width=FMath::Max(M.Width,Width*100);M.Length=FMath::Max(M.Length,Length*100);
      DirtyBodyMarkChunks.Add(I/32);BodyMarksDirty=true;return;
    }
  }
  FTerraBodyMark M;M.Point=P;M.Forward=F;M.Width=Width*100;M.Length=Length*100;M.Surface=S.Surface;M.Seed=++BodyMarkSequence;
  int Index;
  if(BodyMarks.Num()<1024)Index=BodyMarks.Add(M);
  else{Index=NextBodyMark;BodyMarks[Index]=M;NextBodyMark=(NextBodyMark+1)%1024;}
  DirtyBodyMarkChunks.Add(Index/32);
  if(Rigid)++BodyScrapeCount;else ++BodyImpressionCount;
  BodyMarksDirty=true;
}
void ATerraWorld::RebuildBodyMarks(){
  if(!BodyMarkMesh){
    BodyMarkMesh=NewObject<UProceduralMeshComponent>(this,TEXT("BodyScrapesAndCompactedGround"));
    BodyMarkMesh->SetupAttachment(RootComponent);BodyMarkMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    BodyMarkMesh->SetCastShadow(false);BodyMarkMesh->SetCanEverAffectNavigation(false);BodyMarkMesh->RegisterComponent();
    BodyMarkMesh->SetWorldTransform(FTransform::Identity);
    // Dedicated project-owned vertex-color material. The cooked tire-skid
    // material is intentionally black and cannot represent a panel scrape.
    BodyMarkMesh->SetMaterial(0,LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Materials/BodyGroundScuff")));
  }
  // At most 32 patches per section: a current contact must not rebuild the
  // entire scar history or repeatedly query tens of thousands of vertices.
  for(int Chunk:DirtyBodyMarkChunks){
  TArray<FVector> Vertices,Normals;TArray<int32> Indices;TArray<FVector2D> UV;TArray<FLinearColor> Colors;
  auto Quad=[&](FVector A,FVector B,FVector Side,float WA,float WB,FLinearColor Color){
    const int Base=Vertices.Num();
    for(int J=0;J<4;++J){FVector P=(J<2?A:B)+Side*((J%2?1.f:-1.f)*(J<2?WA:WB));
      P.Z=Height(P.X,P.Y)+.24f;Vertices.Add(P);Normals.Add(Sample(P).Normal);
      UV.Add(FVector2D(J%2,J<2?0:1));Colors.Add(Color);}
    Indices.Append({Base,Base+2,Base+1,Base+1,Base+2,Base+3});
  };
  static const FLinearColor Tints[]={FLinearColor(.25,.20,.12),FLinearColor(.63,.61,.55),
    FLinearColor(.12,.083,.045),FLinearColor(.17,.17,.085),FLinearColor(.56,.53,.45),
    FLinearColor(.51,.38,.25),FLinearColor(.57,.69,.75)};
  for(int MarkIndex=Chunk*32;MarkIndex<FMath::Min(BodyMarks.Num(),(Chunk+1)*32);++MarkIndex){const auto& M=BodyMarks[MarkIndex];
    const FVector Side(-M.Forward.Y,M.Forward.X,0);
    const bool Rigid=M.Surface==1||M.Surface==4;
    // Soft ground already renders its actual compacted mesh, soil shading
    // and crushed vegetation. Painted parallel lines hide that relief and
    // make a resting body resemble several crossed tire tracks.
    if(!Rigid)continue;
    const int Strips=3;
    for(int I=0;I<Strips;++I){
      const float Noise=FMath::Sin(float(M.Seed)*12.7f+I*7.13f)*.5f+.5f;
      const float Across=(I-(Strips-1)*.5f+(Noise-.5f)*.65f)/(Strips-1),Offset=Across*M.Width*(Rigid?.82f:1.f);
      const float L=M.Length*(Rigid?(.32f+.48f*Noise):(.68f+.25f*Noise));
      const float W=Rigid?(.22f+Noise*.58f):(.6f+Noise*.9f);
      const FVector Center=M.Point+Side*Offset+M.Forward*((Noise-.5f)*M.Length*.18f);
      const int Pieces=Rigid?3:1;
      for(int Piece=0;Piece<Pieces;++Piece){
        const float Start=-.5f+float(Piece)/Pieces,End=-.5f+float(Piece+.82f+.12f*Noise)/Pieces;
        const FVector Jitter=Side*((Noise-.5f)*(Rigid?.65f:1.f));
        Quad(Center+M.Forward*(L*Start)+Jitter,Center+M.Forward*(L*End)-Jitter,Side,W,W*(.55f+.4f*Noise),Tints[FMath::Min<int>(6,M.Surface)]*(.88f+.16f*Noise));
      }
    }
  }
  if(Vertices.IsEmpty())BodyMarkMesh->ClearMeshSection(Chunk);
  else{
    BodyMarkMesh->CreateMeshSection_LinearColor(Chunk,Vertices,Indices,Normals,UV,Colors,{},false);
    BodyMarkMesh->SetMaterial(Chunk,BodyMarkMesh->GetMaterial(0));
  }
  }
  DirtyBodyMarkChunks.Empty();
  BodyMarksDirty=false;
}
bool ATerraWorld::HasRenderedBodyImpression(FVector P,float RadiusCM) const {
  int DepressedVertices=0;
  for(const auto& Pair:Detail){const auto& T=Pair.Value;
    if(!T.CoarseReplaced||!T.Mesh||!T.Mesh->IsRegistered()||!T.Mesh->IsVisible()||
       T.Mesh->bHiddenInGame||!T.Mesh->IsRenderStateCreated()||!T.Mesh->GetSceneProxy()||T.Vertices.IsEmpty())continue;
    const FVector Minimum=T.Vertices[0],Maximum=T.Vertices.Last();
    if(P.X+RadiusCM<Minimum.X||P.X-RadiusCM>Maximum.X||
       P.Y+RadiusCM<Minimum.Y||P.Y-RadiusCM>Maximum.Y)continue;
    for(int Section=0;Section<T.Mesh->GetNumSections();++Section){
      const auto* Mesh=T.Mesh->GetProcMeshSection(Section);
      if(!Mesh||!Mesh->bSectionVisible||!T.Mesh->GetMaterial(Section))continue;
      TSet<uint32> Seen;
      for(uint32 Index:Mesh->ProcIndexBuffer){
        if(Seen.Contains(Index))continue;Seen.Add(Index);
        if(!T.Delta.IsValidIndex(Index)||!Mesh->ProcVertexBuffer.IsValidIndex(Index))return false;
        const auto& V=Mesh->ProcVertexBuffer[Index];
        if(FVector::DistSquared2D(V.Position,P)>FMath::Square(RadiusCM))continue;
        if(V.Position.ContainsNaN()||V.Normal.ContainsNaN())return false;
        if(T.Delta[Index]<-.08f&&V.Color.R<254&&T.UV[Index].IsNearlyZero()&&
           FMath::Abs(V.Position.Z-(T.Vertices[Index].Z+T.Delta[Index]))<.05f)++DepressedVertices;
      }
    }
  }
  return DepressedVertices>=3;
}
