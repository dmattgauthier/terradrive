#include "TerraPerimeterValidation.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"

namespace TerraPerimeterValidation {
namespace {
struct FTrailSample {
  FVector Position;
  int32 Sector;
};
struct FRun {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TArray<FTrailSample> Samples;
  int32 Route = INDEX_NONE, Closest = 0, LastSector = INDEX_NONE, SurfaceMask = 0;
  float Time = 0, NextLog = 0, WorstError = 0, FinishWait = 0, LastProgress = 0;
  bool Started = false, Finished = false;
};
FRun Run;
}

bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,
          TFunctionRef<void(const TCHAR*)> Capture) {
  auto* Terrain=V->Terrain.Get();
  if(Run.Vehicle.Get()!=V){
    Run=FRun();
    Run.Vehicle=V;
    const TSharedPtr<FJsonObject>* Trail=nullptr;
    const bool Exists=Terrain&&Terrain->Data->TryGetObjectField(TEXT("perimeterTrail"),Trail);
    if(Exists)Run.Route=(*Trail)->GetIntegerField(TEXT("routeIndex"));
    const bool Registered=Exists&&Terrain->Routes.IsValidIndex(Run.Route)&&
        Terrain->Routes[Run.Route].Name==TEXT("Perimeter Expedition")&&Terrain->Routes[Run.Route].Gates.Num()>100;
    Check(TEXT("perimeter route loads from cooked challenge data"),Registered,Run.Route);
    if(!Registered)return true;
    for(const auto& Value:(*Trail)->GetArrayField(TEXT("samples"))){
      const auto Sample=Value->AsObject();
      Run.Samples.Add({FVector(Sample->GetNumberField(TEXT("x"))*100,Sample->GetNumberField(TEXT("y"))*100,
        Sample->GetNumberField(TEXT("z"))*100),Sample->GetIntegerField(TEXT("sector"))});
    }
    V->SelectVehicle(0);
    V->SetGarage(true);
    V->ResetUpgrades(false);
    V->SetUpgrade(TerraSim::Tires,2,false);
    V->SetUpgrade(TerraSim::Suspension,1,false);
    V->SetUpgrade(TerraSim::TireAir,2,false);
    V->SetEnergyUsageEnabled(false,false);
    V->SetGarage(false);
    V->TestBrake=1;
    return false;
  }
  if(Run.Finished){
    Run.FinishWait+=Dt;
    return Run.FinishWait>.5f;
  }
  Run.Time+=Dt;
  if(!Run.Started){
    if(Run.Time<1.f)return false;
    V->TeleportRoute(Run.Route);
    Check(TEXT("ordinary route travel reaches the signed trailhead"),
      FVector::Dist2D(V->GetActorLocation(),Terrain->Routes[Run.Route].Spawn)<100,0);
    Run.Started=true;
  }
  if(Run.Time<2.5f)return false;

  const FVector P=V->GetActorLocation();
  const int32 Last=Run.Samples.Num()-1;
  int32 Closest=Run.Closest;
  double Best=TNumericLimits<double>::Max();
  for(int32 I=FMath::Max(0,Run.Closest-2);I<=FMath::Min(Last,Run.Closest+14);++I){
    const double Error=FVector::DistSquared2D(P,Run.Samples[I].Position);
    if(Error<Best){Best=Error;Closest=I;}
  }
  if(Closest>Run.Closest){Run.Closest=Closest;Run.LastProgress=Run.Time;}
  Run.WorstError=FMath::Max(Run.WorstError,float(FMath::Sqrt(Best)));
  for(int I=0;I<V->WheelCount();++I){
    const auto& Wheel=V->WheelState[I];
    if(Wheel.ContactValid&&Wheel.Load>50&&Wheel.Ground.Surface<7)
      Run.SurfaceMask|=1<<Wheel.Ground.Surface;
  }

  const auto& Here=Run.Samples[Run.Closest];
  if(Here.Sector!=Run.LastSector){
    if(Here.Sector==3)V->RequestTirePressure(28,false);
    if(Here.Sector==10)V->RequestTirePressure(22,false);
    Capture(*FString::Printf(TEXT("perimeter-sector-%02d.png"),Here.Sector));
    Run.LastSector=Here.Sector;
  }
  const int32 Look=FMath::Clamp(FMath::RoundToInt(2.7f+FMath::Abs(V->Speed)*.38f),3,7);
  FVector Target=Run.Samples[FMath::Min(Last,Run.Closest+Look)].Position;
  if(Run.Closest+Look>=Last){
    Target+=(Run.Samples[Last].Position-Run.Samples[Last-1].Position).GetSafeNormal2D()*900;
  }
  const float Error=FMath::FindDeltaAngleDegrees(V->GetActorRotation().Yaw,(Target-P).Rotation().Yaw);
  const float Turn=FMath::Abs(Error);
  const float Grade=(Target.Z-Here.Position.Z)/FMath::Max(200.,FVector::Dist2D(Target,Here.Position));
  float Desired=FMath::GetMappedRangeValueClamped(FVector2D(4,35),FVector2D(10,3.6),Turn);
  if(Here.Sector==2||Here.Sector==4||Here.Sector==5||Here.Sector>=8)Desired=FMath::Min(Desired,6.f);
  if(Grade<-.17f)Desired=FMath::Min(Desired,4.f);
  V->TestSteer=FMath::Clamp(Error/28.f*(1+FMath::Abs(V->Speed)*.025f),-.94f,.94f);
  V->TestThrottle=FMath::Clamp((Desired-V->Speed)*.19f+.10f+FMath::Max(0.f,Grade)*.45f,0.f,.88f);
  V->TestBrake=FMath::Clamp((V->Speed-Desired-.35f)*.24f,0.f,.72f);
  if(Here.Sector==10&&!V->LowRange&&V->HasLowRange()){
    if(FMath::Abs(V->Speed)<.45f){V->LowRange=true;V->ToggleLocker(false);}
    else{V->TestThrottle=0;V->TestBrake=1;}
  }
  if(Run.Time>=Run.NextLog){
    UE_LOG(LogTemp,Display,TEXT("TERRA_PERIMETER t=%.1f sector=%d gate=%d sample=%d errorCM=%.1f mph=%.2f contacts=%d xyz=%s"),
      Run.Time,Here.Sector,V->GateIndex,Run.Closest,FMath::Sqrt(Best),V->Speed*2.23694f,V->ContactCount,*P.ToString());
    Run.NextLog=Run.Time+10;
  }
  const int32 Gates=Terrain->Routes[Run.Route].Gates.Num();
  if(V->GateIndex==Gates||Run.Time>840||Run.Time-Run.LastProgress>25||V->Overturned||Best>FMath::Square(1800.f)){
    Check(TEXT("vehicle completes a continuous lap through every signed gate"),V->GateIndex==Gates,V->GateIndex);
    Check(TEXT("lap drives on all seven terrain surfaces"),Run.SurfaceMask==127,Run.SurfaceMask);
    Check(TEXT("vehicle stays upright and within the trail shoulders"),!V->Overturned&&Run.WorstError<370,Run.WorstError);
    V->TestThrottle=V->TestSteer=0;
    V->TestBrake=1;
    Capture(TEXT("perimeter-finish.png"));
    Run.Finished=true;
  }
  return false;
}
}
