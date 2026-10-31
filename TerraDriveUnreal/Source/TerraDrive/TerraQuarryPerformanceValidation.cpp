#include "TerraQuarryPerformanceValidation.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
#include "Components/BoxComponent.h"
#include "Engine/Engine.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProfilingDebugging/MiscTrace.h"
#include "Serialization/JsonSerializer.h"

namespace TerraQuarryPerformanceValidation {
namespace {
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TArray<FVector> Samples;
  TArray<double> Frames;
  TSharedPtr<FJsonObject> Report;
  FVector Start=FVector::ZeroVector;
  double Started=0,Previous=0,Seconds=30;
  float Wheelbase=3,MaximumLineError=0;
  int Phase=-1,Closest=0;
  bool Finite=true;
} State;
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture){
  const double Now=FPlatformTime::Seconds();
  if(State.Vehicle.Get()!=V){
    State=FState();State.Vehicle=V;
    const bool Real=!FApp::UseFixedTimeStep()&&!GEngine->bUseFixedFrameRate;
    Check(TEXT("quarry performance uses real elapsed time and normal physics"),Real,Dt);
    if(!Real)return true;
    for(const auto& Value:V->Terrain->Data->GetObjectField(TEXT("quarryTrail"))->GetArrayField(TEXT("samples"))){
      const auto P=Value->AsObject();State.Samples.Add(FVector(P->GetNumberField(TEXT("x"))*100,
        P->GetNumberField(TEXT("y"))*100,P->GetNumberField(TEXT("z"))*100));
    }
    V->SelectVehicle(5);V->ResetUpgrades(false);V->SetGarage(false);
    V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    State.Wheelbase=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[5]->AsObject()->GetNumberField(TEXT("wheelbase"));
    State.Started=Now;
    return false;
  }
  if(State.Phase==2){
    if(Now-State.Started<2)return false;
    const double ResetStart=FPlatformTime::Seconds();V->Terrain->ResetSoil();
    const double ResetMS=(FPlatformTime::Seconds()-ResetStart)*1000;
    const bool Legacy=FParse::Param(FCommandLine::Get(),TEXT("TerraLegacySoilReset"));
    Check(TEXT("terrain repair clears active and cached deformation"),V->Terrain->DetailCount()==0&&V->Terrain->CachedSoilCount()==0,V->Terrain->DetailCount());
    Check(TEXT("terrain repair rebuilds only the intended coarse chunks"),Legacy?
      V->Terrain->LastSoilResetRebuiltChunks==V->Terrain->CoarseChunkCount():
      V->Terrain->LastSoilResetRebuiltChunks<V->Terrain->CoarseChunkCount(),V->Terrain->LastSoilResetRebuiltChunks);
    State.Report->SetNumberField(TEXT("terrainResetMS"),ResetMS);
    State.Report->SetNumberField(TEXT("terrainResetChunks"),V->Terrain->LastSoilResetRebuiltChunks);
    State.Report->SetBoolField(TEXT("legacySoilReset"),Legacy);
    State.Phase=3;State.Started=FPlatformTime::Seconds();return false;
  }
  if(State.Phase==3){
    if(Now-State.Started<2)return false;
    Check(TEXT("terrain repair retains visible ground coverage"),V->Terrain->HasVisibleSoilCoverage(V->GetActorLocation()),0);
    Check(TEXT("terrain repair keeps the vehicle supported"),V->ContactCount>=2&&V->GetActorUpVector().Z>.7f,V->ContactCount);
    FString Report,Json;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);
    FJsonSerializer::Serialize(State.Report.ToSharedRef(),TJsonWriterFactory<>::Create(&Json));
    FFileHelper::SaveStringToFile(Json,*(FPaths::GetPath(Report)/TEXT("quarry-performance.json")));
    Capture(TEXT("quarry-after-terrain-repair.png"));return true;
  }
  if(State.Phase==-1){
    // Finish the vehicle's physics-body replacement before selecting a route,
    // as separate ordinary garage and travel actions do. Verify placement.
    if(Now-State.Started<.5)return false;
    V->TeleportRoute(8);
    const double Error=FVector::Dist2D(V->GetActorLocation(),V->Terrain->Routes[8].Spawn);
    Check(TEXT("quarry performance places the stock vehicle at the live route entrance"),Error<100,Error);
    State.Phase=0;State.Started=Now;return false;
  }
  if(State.Phase==0){
    if(Now-State.Started<2)return false;
    const double PlacementError=FVector::Dist2D(V->GetActorLocation(),V->Terrain->Routes[8].Spawn);
    Check(TEXT("quarry performance remains at the entrance after physics settles"),PlacementError<250,PlacementError);
    if(PlacementError>=250)return true;
    Check(TEXT("quarry performance stock Urus settles on its tires"),V->ContactCount>=2&&V->GetActorUpVector().Z>.8f,V->ContactCount);
    State.Start=V->GetActorLocation();State.Started=State.Previous=Now;State.Phase=1;
    TRACE_BEGIN_REGION(TEXT("quarry-performance-drive"));
    UE_LOG(LogTemp,Display,TEXT("TERRA_QUARRY_PERF_BEGIN sharedSections=%d seconds=%.1f"),V->Terrain->UsesSharedGroundSections(),State.Seconds);
    return false;
  }
  State.Frames.Add((Now-State.Previous)*1000);State.Previous=Now;
  const FVector P=V->GetActorLocation();float Best=FLT_MAX;int Closest=State.Closest;
  for(int I=FMath::Max(0,State.Closest-3);I<FMath::Min(State.Samples.Num(),State.Closest+12);++I){
    const float D=FVector::DistSquared2D(P,State.Samples[I]);if(D<Best){Best=D;Closest=I;}
  }
  State.Closest=FMath::Max(State.Closest,Closest);State.MaximumLineError=FMath::Max(State.MaximumLineError,FMath::Sqrt(Best));
  const FVector Target=State.Samples[FMath::Min(Closest+3,State.Samples.Num()-1)];
  const float Error=FMath::FindDeltaAngleDegrees(V->GetActorRotation().Yaw,(Target-P).Rotation().Yaw);
  const float Lookahead=FMath::Max(3.f,float(FVector::Dist2D(Target,P)/100));
  const float Angle=FMath::Atan2(2*State.Wheelbase*FMath::Sin(FMath::DegreesToRadians(Error)),Lookahead);
  V->TestSteer=FMath::Clamp(Angle/FMath::DegreesToRadians(34)*(1+FMath::Abs(V->Speed)*.025f),-.75f,.75f);
  const float Desired=FMath::Abs(Error)>25?2.6f:4.f;
  V->TestThrottle=FMath::Clamp((Desired-V->Speed)*.18f,.02f,.55f);V->TestBrake=V->Speed>Desired+.6f?.32f:0;
  State.Finite&=!P.ContainsNaN()&&!V->Chassis->GetPhysicsLinearVelocity().ContainsNaN();
  if(Now-State.Started<State.Seconds&&!V->Overturned)return false;
  TRACE_END_REGION(TEXT("quarry-performance-drive"));
  const double Elapsed=Now-State.Started;
  auto Sorted=State.Frames;Sorted.Sort();double Sum=0;for(double X:Sorted)Sum+=X;
  const double Mean=Sum/FMath::Max(1,Sorted.Num()),P95=Sorted[FMath::Min(Sorted.Num()-1,int(Sorted.Num()*.95))];
  const auto Soil=V->Terrain->SoilCollisionStats();
  Check(TEXT("quarry performance measures the complete live driving window"),Elapsed>=State.Seconds&&Sorted.Num()>60,Elapsed);
  Check(TEXT("quarry performance drives stock tires over real terrain"),State.Finite&&!V->Overturned&&FVector::Dist2D(State.Start,P)>3000,FVector::Dist2D(State.Start,P)/30.48);
  Check(TEXT("quarry performance stays on the trail"),State.MaximumLineError<450,State.MaximumLineError/30.48);
  Check(TEXT("quarry performance keeps the original collision height bound"),Soil.LiveTriangles>0&&Soil.MaximumHeightErrorCM<=.5001,Soil.MaximumHeightErrorCM/2.54);
  Check(TEXT("quarry performance reads installed collision vertices"),Soil.CollisionVertices>0&&Soil.CollisionVertices<=Soil.RenderVertices,Soil.CollisionVertices);
  int CollisionSamples=0;float CollisionErrorCM=0;
  const bool PhysicalSurface=V->Terrain->ProbeSoilCollision(CollisionSamples,CollisionErrorCM);
  Check(TEXT("quarry performance raycasts the actual deformed body collider within one fifth inch"),PhysicalSurface&&CollisionErrorCM<=.5001,CollisionErrorCM/2.54);
  auto Root=MakeShared<FJsonObject>();
  Root->SetBoolField(TEXT("fixedClock"),false);Root->SetNumberField(TEXT("elapsedSeconds"),Elapsed);
  Root->SetNumberField(TEXT("frames"),Sorted.Num());Root->SetNumberField(TEXT("meanFrameMS"),Mean);
  Root->SetNumberField(TEXT("p95FrameMS"),P95);Root->SetNumberField(TEXT("maximumFrameMS"),Sorted.Last());Root->SetNumberField(TEXT("averageFPS"),1000/Mean);
  Root->SetNumberField(TEXT("distanceFt"),FVector::Dist2D(State.Start,P)/30.48);Root->SetNumberField(TEXT("gates"),V->GateIndex);
  Root->SetNumberField(TEXT("maximumLineErrorFt"),State.MaximumLineError/30.48);Root->SetNumberField(TEXT("activeSoilTiles"),V->Terrain->DetailCount());
  Root->SetNumberField(TEXT("renderVertices"),Soil.RenderVertices);Root->SetNumberField(TEXT("collisionVertices"),Soil.CollisionVertices);
  Root->SetNumberField(TEXT("renderSections"),Soil.RenderSections);Root->SetNumberField(TEXT("coarseSections"),Soil.CoarseSections);
  Root->SetNumberField(TEXT("renderTriangles"),Soil.FullTriangles);Root->SetNumberField(TEXT("collisionTriangles"),Soil.LiveTriangles);
  Root->SetNumberField(TEXT("maximumCollisionErrorIn"),Soil.MaximumHeightErrorCM/2.54);
  Root->SetNumberField(TEXT("physicalCollisionSamples"),CollisionSamples);Root->SetNumberField(TEXT("physicalCollisionErrorIn"),CollisionErrorCM/2.54);
  Root->SetBoolField(TEXT("sharedSections"),V->Terrain->UsesSharedGroundSections());
  Root->SetStringField(TEXT("startPosition"),State.Start.ToString());Root->SetStringField(TEXT("endPosition"),P.ToString());
  TArray<TSharedPtr<FJsonValue>> Times;for(double X:State.Frames)Times.Add(MakeShared<FJsonValueNumber>(X));Root->SetArrayField(TEXT("frameTimesMS"),Times);
  FString Report,Json;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);
  FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Json));
  FFileHelper::SaveStringToFile(Json,*(FPaths::GetPath(Report)/TEXT("quarry-performance.json")));
  UE_LOG(LogTemp,Display,TEXT("TERRA_QUARRY_PERF_RESULT frames=%d seconds=%.3f fps=%.3f meanMS=%.3f p95MS=%.3f distanceFt=%.2f renderVertices=%d collisionVertices=%d sharedSections=%d"),
      Sorted.Num(),Elapsed,1000/Mean,Mean,P95,FVector::Dist2D(State.Start,P)/30.48,Soil.RenderVertices,Soil.CollisionVertices,V->Terrain->UsesSharedGroundSections());
  V->TestThrottle=V->TestSteer=0;V->TestBrake=1;Capture(TEXT("quarry-performance-end.png"));
  State.Report=Root;State.Phase=2;State.Started=FPlatformTime::Seconds();return false;
}
}
