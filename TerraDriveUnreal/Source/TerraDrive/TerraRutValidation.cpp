#include "TerraRutValidation.h"
#include "TerraRutDriveValidation.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
#include "TerraContact.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"

namespace TerraRutValidation {
namespace {
struct FRutState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<ACameraActor> Camera;
  int Scenario=0,Phase=0;
  float Time=0,FirstDepth=0;
  TArray<float> FirstProfile;
  FVector Center=FVector::ZeroVector;
  bool PatchValid=false;
};
FRutState State;
const int Zones[]={0,3,7,4,5,0};
const int Surfaces[]={0,2,6,3,5,0};
const TCHAR *Names[]={TEXT("firm dirt"),TEXT("mud"),TEXT("snow"),TEXT("wet grass"),TEXT("sand"),TEXT("loose dirt")};
const TCHAR *Oblique[]={TEXT("native-rut-firm-dirt-oblique.png"),TEXT("native-rut-mud-oblique.png"),TEXT("native-rut-snow-oblique.png"),TEXT("native-rut-wet-grass-oblique.png"),TEXT("native-rut-sand-oblique.png"),TEXT("native-rut-loose-dirt-oblique.png")};
const TCHAR *Close[]={TEXT("native-rut-firm-dirt-profile.png"),TEXT("native-rut-mud-profile.png"),TEXT("native-rut-snow-profile.png"),TEXT("native-rut-wet-grass-profile.png"),TEXT("native-rut-sand-profile.png"),TEXT("native-rut-loose-dirt-profile.png")};
bool Matches(ATerraWorld *T,FVector P,int I){
  const auto S=T->Sample(P);const auto B=T->SurfaceBlend(P.X,P.Y);
  return S.Surface==Surfaces[I]&&B.Weight[Surfaces[I]]>.97f&&S.Normal.Z>.965f&&
      (I==0?S.Softness<.14f:I==5?S.Softness>.60f:true);
}
void Frame(ATerraVehicle *V,bool CloseView){
  if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
  const FVector Focus=State.Center+FVector(CloseView?70:10,30,0);
  const FVector Eye=Focus+(CloseView?FVector(-140,-175,105):FVector(-480,-420,300));
  State.Camera->SetActorLocationAndRotation(Eye,(Focus-Eye).Rotation());
  State.Camera->GetCameraComponent()->SetFieldOfView(CloseView?54:61);
  if(auto *PC=Cast<APlayerController>(V->GetController())){
    PC->SetViewTarget(State.Camera.Get());if(auto *HUD=PC->GetHUD())HUD->bShowHUD=false;
  }
}
void Stamp(ATerraWorld *T,int Passes,float Slip){
  // A 0.32 m tire travels 2 m/s: 5 cm sample spacing with 25 ms exposure.
  // Each pass has both wheel lines and no artificial longitudinal piles.
  for(int Pass=0;Pass<Passes;++Pass)for(int I=0;I<=120;++I)for(int Side:{-1,1}){
    FVector P=State.Center+FVector(-300+I*5,Side*80,0);
    P.Z=T->Height(P.X,P.Y);
    T->Deform(P,FVector::ForwardVector,5500,24,.32f,.30f,Slip,2,.025f);
  }
}
float Depth(ATerraWorld *T,FVector P){return T->Sample(P).RutDepth;}
TArray<float> Profile(ATerraWorld *T){
  TArray<float> Result;
  // Compare the physical floor, both shoulders, packing and shear history.
  // The second run starts with a cleared cache but identical world positions.
  for(int Along=-200;Along<=200;Along+=50)for(int Side:{-1,1})for(int Across=-70;Across<=70;Across+=5){
    const auto S=T->Sample(State.Center+FVector(Along,Side*80+Across,0));
    Result.Add(S.Displacement);Result.Add(S.Packing);Result.Add(S.Churn);
  }
  return Result;
}
struct FBankSpread {float AlongVariation=0,Asymmetry=0;};
FBankSpread BankSpread(ATerraWorld *T){
  FBankSpread Result;float Difference=0,Total=0;
  for(int TireSide:{-1,1}){
    float Minimum[2]={FLT_MAX,FLT_MAX},Maximum[2]={0,0};
    for(int Along=-175;Along<=175;Along+=25){
      float Mass[2]={0,0},Moment[2]={0,0};
      for(int BankSide=0;BankSide<2;++BankSide)for(int I=1;I<=28;++I){
        const float Offset=I*2.5f;
        const auto S=T->Sample(State.Center+FVector(Along,TireSide*80+(BankSide?1:-1)*Offset,0));
        const float Bank=FMath::Max(0.f,S.Displacement);
        Mass[BankSide]+=Bank;Moment[BankSide]+=Bank*Offset*.01f;
      }
      for(int Side=0;Side<2;++Side)if(Mass[Side]>.00001f){
        const float Radius=Moment[Side]/Mass[Side];
        Minimum[Side]=FMath::Min(Minimum[Side],Radius);Maximum[Side]=FMath::Max(Maximum[Side],Radius);
      }
      Difference+=FMath::Abs(Mass[0]-Mass[1]);Total+=Mass[0]+Mass[1];
    }
    for(int Side=0;Side<2;++Side)if(Minimum[Side]<FLT_MAX)
      Result.AlongVariation=FMath::Max(Result.AlongVariation,Maximum[Side]-Minimum[Side]);
  }
  Result.Asymmetry=Total>.00001f?Difference/Total:0;
  return Result;
}
}
bool Tick(ATerraVehicle *V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture){
  if(FParse::Param(FCommandLine::Get(),TEXT("TerraRutDriveOnly")))return TerraRutDriveValidation::Tick(V,Dt,Check,Capture);
  if(State.Vehicle.Get()!=V){State=FRutState();State.Vehicle=V;}
  State.Time+=Dt;auto *T=V->Terrain.Get();
  auto Add=[&](const FString &Name,bool Pass,float Value=0.f){Check(FString(Names[FMath::Min(State.Scenario,5)])+TEXT(" ")+Name,Pass,Value);};
  if(State.Phase==0){
    V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);
    V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    T->ResetSoil();
    // Zone spawn furniture must not sit inside a stamped strip or obscure a
    // close profile. Keep the identical physical input/eligibility criteria,
    // but search around an open patch southwest of the spawn signage.
    const FVector Origin=T->Spawns[Zones[State.Scenario]]-FVector(600,600,0);
    float Best=FLT_MAX;State.PatchValid=false;
    for(int X=-22;X<=22;++X)for(int Y=-22;Y<=22;++Y){
      const float Cost=X*X+Y*Y;if(Cost>=Best)continue;
      const FVector P=Origin+FVector(X*150,Y*150,0);bool Valid=true;
      for(float Along:{-340.f,0.f,340.f})for(float Across:{-180.f,0.f,180.f})Valid&=Matches(T,P+FVector(Along,Across,0),State.Scenario);
      if(Valid){Best=Cost;State.Center=P;State.PatchValid=true;}
    }
    State.Center.Z=T->Height(State.Center.X,State.Center.Y);
    Add(TEXT("rut fixture uses pure matching gentle terrain"),State.PatchValid);
    Stamp(T,1,.08f);State.FirstDepth=Depth(T,State.Center+FVector(0,80,0));
    Frame(V,false);State.Time=0;State.Phase=1;return false;
  }
  if(State.Phase==1&&State.Time>.8f){
    const bool Firm=State.Scenario==0;
    float Minimum=FLT_MAX,Maximum=0,PeakBerm=0,PeakStep=0,PeakCurvature=0,Packed=0,MaxCrossSlope=0;
    bool Finite=true;int Samples=0;
    for(int Side:{-1,1}){
      float Previous=0,PreviousStep=0;bool HasPrevious=false;
      for(int I=0;I<=160;++I){
        const FVector P=State.Center+FVector(-200+I*2.5,Side*80,0);const auto S=T->Sample(P);
        Finite&=FMath::IsFinite(S.Height)&&FMath::IsFinite(S.Displacement)&&!S.Normal.ContainsNaN();
        Minimum=FMath::Min(Minimum,S.RutDepth);Maximum=FMath::Max(Maximum,S.RutDepth);Packed=FMath::Max(Packed,S.Packing);++Samples;
        if(HasPrevious){const float Step=S.Displacement-Previous;PeakStep=FMath::Max(PeakStep,FMath::Abs(Step));if(I>1)PeakCurvature=FMath::Max(PeakCurvature,FMath::Abs(Step-PreviousStep));PreviousStep=Step;}
        Previous=S.Displacement;HasPrevious=true;
        for(int Offset=-70;Offset<=70;Offset+=5)PeakBerm=FMath::Max(PeakBerm,T->Sample(P+FVector(0,Offset,0)).Displacement);
      }
      float CrossPrevious=0;bool First=true;
      for(int I=-50;I<=50;++I){const auto S=T->Sample(State.Center+FVector(0,Side*80+I*2,0));
        if(!First)MaxCrossSlope=FMath::Max(MaxCrossSlope,FMath::Abs(S.Displacement-CrossPrevious)/.02f);
        CrossPrevious=S.Displacement;First=false;
      }
    }
    const float Rim=T->Sample(State.Center+FVector(0,80+90,0)).Displacement;
    Add(TEXT("rolling tire paths are continuous through 322 fine samples"),Samples==322&&Finite&&Minimum>(Firm?.0003f:.008f),Minimum);
    Add(TEXT("loaded path has persistent packing"),Packed>.10f,Packed);
    Add(TEXT("rut depth remains appropriate to the surface"),Maximum<(Firm?.035f:State.Scenario==2?.45f:.36f),Maximum);
    Add(TEXT("rolling path has no alternating crater teeth"),PeakStep<.025f&&PeakCurvature<.018f,PeakStep);
    Add(TEXT("rut walls have finite drivable cross slopes"),MaxCrossSlope<2.2f,MaxCrossSlope);
    Add(TEXT("far shoulder returns to undisturbed terrain"),FMath::Abs(Rim)<.001f,Rim);
    Add(TEXT("ordinary rolling side banks stay below four inches"),PeakBerm<.1016f,PeakBerm);
    if(!Firm)Add(TEXT("loose material bunches beside the tires"),PeakBerm>.002f,PeakBerm);
    const auto Spread=BankSpread(T);
    if(!Firm){
      Add(TEXT("physical bank dispersion varies coherently along the wheel paths"),Spread.AlongVariation>.008f,Spread.AlongVariation);
      Add(TEXT("displaced shoulders have asymmetric material distribution"),Spread.Asymmetry>.025f,Spread.Asymmetry);
    }
    State.FirstProfile=Profile(T);
    Add(TEXT("physical marks add no black offroad rubber"),T->TireMarkCount()==0,T->TireMarkCount());
    const double Error=FMath::Abs(T->DepressedVolume-T->DisplacedVolume-T->CompactedVolume);
    Add(TEXT("excavation is accounted for as bank volume or compaction"),Error<.00001,float(Error));
    UE_LOG(LogTemp,Display,TEXT("TERRA_RUT_PROFILE surface=%s point=%s depthM=%.5f minM=%.5f bermM=%.5f stepM=%.5f curvatureM=%.5f wallSlope=%.5f packed=%.5f spreadM=%.5f asymmetry=%.5f removedM3=%.7f displacedM3=%.7f compactedM3=%.7f"),Names[State.Scenario],*State.Center.ToString(),Maximum,Minimum,PeakBerm,PeakStep,PeakCurvature,MaxCrossSlope,Packed,Spread.AlongVariation,Spread.Asymmetry,T->DepressedVolume,T->DisplacedVolume,T->CompactedVolume);
    Capture(Oblique[State.Scenario]);State.Time=0;State.Phase=2;return false;
  }
  if(State.Phase==2&&State.Time>.2f){Frame(V,true);State.Time=0;State.Phase=3;return false;}
  if(State.Phase==3&&State.Time>.8f){Capture(Close[State.Scenario]);State.Time=0;State.Phase=4;return false;}
  if(State.Phase==4&&State.Time>.2f){
    Stamp(T,2,.08f);const float Repeated=Depth(T,State.Center+FVector(0,80,0));
    Add(TEXT("repeated passes retain rather than raise the groove"),Repeated>=State.FirstDepth-.0001f,Repeated-State.FirstDepth);
    const float Before=Repeated;
    T->Deform(State.Center+FVector(0,80,0),FVector::ForwardVector,0,24,.32f,.30f,1,2,.2f);
    Add(TEXT("unloaded wheel cannot excavate terrain"),FMath::Abs(Depth(T,State.Center+FVector(0,80,0))-Before)<.000001f);
    T->ResetSoil();Add(TEXT("repair restores exact ground and clears all soil history"),T->DetailCount()==0&&T->CachedSoilCount()==0&&Depth(T,State.Center+FVector(0,80,0))==0);
    Stamp(T,1,.08f);const auto Replayed=Profile(T);float ReplayError=0;
    if(Replayed.Num()==State.FirstProfile.Num())for(int I=0;I<Replayed.Num();++I)
      ReplayError=FMath::Max(ReplayError,FMath::Abs(Replayed[I]-State.FirstProfile[I]));
    Add(TEXT("same world-space pass reproduces floor shoulders packing and churn"),Replayed.Num()==State.FirstProfile.Num()&&ReplayError<.000001f,ReplayError);
    T->ResetSoil();State.FirstProfile.Reset();
    if(++State.Scenario<6){State.Phase=0;State.Time=0;return false;}
    for(int Zone:{1,2}){
      FVector P=T->Spawns[Zone];const float Height=T->Height(P.X,P.Y);
      for(int I=0;I<20;++I)T->Deform(P,FVector::ForwardVector,8000,16,.35f,.35f,1,2,.025f);
      Check(Zone==1?TEXT("pavement never develops a physical soil rut"):TEXT("rock never develops a physical soil rut"),T->Height(P.X,P.Y)==Height&&T->DetailCount()==0,Depth(T,P));
    }
    if(auto *PC=Cast<APlayerController>(V->GetController()))PC->SetViewTarget(V);
    if(State.Camera.IsValid())State.Camera->Destroy();State.Camera.Reset();State.Phase=99;
  }
  return State.Phase==99?TerraRutDriveValidation::Tick(V,Dt,Check,Capture):false;
}
}
