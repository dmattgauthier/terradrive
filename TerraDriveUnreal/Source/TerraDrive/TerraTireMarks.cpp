#include "TerraWorld.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInterface.h"

void ATerraWorld::BreakTireMarks(){for(bool &Connected:MarkConnected)Connected=false;}
void ATerraWorld::TireMark(int Wheel,FVector P,FVector Forward,float Width,float Slip,
    float Speed,float Lateral,bool Grounded,bool Constructed,float Dt){
  if(Wheel<0||Wheel>5)return;
  const auto S=Sample(P);
  const bool Road=S.Surface==1;
  const bool Skidding=FMath::Abs(Slip)>.20f||FMath::Abs(Lateral)>1.1f;
  const bool Moving=FMath::Abs(Speed)>1.2f||FMath::Abs(Slip)>1.2f;
  // Rubber is deposited only on pavement. All loose/vegetated surfaces are
  // represented by the soil mesh and its packed material, never a dark decal.
  if(!Grounded||Constructed||!Road||!Skidding||!Moving){MarkConnected[Wheel]=false;return;}
  if(!MarkConnected[Wheel]){LastMark[Wheel]=P;MarkConnected[Wheel]=true;return;}
  const float Distance=FVector::Dist2D(P,LastMark[Wheel]);
  if(Distance>180||FMath::Abs(P.Z-LastMark[Wheel].Z)>100){LastMark[Wheel]=P;return;}
  // A short patch records a stationary burnout without painting while parked.
  const bool Burn=Road&&FMath::Abs(Slip)>1.2f&&Distance<3;
  if(Distance<6&&!Burn)return;
  FTerraTireMark Mark;Mark.A=LastMark[Wheel];Mark.B=P;
  if(Burn){Mark.A=P-Forward*5;Mark.B=P+Forward*5;}
  Mark.Side=FVector::CrossProduct(S.Normal,Forward).GetSafeNormal();
  Mark.Width=Width*100;Mark.Surface=S.Surface;Mark.Phase=MarkPhase[Wheel];
  MarkPhase[Wheel]+=FVector::Dist(Mark.A,Mark.B)*.01f;
  if(TireMarks.Num()<4096)TireMarks.Add(Mark);
  else{TireMarks[NextMark]=Mark;NextMark=(NextMark+1)%4096;}
  ++SkidMarkCount;
  LastMark[Wheel]=P;MarksDirty=true;
}
void ATerraWorld::RebuildTireMarks(){
  if(!TireMarkMesh){
    TireMarkMesh=NewObject<UProceduralMeshComponent>(this);
    TireMarkMesh->SetupAttachment(RootComponent);TireMarkMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    TireMarkMesh->SetCastShadow(false);TireMarkMesh->RegisterComponent();
    TireMarkMesh->SetWorldTransform(FTransform::Identity);
    for(int I=0;I<7;++I)TireMarkMesh->SetMaterial(I,LoadObject<UMaterialInterface>(nullptr,
        I==1?TEXT("/Game/Materials/TireSkid"):TEXT("/Game/Materials/TireImprint")));
  }
  for(int Surface=0;Surface<7;++Surface){
    TArray<FVector> P,Normals;TArray<int32> Index;TArray<FVector2D> UV;TArray<FLinearColor> Color;
    for(const auto &M:TireMarks)if(M.Surface==Surface){
      const int Base=P.Num();
      const float Length=FVector::Dist(M.A,M.B)*.01f;
      FLinearColor C=Surface==1?FLinearColor(.018,.02,.021):Surface==6?FLinearColor(.40,.50,.59):
        Surface==5?FLinearColor(.32,.25,.13):FLinearColor(.075,.056,.034);
      for(int J=0;J<4;++J){
        FVector V=(J<2?M.A:M.B)+M.Side*((J%2?1:-1)*M.Width*.5f);
        V.Z=Height(V.X,V.Y)+.35f;
        P.Add(V);Normals.Add(Sample(V).Normal);UV.Add(FVector2D(J%2,J<2?M.Phase:M.Phase+Length));Color.Add(C);
      }
      Index.Append({Base,Base+2,Base+1,Base+1,Base+2,Base+3});
    }
    TireMarkMesh->CreateMeshSection_LinearColor(Surface,P,Index,Normals,UV,Color,{},false);
  }
  MarksDirty=false;
}
