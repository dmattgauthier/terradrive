#include "TerraRolloverPerformanceValidation.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
#include "Components/BoxComponent.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "ProfilingDebugging/MiscTrace.h"
#include "HAL/IConsoleManager.h"
#include "PhysicsEngine/PhysicsSettings.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace TerraRolloverPerformanceValidation {
namespace {
struct FCase {int Vehicle,Zone,Roll;};
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TArray<FVector> Probes[ATerraVehicle::VehicleCount];
  TArray<FCase> Cases;TArray<TSharedPtr<FJsonValue>> Reports;
  TArray<float> Frames;int Trial=0,Phase=0;double PhaseStarted=0,Previous=0;
  bool Finite=true,PoseSeen=false;FString Region,Directory;
} State;
FString Name(const FCase& C){return FString::Printf(TEXT("roll-perf-v%d-z%d-r%d"),C.Vehicle,C.Zone,C.Roll);}
bool Load(ATerraVehicle* V){
  FString Json;TSharedPtr<FJsonObject> Root;
  if(!FFileHelper::LoadFileToString(Json,*(FPaths::ProjectContentDir()/TEXT("NativeData/vehicle-collision.json")))||
     !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root))return false;
  const auto& Vehicles=Root->GetArrayField(TEXT("vehicles"));if(Vehicles.Num()!=ATerraVehicle::VehicleCount)return false;
  for(int I=0;I<Vehicles.Num();++I)for(const auto& Value:Vehicles[I]->AsObject()->GetArrayField(TEXT("rolloverProbes"))){
    const auto& A=Value->AsArray();if(A.Num()!=3)return false;State.Probes[I].Add(FVector(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber()));
  }
  FString Build;FParse::Value(FCommandLine::Get(),TEXT("TerraPerfBuild="),Build);
  if(!Build.IsEmpty()&&!V->LoadGarage(Build))return false;
  int Vehicle=6;FParse::Value(FCommandLine::Get(),TEXT("TerraPerfVehicle="),Vehicle);
  const bool All=FParse::Param(FCommandLine::Get(),TEXT("TerraPerfAllVehicles"));
  for(int I=0;I<ATerraVehicle::VehicleCount;++I)if(All||I==Vehicle)
    for(int Zone:{0,2,6})for(int Roll:{0,90,180})State.Cases.Add({I,Zone,Roll});
  FString Report;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);State.Directory=FPaths::GetPath(Report);
  return !State.Cases.IsEmpty();
}
void Place(ATerraVehicle* V,const FCase& C){
  FVector P=V->Terrain->Spawns[C.Zone];
  // Use a clear area and the actual mesh probes/deformed ground. There is no
  // pose constraint, substitute ground, disabled collision or fixed clock.
  if(C.Zone==0)P+=FVector(-1500,1200,0);
  const FQuat Q=FRotator(0,0,C.Roll).Quaternion();float Z=-100000;
  for(const auto& Local:State.Probes[C.Vehicle]){const auto Offset=Q.RotateVector(Local);Z=FMath::Max(Z,V->Terrain->Height(P.X+Offset.X,P.Y+Offset.Y)-float(Offset.Z));}
  P.Z=C.Roll==0?V->Terrain->Height(P.X,P.Y)+V->ExpectedRideHeight()*100+25:Z+20;
  V->SetActorLocationAndRotation(P,Q,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  V->ResetContactTelemetry();State.Finite=true;State.PoseSeen=false;
}
void Save(){
  auto Root=MakeShared<FJsonObject>();Root->SetNumberField(TEXT("version"),1);Root->SetBoolField(TEXT("fixedClock"),FApp::UseFixedTimeStep()||GEngine->bUseFixedFrameRate);
  Root->SetNumberField(TEXT("requestedRenderCapFPS"),20);Root->SetArrayField(TEXT("cases"),State.Reports);
  const auto* Physics=UPhysicsSettings::Get();
  Root->SetNumberField(TEXT("rigidBodyHz"),1.f/Physics->MaxSubstepDeltaTime);
  Root->SetNumberField(TEXT("maximumPhysicsSubsteps"),Physics->MaxSubsteps);
  Root->SetNumberField(TEXT("maximumCoveredSeconds"),Physics->MaxSubstepDeltaTime*Physics->MaxSubsteps);
  FString Json;FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Json));FFileHelper::SaveStringToFile(Json,*(State.Directory/TEXT("rollover-performance.json")));
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const double Now=FPlatformTime::Seconds();
  if(State.Vehicle.Get()!=V){
    State=FState();State.Vehicle=V;const bool Ready=Load(V);Check(TEXT("rollover performance loads matching bodies and selected build"),Ready,State.Cases.Num());
    Check(TEXT("rollover performance uses actual real-time frames"),!FApp::UseFixedTimeStep()&&!GEngine->bUseFixedFrameRate,0);
    const auto* Mode=IConsoleManager::Get().FindConsoleVariable(TEXT("p.Chaos.Collision.ConvexTriMeshMode"));
    const int Expected=FParse::Param(FCommandLine::Get(),TEXT("TerraLegacyRolloverContacts"))?1:2;
    Check(TEXT("rollover performance uses the intended live contact generator"),Mode&&Mode->GetInt()==Expected,Mode?Mode->GetInt():-1);
    const auto* Physics=UPhysicsSettings::Get();
    const bool LegacySteps=FParse::Param(FCommandLine::Get(),TEXT("TerraLegacyRolloverSteps"));
    const float ExpectedStep=1.f/(LegacySteps?120.f:60.f);
    Check(TEXT("rollover performance uses the intended bounded physics schedule"),Physics->bSubstepping&&
      FMath::IsNearlyEqual(Physics->MaxSubstepDeltaTime,ExpectedStep,.0000001f)&&Physics->MaxSubsteps==(LegacySteps?12:6),1.f/Physics->MaxSubstepDeltaTime);
    if(!Ready)return true;
  }
  if(State.Trial>=State.Cases.Num())return true;
  const auto C=State.Cases[State.Trial];const auto Label=Name(C);
  if(State.Phase==0){
    V->SetGarage(true);V->SelectVehicle(C.Vehicle);V->SetGarage(false);V->TeleportZone(C.Zone);V->RouteIndex=-1;
    V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    State.Phase=1;State.PhaseStarted=Now;return false;
  }
  if(State.Phase==1&&Now-State.PhaseStarted>1){Place(V,C);State.Phase=2;State.PhaseStarted=Now;return false;}
  State.Finite&=!V->GetActorLocation().ContainsNaN()&&!V->Chassis->GetPhysicsLinearVelocity().ContainsNaN();
  State.PoseSeen|=C.Roll==0?V->GetActorUpVector().Z>.9f:C.Roll==90?FMath::Abs(V->GetActorUpVector().Z)<.35f:V->GetActorUpVector().Z<-.7f;
  if(State.Phase==2&&Now-State.PhaseStarted>4){
    State.Region=Label;TRACE_BEGIN_REGION(*State.Region);
    State.Frames.Reset();State.Previous=Now;State.PhaseStarted=Now;State.Phase=3;
    UE_LOG(LogTemp,Display,TEXT("TERRA_PERF_BEGIN case=%s actualRoll=%.2f surface=%d"),*Label,V->GetActorRotation().Roll,V->Terrain->Sample(V->GetActorLocation()).Surface);return false;
  }
  if(State.Phase==3){
    State.Frames.Add(float((Now-State.Previous)*1000));State.Previous=Now;
    if(Now-State.PhaseStarted<6)return false;
    TRACE_END_REGION(*State.Region);
    auto Sorted=State.Frames;Sorted.Sort();double Sum=0;for(float X:Sorted)Sum+=X;
    const float Mean=Sum/Sorted.Num(),P95=Sorted[FMath::Min(Sorted.Num()-1,FMath::FloorToInt(Sorted.Num()*.95f))];
    float Clearance=10000;for(const auto& Local:State.Probes[C.Vehicle]){const auto P=V->GetActorTransform().TransformPosition(Local);Clearance=FMath::Min(Clearance,float(P.Z-V->Terrain->Height(P.X,P.Y)));}
    auto R=MakeShared<FJsonObject>();R->SetStringField(TEXT("case"),Label);R->SetNumberField(TEXT("vehicle"),C.Vehicle);R->SetNumberField(TEXT("zone"),C.Zone);R->SetNumberField(TEXT("requestedRoll"),C.Roll);R->SetNumberField(TEXT("actualRoll"),V->GetActorRotation().Roll);
    R->SetNumberField(TEXT("frames"),Sorted.Num());R->SetNumberField(TEXT("meanFrameMs"),Mean);R->SetNumberField(TEXT("p95FrameMs"),P95);R->SetNumberField(TEXT("averageFPS"),1000/Mean);R->SetNumberField(TEXT("minimumBodyClearanceIn"),Clearance/2.54f);
    R->SetNumberField(TEXT("terrainHits"),V->TerrainBodyHits);R->SetNumberField(TEXT("bodyImpressions"),V->Terrain->BodyImpressionCount);R->SetNumberField(TEXT("activeSoilTiles"),V->Terrain->DetailCount());
    R->SetNumberField(TEXT("actualSurface"),V->Terrain->Sample(V->GetActorLocation()).Surface);
    const auto* Mode=IConsoleManager::Get().FindConsoleVariable(TEXT("p.Chaos.Collision.ConvexTriMeshMode"));R->SetNumberField(TEXT("contactGeneratorMode"),Mode?Mode->GetInt():-1);
    const auto Soil=V->Terrain->SoilCollisionStats();
    R->SetNumberField(TEXT("renderedSoilTriangles"),Soil.FullTriangles);R->SetNumberField(TEXT("liveSoilCollisionTriangles"),Soil.LiveTriangles);
    R->SetNumberField(TEXT("sparseSoilTiles"),Soil.SparseTiles);R->SetNumberField(TEXT("maximumSoilCollisionErrorIn"),Soil.MaximumHeightErrorCM/2.54);
    const bool DenseControl=FParse::Param(FCommandLine::Get(),TEXT("TerraLegacyDenseSoilCollision"));R->SetBoolField(TEXT("denseSoilControl"),DenseControl);
    UE_LOG(LogTemp,Display,TEXT("TERRA_SOIL_COLLISION renderTriangles=%d liveTriangles=%d sparseTiles=%d errorIn=%.4f denseControl=%d"),Soil.FullTriangles,Soil.LiveTriangles,Soil.SparseTiles,Soil.MaximumHeightErrorCM/2.54,DenseControl);
    if(C.Zone==0){
      Check(Label+TEXT(" native soil collider stays within one fifth inch of the fine surface"),Soil.LiveTriangles>0&&Soil.MaximumHeightErrorCM<=.5001,Soil.MaximumHeightErrorCM/2.54);
      Check(Label+TEXT(" live soil triangle count matches the intended collision path"),Soil.FullTriangles>0&&(DenseControl?Soil.LiveTriangles==Soil.FullTriangles:Soil.SparseTiles>0&&Soil.LiveTriangles<Soil.FullTriangles),Soil.LiveTriangles);
    }
    R->SetBoolField(TEXT("finite"),State.Finite);R->SetBoolField(TEXT("requestedPoseSeen"),State.PoseSeen);
    State.Reports.Add(MakeShared<FJsonValueObject>(R));Save();
    UE_LOG(LogTemp,Display,TEXT("TERRA_PERF_RESULT case=%s frames=%d meanMS=%.3f p95MS=%.3f fps=%.3f clearanceIn=%.3f actualRoll=%.2f"),*Label,Sorted.Num(),Mean,P95,1000/Mean,Clearance/2.54f,V->GetActorRotation().Roll);
    Check(Label+TEXT(" remains finite in the requested physical pose"),State.Finite&&State.PoseSeen,0);
    Check(Label+TEXT(" body remains within 1.6 inches of real ground"),Clearance>=-4,Clearance/2.54f);
    Check(Label+TEXT(" avoids single-digit sustained frame rate"),Mean<100,Mean);
    Check(Label+TEXT(" p95 frame stays under 100 ms"),P95<100,P95);
    Capture(*(Label+TEXT(".png")));++State.Trial;State.Phase=0;
  }
  return State.Trial>=State.Cases.Num();
}
}
