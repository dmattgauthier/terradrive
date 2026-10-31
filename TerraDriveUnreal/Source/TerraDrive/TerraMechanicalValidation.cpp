#include "TerraMechanicalValidation.h"
#include "TerraVehicle.h"
#include "Materials/MaterialInterface.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace TerraMechanicalValidation {
namespace {
constexpr int PortalStages=4;
constexpr int MigrationChecks=5,PersistenceChecks=2,CapabilityChecksPerVehicle=8,
  StationaryChecksPerTrial=10,GrowthChecksPerVehicle=PortalStages-1,SpinChecksPerVehicle=4;
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TerraSim::UpgradeSetup Before[ATerraVehicle::VehicleCount];
  int Trial=0,Phase=0,OriginalVehicle=0,StockBoxes=0;
  float Time=0,PreviousHeight=0;
} State;
FString Fixture(const TCHAR* Name){return FPaths::ProjectSavedDir()/TEXT("Validation")/Name;}
FString FixturePlanPath(const TCHAR* Name){
  FString Report;
  if(FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report)&&!Report.IsEmpty())return FPaths::GetPath(Report)/Name;
  return FPaths::ProjectSavedDir()/TEXT("Validation")/Name;
}
bool SameBuilds(ATerraVehicle* V,const TerraSim::UpgradeSetup* Builds){
  for(int I=0;I<ATerraVehicle::VehicleCount;I++)for(int P=0;P<TerraSim::PartCount;P++)if(V->Builds[I].Stage[P]!=Builds[I].Stage[P])return false;
  return true;
}
bool WriteFixturePlan(){
  auto Root=MakeShared<FJsonObject>();Root->SetNumberField(TEXT("version"),1);
  Root->SetNumberField(TEXT("vehicleCount"),ATerraVehicle::VehicleCount);Root->SetNumberField(TEXT("partCount"),TerraSim::PartCount);
  Root->SetNumberField(TEXT("portalStages"),PortalStages);Root->SetNumberField(TEXT("migrationChecks"),MigrationChecks);
  Root->SetNumberField(TEXT("persistenceChecks"),PersistenceChecks);Root->SetNumberField(TEXT("capabilityChecksPerVehicle"),CapabilityChecksPerVehicle);
  Root->SetNumberField(TEXT("stationaryChecksPerTrial"),StationaryChecksPerTrial);Root->SetNumberField(TEXT("growthChecksPerVehicle"),GrowthChecksPerVehicle);
  Root->SetNumberField(TEXT("spinChecksPerVehicle"),SpinChecksPerVehicle);
  TArray<TSharedPtr<FJsonValue>> Trials;
  for(int I=0;I<ATerraVehicle::VehicleCount;++I)for(int Stage=0;Stage<PortalStages;++Stage){
    auto Trial=MakeShared<FJsonObject>();Trial->SetNumberField(TEXT("vehicle"),I);Trial->SetNumberField(TEXT("stage"),Stage);Trials.Add(MakeShared<FJsonValueObject>(Trial));
  }
  Root->SetArrayField(TEXT("trials"),Trials);
  Root->SetNumberField(TEXT("expectedChecks"),MigrationChecks+PersistenceChecks+ATerraVehicle::VehicleCount*(CapabilityChecksPerVehicle+GrowthChecksPerVehicle+SpinChecksPerVehicle)+Trials.Num()*StationaryChecksPerTrial);
  FString Json;return FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Json))&&FFileHelper::SaveStringToFile(Json,*FixturePlanPath(TEXT("mechanical-fixtures.json")));
}
bool WriteFixture(int Version,int Cars,int Parts,bool Invalid=false){
  auto Root=MakeShared<FJsonObject>();Root->SetNumberField(TEXT("version"),Version);Root->SetNumberField(TEXT("vehicle"),2);
  TArray<TSharedPtr<FJsonValue>> Builds;
  for(int I=0;I<Cars;I++){
    TArray<TSharedPtr<FJsonValue>> Stages;
    for(int P=0;P<Parts;P++)Stages.Add(MakeShared<FJsonValueNumber>(Invalid&&I==3&&P==4?.5:I==2&&P==TerraSim::Electrical?0:(P+I)%4));
    Builds.Add(MakeShared<FJsonValueArray>(Stages));
  }
  Root->SetArrayField(TEXT("builds"),Builds);
  FString Json;return FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Json))&&FFileHelper::SaveStringToFile(Json,*Fixture(TEXT("mechanical-migration.json")));
}
void SaveChecks(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check){
  const bool PlanWritten=WriteFixturePlan();
  for(int Version:{1,2,3,4,5}){
    const int Cars=Version==1?5:Version<4?6:ATerraVehicle::VehicleCount,Parts=Version<3?7:Version==3?10:12;
    bool Valid=PlanWritten&&WriteFixture(Version,Cars,Parts)&&V->LoadGarage(Fixture(TEXT("mechanical-migration.json")));
    for(int I=0;I<ATerraVehicle::VehicleCount;I++)for(int P=0;P<TerraSim::PartCount;P++){
      const int Expected=I>=Cars||P>=Parts?0:I==2&&P==TerraSim::Electrical?0:Version<=4&&(I==4||I==7)&&P==TerraSim::EVSwap?0:(P+I)%4;
      Valid&=V->Builds[I].Stage[P]==Expected;
    }
    Check(FString::Printf(TEXT("v%d garage migration retains old stages and defaults new hardware to stock"),Version),Valid,Version);
  }
  TerraSim::UpgradeSetup Loaded[ATerraVehicle::VehicleCount];for(int I=0;I<ATerraVehicle::VehicleCount;I++)Loaded[I]=V->Builds[I];
  const bool Rejected=WriteFixture(2,6,7,true)&&!V->LoadGarage(Fixture(TEXT("mechanical-migration.json")));
  Check(TEXT("malformed legacy garage rejects atomically"),Rejected&&SameBuilds(V,Loaded),Rejected?1:0);
  for(int I=0;I<ATerraVehicle::VehicleCount;I++){
    V->Builds[I]={};
    for(int P=0;P<TerraSim::PartCount;++P)V->Builds[I].Stage[P]=I==2&&P==TerraSim::Electrical?0:(P+I)%4;
    Loaded[I]=V->Builds[I];
  }
  bool RoundTrip=V->SaveGarage(Fixture(TEXT("mechanical-v6.json")));
  FString Json;TSharedPtr<FJsonObject> Root;
  bool Shape=FFileHelper::LoadFileToString(Json,*Fixture(TEXT("mechanical-v6.json")))&&FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)&&Root.IsValid();
  if(Shape){
    double Version=0;const TArray<TSharedPtr<FJsonValue>>* Cars=nullptr;
    Shape=Root->TryGetNumberField(TEXT("version"),Version)&&Version==6&&Root->TryGetArrayField(TEXT("builds"),Cars)&&Cars->Num()==ATerraVehicle::VehicleCount;
    if(Shape)for(const auto& Car:*Cars){const TArray<TSharedPtr<FJsonValue>>* Parts=nullptr;Shape&=Car->TryGetArray(Parts)&&Parts->Num()==TerraSim::PartCount;}
  }
  for(auto& B:V->Builds)B={};
  RoundTrip&=Shape&&V->LoadGarage(Fixture(TEXT("mechanical-v6.json")))&&SameBuilds(V,Loaded);
  Check(TEXT("v6 garage round trip persists every ordered upgrade for the complete vehicle roster"),RoundTrip,TerraSim::PartCount);
  for(int I=0;I<ATerraVehicle::VehicleCount;I++)V->Builds[I]=State.Before[I];
}
void CapabilityChecks(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check){
  const int I=V->VehicleIndex;
  const FString Label=FString::Printf(TEXT("vehicle %d "),I);
  V->ResetUpgrades(false);
  const auto Stock=V->DriveCapabilities();
  const auto Factory=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[I]->AsObject();
  const auto Features=Factory->GetObjectField(TEXT("features"));
  bool FactoryFourDrive=false;
  for(const auto& Mode:Factory->GetArrayField(TEXT("driveModes")))FactoryFourDrive|=Mode->AsString().Contains(TEXT("4"))||Mode->AsString().Contains(TEXT("AWD"));
  const bool FactoryFrontPrimary=Factory->GetStringField(TEXT("defaultMode"))==TEXT("FWD");
  const float FactoryLow=FMath::Max(1.f,float(Factory->GetNumberField(TEXT("lowRatio"))));
  Check(Label+TEXT("stock factory drivetrain and lockers retained"),Stock.FourDrive==FactoryFourDrive&&Stock.FrontPrimary==FactoryFrontPrimary&&Stock.FrontLocker==Features->GetBoolField(TEXT("frontLocker"))&&Stock.RearLocker==Features->GetBoolField(TEXT("rearLocker"))&&FMath::IsNearlyEqual(Stock.LowRatio,FactoryLow,.001f)&&V->HasLowRange()==(FactoryLow>1.05f),Stock.LowRatio);
  V->SetUpgrade(TerraSim::Drivetrain,1,false);V->FourDrive=true;
  Check(Label+TEXT("4H conversion drives all four wheels"),V->HasFourDrive()&&V->DrivenWheel(0)&&V->DrivenWheel(1)&&V->DrivenWheel(2)&&V->DrivenWheel(3),V->Mass);
  V->SetUpgrade(TerraSim::Drivetrain,2,false);V->LowRange=true;
  Check(Label+TEXT("low range conversion selects at least 2.5 to one without reducing factory ratio"),V->HasLowRange()&&V->EffectiveLowRatio()>=2.5f&&V->EffectiveLowRatio()>=Stock.LowRatio,V->EffectiveLowRatio());
  V->SetUpgrade(TerraSim::Drivetrain,3,false);
  Check(Label+TEXT("crawler stage strengthens reduction while retaining factory gearing"),V->EffectiveLowRatio()>=3.5f&&V->EffectiveLowRatio()>=Stock.LowRatio,V->EffectiveLowRatio());
  V->SetUpgrade(TerraSim::Differentials,1,false);
  Check(Label+TEXT("main drive axle locker retrofit is present"),V->HasLocker(FactoryFrontPrimary),V->UpgradeStage(TerraSim::Differentials));
  V->SetUpgrade(TerraSim::Differentials,2,false);V->Speed=0;V->FourDrive=V->LowRange=true;
  V->FrontLocked=V->RearLocked=false;V->ToggleLocker(false);V->ToggleLocker(true);
  Check(Label+TEXT("both retrofitted lockers engage through the player controls"),V->HasLocker(true)&&V->HasLocker(false)&&V->FrontLocked&&V->RearLocked,V->FrontLocked+V->RearLocked);
  V->SetUpgrade(TerraSim::Differentials,3,false);
  Check(Label+TEXT("competition differential stage retains both selectable lockers"),V->HasLocker(true)&&V->HasLocker(false),V->UpgradeStage(TerraSim::Differentials));
  V->ResetUpgrades(false);
  Check(Label+TEXT("removing aftermarket hardware returns exactly to factory capability"),V->HasFourDrive()==Stock.FourDrive&&V->HasLowRange()==(Stock.LowRatio>1.05f)&&V->HasLocker(true)==Stock.FrontLocker&&V->HasLocker(false)==Stock.RearLocker,V->Mass);
}
void GearChecks(ATerraVehicle* V,int Stage,const FString& Label,TFunctionRef<void(const FString&,bool,float)> Check){
  bool Loaded=V->RunningGearMeshes.Num()==9,Finite=Loaded,Lightweight=Loaded;
  int Instances=0,Rotors=0;
  for(int G=0;G<V->RunningGearMeshes.Num();++G){
    const auto* C=V->RunningGearMeshes[G].Get();
    Loaded&=C&&C->GetStaticMesh()&&C->GetMaterial(0);
    if(C&&C->GetStaticMesh())for(int S=0;S<C->GetNumMaterials();S++)Loaded&=C->GetMaterial(S)&&C->GetMaterial(S)->GetUsageByFlag(MATUSAGE_InstancedStaticMeshes);
    if(!C){Finite=Lightweight=false;continue;}
    Lightweight&=C->GetCollisionEnabled()==ECollisionEnabled::NoCollision&&!C->CastShadow;
    if(G>=6)Rotors+=C->GetInstanceCount();
    for(int I=0;I<C->GetInstanceCount();++I){
      FTransform T;
      Finite&=C->GetInstanceTransform(I,T,true)&&!T.ContainsNaN()&&T.GetScale3D().GetMin()>0&&T.GetRotation().IsNormalized();Instances++;
    }
  }
  Check(Label+TEXT("all nine loaded running gear groups retain the legacy suspension and hub components"),Loaded&&V->SuspensionParts.Num()==20&&V->HubDetails.Num()==16,Instances);
  Check(Label+TEXT("live axle suspension steering and brake instances have finite positive transforms"),Finite&&Instances>=30,Instances);
  Check(Label+TEXT("instanced running gear adds no individual shadows or physical collision"),Lightweight,V->RunningGearMeshes.Num());
  const int Ceramic=V->RunningGearMeshes.IsValidIndex(7)?V->RunningGearMeshes[7]->GetInstanceCount():-1;
  const int Solid=V->RunningGearMeshes.IsValidIndex(8)?V->RunningGearMeshes[8]->GetInstanceCount():-1;
  Check(Label+TEXT("factory brake architecture supplies four rotors with the correct ceramic or solid axle"),Rotors==4&&Ceramic==(V->VehicleIndex==5?4:0)&&Solid==(V->VehicleIndex==2?2:0),Rotors);
  const int Boxes=V->RunningGearMeshes.IsValidIndex(4)?V->RunningGearMeshes[4]->GetInstanceCount():-1;
  if(Stage==0)State.StockBoxes=Boxes;
  Check(Label+TEXT("portal stages add exactly four separate wheel-end drop housings"),Boxes==State.StockBoxes+(Stage?4:0),Boxes-State.StockBoxes);
}
void SpinChecks(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check){
  const FString Label=FString::Printf(TEXT("vehicle %d stock "),V->VehicleIndex);
  bool Rims=V->Rims.Num()==4,Rotors=true,Calipers=V->HubDetails.Num()==16;
  float Rotation=0;int RotorIndex[9]={};
  const FVector Up=V->GetActorUpVector();
  for(int I=0;I<4;++I){
    Rotation=FMath::Max(Rotation,FMath::Abs(V->WheelState[I].Rotation));
    const auto Q=V->Wheels[I]->GetComponentQuat();
    const FVector RimScale=V->Rims.IsValidIndex(I)?V->Rims[I]->GetComponentScale():FVector::ZeroVector;
    Rims&=V->Rims.IsValidIndex(I)&&V->Rims[I]->GetComponentQuat().Equals(Q,.001f)&&FMath::Abs(RimScale.X-1)<.001f&&FMath::Abs(RimScale.Z-1)<.001f;
    const int G=V->VehicleIndex==5?7:V->VehicleIndex==2&&I>=2?8:6;
    FTransform T;
    Rotors&=V->RunningGearMeshes.IsValidIndex(G)&&V->RunningGearMeshes[G]->GetInstanceTransform(RotorIndex[G]++,T,true)&&T.GetRotation().Equals(Q,.001f);
    const auto Steering=FQuat(Up,V->WheelState[I].Angle)*V->GetActorQuat();
    Calipers&=V->HubDetails.IsValidIndex(I*4+2)&&V->HubDetails[I*4+2]->GetComponentQuat().Equals(Steering,.001f);
  }
  Check(Label+TEXT("driving produces visible wheel rotation"),Rotation>.12f,Rotation);
  Check(Label+TEXT("separate factory rims follow rotating wheels without tire-sized radial scaling"),Rims,Rotation);
  Check(Label+TEXT("friction rotors spin with each corresponding wheel"),Rotors,Rotation);
  Check(Label+TEXT("brake calipers follow steering while excluding wheel spin"),Calipers,Rotation);
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(State.Vehicle.Get()!=V){
    State=FState();State.Vehicle=V;State.OriginalVehicle=V->VehicleIndex;
    for(int I=0;I<ATerraVehicle::VehicleCount;I++)State.Before[I]=V->Builds[I];
    SaveChecks(V,Check);
  }
  if(State.Trial>=ATerraVehicle::VehicleCount*PortalStages){
    V->SetGarage(true);for(int I=0;I<ATerraVehicle::VehicleCount;I++)V->Builds[I]=State.Before[I];V->SelectVehicle(State.OriginalVehicle);V->SetGarage(false);
    return true;
  }
  const int Vehicle=State.Trial/PortalStages,Stage=State.Trial%PortalStages;
  const FString Label=FString::Printf(TEXT("vehicle %d portal stage %d "),Vehicle,Stage);
  if(State.Phase==0){
    V->SetGarage(true);V->SelectVehicle(Vehicle);V->TeleportZone(1);V->ResetUpgrades(false);
    if(Stage==0)CapabilityChecks(V,Check);
    const float StockMass=V->Mass;
    V->SetUpgrade(TerraSim::Portals,Stage,false);V->ApplyUpgrades();
    const float GarageHeight=(V->GetActorLocation().Z-V->Terrain->Spawns[1].Z)/100;
    Check(Label+TEXT("garage body rises by the actual portal clearance"),FMath::Abs(GarageHeight-V->ExpectedRideHeight())<.005f,GarageHeight/0.0254f);
    Check(Label+TEXT("mass includes the added wheel-end gearboxes"),FMath::Abs(V->Mass-StockMass-V->Tuning.HardwareMass)<.05f,V->Mass*2.2046226f);
    Check(Label+TEXT("wheel-end inertia and efficiency match its selected hardware"),V->WheelInertia()>=3&&V->Tuning.DriveEfficiency<=1&&(Stage==0||V->PortalReduction()>1),V->WheelInertia());
    V->SetGarage(false);V->TeleportZone(1);V->TestDriverInput=false;V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
    State.Time=0;State.Phase=1;return false;
  }
  State.Time+=Dt;
  if(State.Phase==1&&State.Time>2.3f){
    const FVector P=V->GetActorLocation();
    const float Height=(P.Z-V->Terrain->Height(P.X,P.Y))/100;
    Check(Label+TEXT("real Chaos mass survives garage close and welded body activation"),FMath::Abs(V->Chassis->GetMass()-V->Mass)<FMath::Max(1.f,V->Mass*.001f),V->Chassis->GetMass()*2.2046226f);
    Check(Label+TEXT("four supported tires settle at the raised ride height"),V->ContactCount==4&&FMath::Abs(Height-V->ExpectedRideHeight())<.10f&&!P.ContainsNaN(),Height/.0254f);
    if(Stage>0)Check(Label+TEXT("physical clearance grows with every portal stage"),Height>State.PreviousHeight+.025f,(Height-State.PreviousHeight)/.0254f);
    GearChecks(V,Stage,Label,Check);
    State.PreviousHeight=Height;
    UE_LOG(LogTemp,Display,TEXT("TERRA_MECHANICAL vehicle=%d stage=%d massLb=%.2f rideIn=%.3f expectedIn=%.3f portalIn=%.3f reduction=%.2f inertia=%.3f"),Vehicle,Stage,V->Mass*2.2046226f,Height/.0254f,V->ExpectedRideHeight()/.0254f,V->PortalLift()/.0254f,V->PortalReduction(),V->WheelInertia());
    if(Stage==0){V->TestBrake=0;V->TestThrottle=.35f;V->TestSteer=.25f;State.Phase=4;State.Time=0;}
    else if(Stage==3){V->SetGarage(true);V->SetGarageView(1);State.Phase=2;State.Time=0;}else{State.Trial++;State.Phase=0;}
  }else if(State.Phase==4&&State.Time>.85f){
    SpinChecks(V,Check);V->TestThrottle=V->TestSteer=0;V->TestBrake=1;V->SetGarage(true);V->SetGarageView(1);State.Phase=2;State.Time=0;
  }else if(State.Phase==2&&State.Time>.4f){
    Capture(*FString::Printf(TEXT("native-mechanical-v%d-%s.png"),Vehicle,Stage==0?TEXT("stock"):TEXT("portals")));
    State.Phase=3;State.Time=0;
  }else if(State.Phase==3&&State.Time>.25f){State.Trial++;State.Phase=0;}
  return false;
}
}
