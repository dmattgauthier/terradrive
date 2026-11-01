#include "TerraVehicle.h"
#include "TerraSpray.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/World.h"

void ATerraVehicle::UpdateSpray(float Dt) {
  if(SprayMeshes.Num()!=6)return;
  for(int I=0;I<WheelCount();++I){
    const auto &W=WheelState[I];if(!W.ContactValid||W.Load<100||Overturned)continue;
    const bool Driven=DrivenWheel(I);
    const bool Loose=Terrain->IsLooseGround(W.Contact);
    const bool Grass=(W.Ground.Surface==0||W.Ground.Surface==3)&&Terrain->VegetationCoverage(W.Contact)>.2f;
    auto R=TerraSpray::Evaluate(W.Ground.Surface,Loose,Grass,W.Ground.Water*.01f,W.Load,W.Slip,W.Omega*Radius,W.LongSpeed,Driven);
    if(W.Constructed&&W.Ground.Surface==4)continue;
    SprayBudget[I]+=Dt*R.Rate;const int Count=FMath::FloorToInt(SprayBudget[I]);SprayBudget[I]-=Count;
    for(int J=0;J<Count&&Parcels.Num()<900;++J){
      FRandomStream Random(++SpraySequence*196613u+I*977u);
      FTerraParcel P;P.Kind=R.Kind;
      // A loose matrix includes fine grains and occasional gravel/clods. A
      // rigid boulder itself never erodes or emits chips.
      const float Mix=Random.FRand();
      if(R.Kind==0&&(Loose||W.Ground.Surface!=0)&&Mix<.13f)P.Kind=4;
      if(R.Kind==3&&Mix<.055f)P.Kind=4;
      if(R.Kind==5&&Mix<.3f)P.Kind=0;
      if(Grass&&R.Kind==0&&Mix>.78f)P.Kind=5;
      P.Radius=R.Radius*Random.FRandRange(.32f,1.65f);
      if(P.Kind==4)P.Radius=Random.FRandRange(.35f,1.1f);
      P.Drag=P.Kind==4?.12f:R.Drag;P.Life=R.Life*Random.FRandRange(.65f,1.15f);
      P.Aspect=P.Kind==5?FVector(.24f,1.8f,.12f):P.Kind==1?FVector(.42f,.42f,1.25f):FVector(Random.FRandRange(.65f,1.2f),Random.FRandRange(.6f,1.3f),Random.FRandRange(.4f,.85f));
      P.Spin=FVector(Random.FRandRange(-7,7),Random.FRandRange(-7,7),Random.FRandRange(-7,7));
      const FVector Normal=W.Ground.Normal.GetSafeNormal();
      FVector Forward=FVector::VectorPlaneProject(W.ForceForward,Normal).GetSafeNormal();
      if(Forward.IsNearlyZero())Forward=FVector::VectorPlaneProject(GetActorForwardVector(),Normal).GetSafeNormal();
      const FVector Side=FVector::CrossProduct(Normal,Forward).GetSafeNormal();
      const float Sign=FMath::Abs(W.Omega*Radius)>.2f?FMath::Sign(W.Omega):W.LongSpeed<0?-1.f:1.f;
      P.P=W.Contact+Normal*(P.Radius+4)+Side*Random.FRandRange(-Width*38,Width*38)+Forward*Random.FRandRange(-W.Footprint*35,W.Footprint*35);
      const float Fan=Random.FRandRange(-1,1),Release=Random.FRandRange(.5f,1.4f);
      P.V=(-Forward*Sign*R.Launch*Release+Side*(Fan*R.Fan*R.Launch-W.LateralSpeed*.25f)+Normal*(R.Up*R.Launch*Random.FRandRange(.45f,1.4f)))*100;
      P.V+=W.PointVelocity*35.f;
      Parcels.Add(P);++SprayEmitted;++SprayKindEmitted[P.Kind];
    }
  }
  TArray<FTransform> Instances[6];
  for (int I = Parcels.Num() - 1; I >= 0; I--) {
    auto &P = Parcels[I];
    const FVector FrameStart=P.P;
    P.Age += Dt;
    float Rem = FMath::Min(Dt, .1f);
    bool Dead = P.Age > P.Life;
    while (Rem > 0 && !Dead) {
      float H = FMath::Min(Rem, 1.f / 120);
      Rem -= H;
      FVector Old = P.P;
      P.V.Z -= 980 * H;
      P.V *= FMath::Exp(-H * P.Drag);
      P.P += P.V * H;
      SprayTravelCM += FVector::Dist(Old, P.P);
      // Airborne debris moves in world space. Impacts end the parcel; do not
      // replace it with permanent spheres welded behind the tires.
      if(P.P.Z<=Terrain->Height(P.P.X,P.P.Y)+P.Radius){
        if(P.Kind==4&&P.Bounces==0&&FMath::Abs(P.V.Z)>90){P.P.Z=Terrain->Height(P.P.X,P.P.Y)+P.Radius+.2f;P.V.Z=FMath::Abs(P.V.Z)*.23f;P.V.X*=.48f;P.V.Y*=.48f;++P.Bounces;}
        else Dead=true;
      }
    }
    if(!Dead){
      // At a maximum 0.1-second step the ballistic arc differs from this
      // chord by at most 1.23 cm, within the visual debris size. Broad-phase
      // the detailed body and trace once per parcel, not every 1/120 step.
      FHitResult Hit;FCollisionQueryParams Query;Query.bTraceComplex=true;
      const FBox Bounds=Body->Bounds.GetBox().ExpandBy(P.Radius);
      if(P.Age>.12f&&FMath::LineBoxIntersection(Bounds,FrameStart,P.P,P.P-FrameStart)&&Body->LineTraceComponent(Hit,FrameStart,P.P,Query))Dead=true;
      Query.AddIgnoredActor(this);
      if(!Dead&&GetWorld()->LineTraceSingleByChannel(Hit,FrameStart,P.P,ECC_Visibility,Query))Dead=true;
    }
    if (Dead) {
      Parcels.RemoveAtSwap(I);
      ++SprayExpired;
      continue;
    }
    float Scale = P.Radius / 50 * FMath::Clamp((P.Life-P.Age)*4,0.f,1.f);
    Instances[P.Kind].Add(FTransform(FQuat(FRotator(P.Age*P.Spin.Y*57.29578f,P.Age*P.Spin.Z*57.29578f,P.Age*P.Spin.X*57.29578f)),P.P,P.Aspect*Scale));
  }
  for (int Kind=0;Kind<6;++Kind) {
    auto *M=SprayMeshes[Kind].Get(); const auto &Transforms=Instances[Kind];
    while (M->GetInstanceCount()>Transforms.Num()) M->RemoveInstance(M->GetInstanceCount()-1);
    for (int I=0;I<Transforms.Num();++I) {
      if (I<M->GetInstanceCount()) M->UpdateInstanceTransform(I,Transforms[I],true,false,true);
      else M->AddInstance(Transforms[I],true);
    }
    M->MarkRenderStateDirty();
  }
}
