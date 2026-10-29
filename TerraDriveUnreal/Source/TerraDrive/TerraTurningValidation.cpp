#include "TerraTurningValidation.h"
#include "TerraVehicle.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"

namespace TerraTurningValidation {
namespace {
struct FTrial {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  int Trial=0,Phase=0,Frames=0,FullLockFrames=0,Supported[4]={},Moving[4]={},Stopped[4]={};
  float Time=0,LastPhase[4]={},AngleTravel[4]={},Distance=0;
  FVector Previous=FVector::ZeroVector;
  bool Pose=true,Rims=true,Counter=false,Shot=false;
};
FTrial State;
constexpr int CasesPerVehicle=4,ExtraLockedCases=8,ChecksPerTrial=13;
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Count=ATerraVehicle::VehicleCount*CasesPerVehicle+ExtraLockedCases;
  const float Radius=V->TireDiameter()*.0127f;
  if(State.Vehicle.Get()!=V){
    State=FTrial();State.Vehicle=V;
    FString Report;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);
    FFileHelper::SaveStringToFile(FString::Printf(TEXT("{\"version\":1,\"vehicles\":%d,\"casesPerVehicle\":%d,\"lockedCases\":%d,\"checksPerTrial\":%d,\"trials\":%d,\"expectedChecks\":%d}"),ATerraVehicle::VehicleCount,CasesPerVehicle,ExtraLockedCases,ChecksPerTrial,Count,Count*ChecksPerTrial),*(FPaths::GetPath(Report)/TEXT("turning-fixtures.json")));
  }
  if(State.Trial>=Count)return true;
  const bool Locked=State.Trial>=ATerraVehicle::VehicleCount*CasesPerVehicle;
  const int Vehicle=Locked?((State.Trial-ATerraVehicle::VehicleCount*CasesPerVehicle)/4==0?0:8):State.Trial/4;
  const int Mode=State.Trial%4,Direction=Mode<2?1:-1;const float Steering=Mode%2?1.f:-1.f;
  const FString Label=FString::Printf(TEXT("turning v%d %s %s %s "),Vehicle,Direction>0?TEXT("forward"):TEXT("reverse"),Steering>0?TEXT("right"):TEXT("left"),Locked?TEXT("locked"):TEXT("stock"));
  if(State.Phase==0){
    V->SetGarage(true);V->SelectVehicle(Vehicle);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);
    V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;V->Direction=Direction;
    if(Locked){V->FourDrive=true;V->LowRange=true;V->FrontLocked=V->RearLocked=true;}
    State.Phase=1;State.Time=0;return false;
  }
  // Observe the same simulation interval as the vehicle and Chaos' capped
  // substeps, including a slow real-time render frame. The matrix must not
  // finish its coast before those contacts have actually been simulated.
  State.Time+=FMath::Min(Dt,.1f);
  if(State.Phase==1&&State.Time>=1.5f){
    V->TestBrake=0;V->TestThrottle=0;V->TestSteer=V->Steer=Steering;
    V->Chassis->SetPhysicsLinearVelocity(V->GetActorForwardVector()*Direction*500);
    V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
    for(int I=0;I<4;I++)V->WheelState[I].Omega=Direction*5/Radius;
    State.Time=0;State.Phase=2;State.Frames=State.FullLockFrames=0;State.Pose=State.Rims=true;State.Counter=State.Shot=false;
    State.Previous=V->GetActorLocation();State.Distance=0;
    for(int I=0;I<4;I++){State.LastPhase[I]=V->WheelState[I].Rotation;State.AngleTravel[I]=0;State.Supported[I]=State.Moving[I]=State.Stopped[I]=0;}
    return false;
  }
  if(State.Phase==2){
    if(FMath::Abs(V->Steer)>.99f&&(FMath::Abs(V->WheelState[0].Angle)+FMath::Abs(V->WheelState[1].Angle))*.5f>.40f)State.FullLockFrames++;
    State.Frames++;State.Distance+=FVector::Dist2D(State.Previous,V->GetActorLocation())/100;State.Previous=V->GetActorLocation();
    for(int I=0;I<4;I++){
      const auto &W=V->WheelState[I];
      if(W.ContactValid&&W.Load>150){State.Supported[I]++;
        if(FMath::Abs(W.LongSpeed)>.75f){State.Moving[I]++;if(FMath::Abs(W.Omega)*Radius<.05f)State.Stopped[I]++;}
      }
      State.AngleTravel[I]+=FMath::Abs(W.Rotation-State.LastPhase[I]);State.LastPhase[I]=W.Rotation;
      const FQuat Expected=FQuat(V->GetActorUpVector(),W.Angle)*V->GetActorQuat()*FQuat(FVector::RightVector,W.Rotation);
      State.Pose&=V->Wheels[I]->GetComponentQuat().Equals(Expected,.002f);
      State.Rims&=V->Rims.IsValidIndex(I)&&V->Rims[I]->GetComponentQuat().Equals(V->Wheels[I]->GetComponentQuat(),.002f);
      State.Counter|=W.ContactValid&&W.Load>150&&W.LongSpeed*Direction>1&&W.Omega*Direction<-.2f;
    }
    if(!State.Shot&&State.Time>=.75f&&(Vehicle==0||Vehicle==7||Vehicle==8)){
      Capture(*FString::Printf(TEXT("native-turning-v%d-case%d-%s.png"),Vehicle,Mode,Locked?TEXT("locked"):TEXT("stock")));State.Shot=true;
    }
    if(State.Time>=1.5f){
      for(int I=0;I<4;I++){
        Check(Label+FString::Printf(TEXT("wheel %d remains supported and observed moving"),I),State.Supported[I]>=12&&State.Moving[I]>=10,State.Moving[I]);
        Check(Label+FString::Printf(TEXT("wheel %d turns continuously while its contact moves"),I),State.Stopped[I]==0&&State.AngleTravel[I]>1,State.Stopped[I]);
      }
      Check(Label+TEXT("wheel orientation includes steering and the actual rolling phase"),State.Pose,State.Frames);
      Check(Label+TEXT("all separate rims follow their wheel rotation"),State.Rims,State.Frames);
      Check(Label+TEXT("contact does not counter-rotate against travel without brakes"),!State.Counter,State.Distance);
      Check(Label+TEXT("unbraked full-lock coast retains real vehicle motion"),State.Distance>1.5f&&!V->Overturned,State.Distance);
      Check(Label+TEXT("actual front wheels reach full steering demand during the coast"),State.FullLockFrames>=12,State.FullLockFrames);
      UE_LOG(LogTemp,Display,TEXT("TERRA_TURNING trial=%d vehicle=%d mode=%d locked=%d frames=%d distance=%.3f moving=%d,%d,%d,%d stops=%d,%d,%d,%d"),State.Trial,Vehicle,Mode,Locked,State.Frames,State.Distance,State.Moving[0],State.Moving[1],State.Moving[2],State.Moving[3],State.Stopped[0],State.Stopped[1],State.Stopped[2],State.Stopped[3]);
      V->TestBrake=1;V->TestSteer=0;State.Trial++;State.Phase=0;
    }
  }
  return false;
}
}
