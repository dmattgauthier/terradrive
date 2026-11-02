#include "TerraRutTransitionValidation.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"

namespace TerraRutTransitionValidation {
namespace {
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<ACameraActor> Camera;
  FVector Boundary=FVector::ZeroVector,Normal=FVector::ForwardVector,Stamp=FVector::ZeroVector;
  FString Name;
  int Index=0,Phase=0,A=0,B=0;
  float Time=0;
};
FState State;
void Work(ATerraWorld* T){
  for(int I=0;I<32;++I)T->Deform(State.Stamp,State.Normal,9000,18,.36f,.70f,.9f,0,.025f);
}
TArray<float> Profile(ATerraWorld* T){
  TArray<float> P;const FVector Side(-State.Normal.Y,State.Normal.X,0);
  for(int I=-14;I<=14;++I)for(int J=-14;J<=14;++J){
    const auto S=T->Sample(State.Boundary+State.Normal*(I*5.f)+Side*(J*5.f));
    P.Add(S.Displacement);P.Add(S.Packing);P.Add(S.Churn);
  }
  return P;
}
void Frame(ATerraVehicle* V,bool Close){
  const FVector Side(-State.Normal.Y,State.Normal.X,0);
  FVector Focus=State.Boundary;Focus.Z=V->Terrain->Height(Focus.X,Focus.Y)+3;
  FVector Eye=Focus-State.Normal*(Close?135.f:290.f)-Side*(Close?180.f:370.f)+FVector(0,0,Close?110.f:245.f);
  Eye.Z=FMath::Max(Eye.Z,V->Terrain->Height(Eye.X,Eye.Y)+85.f);
  State.Camera->SetActorLocationAndRotation(Eye,(Focus-Eye).Rotation());
  State.Camera->GetCameraComponent()->SetFieldOfView(Close?52:59);
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture){
  auto* T=V->Terrain.Get();
  if(State.Vehicle.Get()!=V){
    State=FState();State.Vehicle=V;
    const bool Valid=T&&T->TransitionData.IsValid()&&T->TransitionData->GetArrayField(TEXT("fixtures")).Num()==7;
    Check(TEXT("rut transitions cover all seven actual terrain boundaries"),Valid,Valid?7:0);
    if(!Valid)return true;
    V->SetGarage(false);V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    V->SetActorTickEnabled(false);V->Chassis->SetSimulatePhysics(false);
    State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
    if(auto* PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(State.Camera.Get());if(auto* H=PC->GetHUD())H->bShowHUD=false;}
  }
  auto Add=[&](const TCHAR* Name,bool Pass,float Value=0.f){Check(State.Name+TEXT(" ")+Name,Pass,Value);};
  State.Time+=Dt;
  if(State.Phase==0){
    T->ResetSoil();
    const auto F=T->TransitionData->GetArrayField(TEXT("fixtures"))[State.Index]->AsObject();
    const auto P=F->GetArrayField(TEXT("p")),N=F->GetArrayField(TEXT("normal")),Pair=F->GetArrayField(TEXT("pair"));
    State.Name=F->GetStringField(TEXT("name"));State.A=int(Pair[0]->AsNumber());State.B=int(Pair[1]->AsNumber());
    State.Boundary=FVector(P[0]->AsNumber(),P[1]->AsNumber(),0);
    State.Normal=FVector(N[0]->AsNumber(),N[1]->AsNumber(),0);
    const bool Hard=State.B==1||State.B==4;
    // Centre just inside one side, with the finite rolling footprint spanning
    // both. Centre-ID clipping previously left the other soft half untouched.
    State.Stamp=State.Boundary+State.Normal*(Hard?-3.f:3.f);
    const auto A=T->Sample(State.Boundary-State.Normal*12.5f),B=T->Sample(State.Boundary+State.Normal*12.5f);
    Add(TEXT("fixture spans the two actual substrate IDs"),A.Surface==State.A&&B.Surface==State.B);
    Work(T);
    const auto CutA=T->Sample(State.Boundary-State.Normal*12.5f),CutB=T->Sample(State.Boundary+State.Normal*12.5f);
    if(Hard){
      Add(TEXT("soft side of the shared footprint is pressed"),CutA.RutDepth>.0003f,CutA.RutDepth);
      Add(TEXT("shared footprint leaves hard substrate unexcavated"),CutB.Displacement==0&&CutB.MaxSink==0,CutB.Displacement);
    }else{
      Add(TEXT("one footprint deforms both soft materials"),CutA.RutDepth>.0003f&&CutB.RutDepth>.0003f,FMath::Min(CutA.RutDepth,CutB.RutDepth));
      float Jump=0,Previous=0;bool Finite=true;
      for(int I=0;I<=16;++I){const auto S=T->Sample(State.Boundary+State.Normal*(-10+I*1.25f));
        Finite&=FMath::IsFinite(S.Displacement)&&!S.Normal.ContainsNaN();
        if(I)Jump=FMath::Max(Jump,FMath::Abs(S.Displacement-Previous));Previous=S.Displacement;
      }
      Add(TEXT("loaded floor has no categorical seam step"),Finite&&Jump<.003f,Jump);
    }
    int HardNodes=0;float HardError=0;const FVector Side(-State.Normal.Y,State.Normal.X,0);
    for(int I=-16;I<=16;++I)for(int J=-16;J<=16;++J){
      const auto S=T->Sample(State.Boundary+State.Normal*(I*6.25f)+Side*(J*6.25f));
      if(S.Surface==1||S.Surface==4){++HardNodes;HardError=FMath::Max(HardError,FMath::Abs(S.Displacement));}
    }
    Add(TEXT("excavation and displaced banks preserve solid substrate"),HardError<.000001f&&(!Hard||HardNodes>0),HardError);
    Add(TEXT("soft-ground deformation adds no rubber ribbon"),T->TireMarkCount()==0,T->TireMarkCount());
    const double Error=FMath::Abs(T->DepressedVolume-T->DisplacedVolume-T->CompactedVolume);
    Add(TEXT("cross-material excavation conserves the volume ledger"),Error<.00001,float(Error));
    const auto First=Profile(T);T->ResetSoil();Work(T);const auto Second=Profile(T);float Replay=0;
    if(First.Num()==Second.Num())for(int I=0;I<First.Num();++I)Replay=FMath::Max(Replay,FMath::Abs(First[I]-Second[I]));
    Add(TEXT("same footprint reproduces heights packing and shear"),First.Num()==Second.Num()&&Replay<.000001f,Replay);
    UE_LOG(LogTemp,Display,TEXT("TERRA_RUT_TRANSITION pair=%s minDepthM=%.6f maxDepthM=%.6f hardNodes=%d hardErrorM=%.8f ledgerErrorM3=%.10f replayError=%.8f"),*State.Name,FMath::Min(CutA.RutDepth,CutB.RutDepth),FMath::Max(CutA.RutDepth,CutB.RutDepth),HardNodes,HardError,Error,Replay);
    Frame(V,false);State.Phase=1;State.Time=0;return false;
  }
  if(State.Phase==1&&State.Time>.85f){
    Add(TEXT("fine and coarse ground retain visible coverage"),T->HasVisibleSoilCoverage(State.Boundary,150));
    int Samples=0;float Error=0;
    const bool Collision=T->ProbeSoilCollision(Samples,Error);
    Add(TEXT("rendered rut height and actual collider agree within one fifth inch"),Collision&&Samples>0&&Error<.5f,Error);
    Capture(*(TEXT("native-rut-transition-")+State.Name+TEXT("-oblique.png")));
    State.Phase=2;State.Time=0;return false;
  }
  if(State.Phase==2&&State.Time>.2f){Frame(V,true);State.Phase=3;State.Time=0;return false;}
  if(State.Phase==3&&State.Time>.5f){
    Capture(*(TEXT("native-rut-transition-")+State.Name+TEXT("-profile.png")));
    // Screenshot requests are processed after this tick. Keep both the
    // camera and the stamped ground alive before advancing or quitting.
    State.Phase=4;State.Time=0;return false;
  }
  if(State.Phase==4&&State.Time>.3f){
    if(++State.Index<7){State.Phase=0;State.Time=0;return false;}
    T->ResetSoil();if(State.Camera.IsValid())State.Camera->Destroy();State.Camera.Reset();return true;
  }
  return false;
}
}
