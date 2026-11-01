#include "TerraElectricPressureValidation.h"
#include "TerraVehicle.h"
#include "TerraGarage.h"
#include "TerraElectric.h"
#include "TerraPressure.h"
#include "TerraContact.h"
#include "TerraSimCore.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/OverlapResult.h"
#include "Engine/World.h"
#include "GameFramework/HUD.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "Math/RotationMatrix.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "CollisionQueryParams.h"
#include "CollisionShape.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Text/STextBlock.h"

namespace TerraElectricPressureValidation {
namespace {
constexpr int Count=9,MatrixTrials=Count*4,AirBegin=MatrixTrials;
constexpr int DriveBegin=AirBegin+3,BrakeBegin=DriveBegin+12,SteerBegin=BrakeBegin+2,SoilBegin=SteerBegin+2,UIBegin=SoilBegin+2,TrialCount=UIBegin+3;
constexpr float SoilWindowStartM=4,SoilWindowEndM=8,SoilFinishM=10.5f,SoilEntryMPS=2.5f;
constexpr float RoadRearCM=650,RoadForwardCM=6500,RoadHalfWidthCM=650;
struct FSoilPoint {
  FVector Position=FVector::ZeroVector;
  float ForwardM=0,PatchM=0,LoadN=0,SpeedMPS=0;
};
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<ACameraActor> Camera;
  TerraSim::UpgradeSetup Before[Count];
  float BeforePressure[Count]={},BeforeBattery[Count]={},BeforeFuel[Count]={};
  FTerraWheel OriginalWheels[4];
  int OriginalVehicle=0,OriginalZone=0,OriginalRoute=-1,Trial=0,Phase=0,Frames=0,MovingFrames=0,LoadedFrames=0;
  bool OriginalGarage=false,OriginalTracks=false,OriginalFour=false,OriginalLow=false,OriginalFrontLock=false,OriginalRearLock=false,OriginalCenterLock=false,OriginalDescent=false;
  bool OriginalDriverInput=false,OriginalForward=false,OriginalReverse=false,OriginalStop=false,OriginalHUD=true,OriginalAirRequested=false,OriginalDamageEnabled=true,OriginalEnergyUsage=true;
  float OriginalPressure=35,OriginalTarget=35,OriginalSOC=1,OriginalDamage=0,OriginalFuel=.75f;
  float OriginalThrottle=0,OriginalSteer=0,OriginalBrake=0,Time=0,PeakSpeed=0,PeakDrive=0,PeakRegen=0,WheelDifference=0,LoadedFraction=0;
  float InitialPSI=35,PatchSum=0,LoadSum=0,MaxDepth=0,StartYaw=0,BrakeDistance[2]={},BrakeTime[2]={},SteerYaw[2]={},SteerLateral[2]={},SoilPatch[2]={},SoilDepth[2]={};
  float StockMass[Count]={},StockPower[Count]={};
  TArray<FSoilPoint> SoilPath[2];
  float SoilMeanLoad[2]={},SoilMeanSpeed[2]={},SoilMeanSink[2]={},SoilMass[2]={},SoilEntry[2]={};
  float SoilPsi[2]={},SoilWidth[2]={},SoilRadius[2]={};
  double SoilVolumeError[2]={};
  bool SoilMatched[2]={},SoilBounded[2]={},SoilOrdered=true;
  FTransform OriginalTransform;
  FVector OriginalVelocity=FVector::ZeroVector,OriginalAngular=FVector::ZeroVector;
  FVector Start=FVector::ZeroVector,Fixture=FVector::ZeroVector,RoadFixture=FVector::ZeroVector,SoftFixture=FVector::ZeroVector;
  bool RoadReady=false,SoftReady=false,Finite=true,DrivenCorrectly=true,FixtureValid=false,Stopped=false,Restored=false,DriveCorridor=true,ParkPending=false;
  float DriveMaximumSideCM=0,DriveMaximumForwardCM=0,DriveMinimumForwardCM=0;
  int FactoryQuad=4;
} State;

FString Path(const TCHAR* Name){return FPaths::ProjectSavedDir()/TEXT("Validation")/Name;}
const TArray<TSharedPtr<FJsonValue>>& Roster(ATerraVehicle* V){return V->Terrain->Data->GetArrayField(TEXT("vehicles"));}
float Metadata(ATerraVehicle* V,int Index,const TCHAR* Name,float Fallback=0){
  double Value=Fallback;Roster(V)[Index]->AsObject()->TryGetNumberField(Name,Value);return float(Value);
}
bool SameBuilds(ATerraVehicle* V,const TerraSim::UpgradeSetup* Before){
  for(int I=0;I<Count;++I)for(int P=0;P<TerraSim::PartCount;++P)if(V->Builds[I].Stage[P]!=Before[I].Stage[P])return false;
  return true;
}
bool WriteLegacy(int Version,bool Malformed=false){
  const int Cars=Version==1?5:6,Parts=Version<3?7:10;
  auto Root=MakeShared<FJsonObject>();Root->SetNumberField(TEXT("version"),Version);Root->SetNumberField(TEXT("vehicle"),2);
  TArray<TSharedPtr<FJsonValue>> Builds;
  for(int I=0;I<Cars;++I){
    TArray<TSharedPtr<FJsonValue>> Stages;
    for(int P=0;P<Parts;++P)Stages.Add(MakeShared<FJsonValueNumber>(Malformed&&I==3&&P==4?.5:I==2&&P==TerraSim::Electrical?0:(P+I)%4));
    Builds.Add(MakeShared<FJsonValueArray>(Stages));
  }
  Root->SetArrayField(TEXT("builds"),Builds);FString Json;
  IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path(TEXT("electric-legacy-fixture.json"))),true);
  return FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Json))&&
    FFileHelper::SaveStringToFile(Json,*Path(TEXT("electric-legacy-fixture.json")));
}
void SaveChecks(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check){
  for(int Version:{1,2,3}){
    const int Cars=Version==1?5:6,Parts=Version<3?7:10;
    bool Valid=WriteLegacy(Version)&&V->LoadGarage(Path(TEXT("electric-legacy-fixture.json")));
    for(int I=0;I<Count;++I)for(int P=0;P<TerraSim::PartCount;++P){
      const int Expected=I>=Cars||P>=Parts?0:I==2&&P==TerraSim::Electrical?0:(P+I)%4;
      Valid&=V->Builds[I].Stage[P]==Expected;
    }
    Check(FString::Printf(TEXT("v%d garage migrates original stages and defaults new cars EV swaps and tire air to stock"),Version),Valid,Version);
  }
  TerraSim::UpgradeSetup Loaded[Count];for(int I=0;I<Count;++I)Loaded[I]=V->Builds[I];
  const bool Rejected=WriteLegacy(3,true)&&!V->LoadGarage(Path(TEXT("electric-legacy-fixture.json")));
  Check(TEXT("malformed legacy garage rejects atomically without changing any vehicle build"),Rejected&&SameBuilds(V,Loaded),Rejected);
  for(int I=0;I<Count;++I){
    V->Builds[I]={};
    for(int P=0;P<TerraSim::PartCount;++P)V->Builds[I].Stage[P]=I==2&&P==TerraSim::Electrical?0:(I+P)%4;
    Loaded[I]=V->Builds[I];
    V->PressureProfiles[I]=30.f+I*2;V->BatteryProfiles[I]=.2f+I*.07f;
  }
  V->PressureTarget=30.f+V->VehicleIndex*2;V->BatterySOC=.2f+V->VehicleIndex*.07f;
  V->DamageEnabled=false;
  bool RoundTrip=V->SaveGarage(Path(TEXT("electric-v8-roundtrip.json")));
  FString Json;TSharedPtr<FJsonObject> Root;
  bool Shape=FFileHelper::LoadFileToString(Json,*Path(TEXT("electric-v8-roundtrip.json")))&&
    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)&&Root.IsValid();
  if(Shape){
    double Version=0;const TArray<TSharedPtr<FJsonValue>>* Cars=nullptr;
    bool DamageMode=true;
    Shape=Root->TryGetNumberField(TEXT("version"),Version)&&Version==8&&Root->TryGetArrayField(TEXT("builds"),Cars)&&Cars->Num()==ATerraVehicle::VehicleCount&&Root->TryGetBoolField(TEXT("damageEnabled"),DamageMode)&&!DamageMode;
    if(Shape)for(const auto& Car:*Cars){const TArray<TSharedPtr<FJsonValue>>* Parts=nullptr;Shape&=Car->TryGetArray(Parts)&&Parts->Num()==13;}
  }
  for(auto& Build:V->Builds)Build={};
  V->DamageEnabled=true;
  RoundTrip&=V->LoadGarage(Path(TEXT("electric-v8-roundtrip.json")))&&SameBuilds(V,Loaded)&&!V->DamageEnabled;
  Check(TEXT("v8 garage stores nine vehicles thirteen ordered upgrade slots and the free run setting"),Shape,TerraSim::PartCount);
  Check(TEXT("v8 round trip retains donor appropriate powertrain conversion and all previous hardware stages"),RoundTrip,Count);
  bool Profiles=RoundTrip;
  for(int I=0;I<Count;++I)Profiles&=FMath::Abs(V->PressureProfiles[I]-(30.f+I*2))<.001f&&FMath::Abs(V->BatteryProfiles[I]-(.2f+I*.07f))<.00001f;
  Check(TEXT("v8 round trip retains nine independent pressure targets and battery charge states"),Profiles,Count);
  bool BadProfile=false;
  if(Root.IsValid()){
    auto Bad=Root->GetArrayField(TEXT("pressureTargets"));Bad[0]=MakeShared<FJsonValueNumber>(7);Root->SetArrayField(TEXT("pressureTargets"),Bad);
    FString BadJson;
    BadProfile=FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&BadJson))&&
      FFileHelper::SaveStringToFile(BadJson,*Path(TEXT("electric-v8-invalid-pressure.json")))&&
      !V->LoadGarage(Path(TEXT("electric-v8-invalid-pressure.json")))&&SameBuilds(V,Loaded)&&!V->DamageEnabled;
    for(int I=0;I<Count;++I)BadProfile&=FMath::Abs(V->PressureProfiles[I]-(30.f+I*2))<.001f&&FMath::Abs(V->BatteryProfiles[I]-(.2f+I*.07f))<.00001f;
  }
  Check(TEXT("invalid v8 tire pressure rejects atomically without altering builds charge profiles or free run"),BadProfile,7);
  TSharedPtr<FJsonObject> Legacy;
  bool Migration=FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Legacy)&&Legacy.IsValid();
  if(Migration){
    // Historical v4/v5 rows have exactly twelve slots. Derive fixtures from
    // the current round-trip only after removing the newly appended center.
    const auto OriginalCars=Legacy->GetArrayField(TEXT("builds"));TArray<TSharedPtr<FJsonValue>> OldCars;
    for(int CarIndex=0;CarIndex<9;++CarIndex){const auto& Car=OriginalCars[CarIndex];auto Parts=Car->AsArray();Parts.SetNum(12);OldCars.Add(MakeShared<FJsonValueArray>(Parts));}
    Legacy->SetArrayField(TEXT("builds"),OldCars);
    for(const TCHAR* Key:{TEXT("pressureTargets"),TEXT("batteryCharge"),TEXT("fuelLevels")}){auto A=Legacy->GetArrayField(Key);A.SetNum(9);Legacy->SetArrayField(Key,A);}
    Legacy->SetNumberField(TEXT("version"),5);FString V5Json;
    bool V5Migration=FJsonSerializer::Serialize(Legacy,TJsonWriterFactory<>::Create(&V5Json))&&
      FFileHelper::SaveStringToFile(V5Json,*Path(TEXT("electric-v5-migration.json")))&&V->LoadGarage(Path(TEXT("electric-v5-migration.json")))&&!V->DamageEnabled;
    for(int I=0;I<Count;++I){
      for(int P=0;P<TerraSim::PartCount;++P)V5Migration&=V->Builds[I].Stage[P]==(P>=12?0:Loaded[I].Stage[P]);
      V5Migration&=FMath::Abs(V->PressureProfiles[I]-(30.f+I*2))<.001f&&FMath::Abs(V->BatteryProfiles[I]-(.2f+I*.07f))<.00001f;
    }
    Check(TEXT("v5 twelve-slot records retain conversion hardware air charge and free run while new center defaults stock"),V5Migration,12);
    Legacy->SetNumberField(TEXT("version"),4);Legacy->RemoveField(TEXT("damageEnabled"));FString LegacyJson;
    Migration=FJsonSerializer::Serialize(Legacy,TJsonWriterFactory<>::Create(&LegacyJson))&&
      FFileHelper::SaveStringToFile(LegacyJson,*Path(TEXT("electric-v4-migration.json")))&&V->LoadGarage(Path(TEXT("electric-v4-migration.json")))&&V->DamageEnabled;
    for(int I=0;I<Count;++I){
      for(int P=0;P<TerraSim::PartCount;++P)Migration&=V->Builds[I].Stage[P]==(P>=12||((I==4||I==7)&&P==TerraSim::EVSwap)?0:Loaded[I].Stage[P]);
      Migration&=FMath::Abs(V->PressureProfiles[I]-(30.f+I*2))<.001f&&FMath::Abs(V->BatteryProfiles[I]-(.2f+I*.07f))<.00001f;
    }
  }
  Check(TEXT("v4 factory EV replacements migrate to original motor layout without reinterpreting them as gasoline kits or losing other saved fields"),Migration,Count);
  for(int I=0;I<Count;++I){V->Builds[I]=State.Before[I];V->PressureProfiles[I]=State.BeforePressure[I];V->BatteryProfiles[I]=State.BeforeBattery[I];V->FuelProfiles[I]=State.BeforeFuel[I];}
  V->Pressure=State.OriginalPressure;V->PressureTarget=State.OriginalTarget;V->BatterySOC=State.OriginalSOC;V->FuelFraction=State.OriginalFuel;V->EnergyUsageEnabled=State.OriginalEnergyUsage;V->TireAirRequested=State.OriginalAirRequested;V->DamageEnabled=State.OriginalDamageEnabled;
}
void ResetInput(ATerraVehicle* V){
  V->TestDriverInput=false;V->TestForward=V->TestReverse=V->TestStop=false;
  V->TestThrottle=V->TestSteer=0;V->TestBrake=1;V->DescentAssist=false;
  V->FrontLocked=V->RearLocked=V->CenterLocked=V->LowRange=false;V->Direction=1;V->Gear=0;
}
void Photo(ATerraVehicle* V,FVector Focus){
  if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
  Focus.Z=V->Terrain->Height(Focus.X,Focus.Y)+45;
  const FVector Eye=Focus+FVector(-550,-500,330);
  State.Camera->SetActorLocationAndRotation(Eye,(Focus-Eye).Rotation());State.Camera->GetCameraComponent()->SetFieldOfView(58);
  if(auto* PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(State.Camera.Get());if(auto* HUD=PC->GetHUD())HUD->bShowHUD=false;}
}
void PlayerView(ATerraVehicle* V){if(auto* PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(V);if(auto* HUD=PC->GetHUD())HUD->bShowHUD=State.OriginalHUD;}}
void Next(){++State.Trial;State.Phase=0;State.Time=0;}
void Phase(int Value){State.Phase=Value;State.Time=0;}
void Restore(ATerraVehicle* V){
  if(State.Restored)return;
  V->SetGarage(true);for(int I=0;I<Count;++I)V->Builds[I]=State.Before[I];
  V->SelectVehicle(State.OriginalVehicle);V->SetTracks(State.OriginalTracks);
  for(int I=0;I<Count;++I){V->PressureProfiles[I]=State.BeforePressure[I];V->BatteryProfiles[I]=State.BeforeBattery[I];V->FuelProfiles[I]=State.BeforeFuel[I];}
  V->Pressure=State.OriginalPressure;V->PressureTarget=State.OriginalTarget;V->BatterySOC=State.OriginalSOC;V->FuelFraction=State.OriginalFuel;V->EnergyUsageEnabled=State.OriginalEnergyUsage;V->Damage=State.OriginalDamage;V->DamageEnabled=State.OriginalDamageEnabled;
  V->FourDrive=State.OriginalFour;V->LowRange=State.OriginalLow;V->FrontLocked=State.OriginalFrontLock;V->RearLocked=State.OriginalRearLock;V->CenterLocked=State.OriginalCenterLock;V->DescentAssist=State.OriginalDescent;
  V->Zone=State.OriginalZone;V->RouteIndex=State.OriginalRoute;V->SetGarage(State.OriginalGarage);
  V->SetActorTransform(State.OriginalTransform,false,nullptr,ETeleportType::TeleportPhysics);
  if(!State.OriginalGarage){V->Chassis->SetPhysicsLinearVelocity(State.OriginalVelocity);V->Chassis->SetPhysicsAngularVelocityInRadians(State.OriginalAngular);}
  for(int I=0;I<4;++I)V->WheelState[I]=State.OriginalWheels[I];V->UpdateWheelVisuals();
  V->TestDriverInput=State.OriginalDriverInput;V->TestForward=State.OriginalForward;V->TestReverse=State.OriginalReverse;V->TestStop=State.OriginalStop;
  V->TestThrottle=State.OriginalThrottle;V->TestSteer=State.OriginalSteer;V->TestBrake=State.OriginalBrake;
  V->TireAirRequested=State.OriginalAirRequested;
  PlayerView(V);if(State.Camera.IsValid())State.Camera->Destroy();State.Restored=true;
}
bool ClearCorridor(ATerraVehicle* V,FVector P,int Surface,float LengthCM,float HalfWidthCM){
  auto* T=V->Terrain.Get();const float StartHeight=T->Height(P.X,P.Y);
  const float MinimumNormalZ=Surface==5?.985f:.995f,MaximumReliefCM=Surface==5?150.f:60.f;
  const float Spacing=Surface==5?100:400;
  const float TerrainStart=Surface==5?-350:-RoadRearCM;
  const int TerrainSteps=Surface==5?FMath::FloorToInt((LengthCM-TerrainStart)/Spacing):FMath::CeilToInt((LengthCM-TerrainStart)/Spacing);
  for(int Step=0;Step<=TerrainSteps;++Step)for(int Across=-2;Across<=2;++Across){
    const float Along=FMath::Min(TerrainStart+Step*Spacing,LengthCM);
    if(Surface!=5&&FMath::Abs(Across)==1)continue;
    const float Side=HalfWidthCM*Across*.5f;
    const FVector Q=P+FVector(Along,Side,0);const auto S=T->Sample(Q);const auto B=T->SurfaceBlend(Q.X,Q.Y);
    if(S.Surface!=Surface||B.Weight[Surface]<.97f||S.Normal.Z<MinimumNormalZ||FMath::Abs(S.Height-StartHeight)>MaximumReliefCM)return false;
    if(Surface==5&&(S.Softness<.72f||S.MaxSink<.27f||S.Water>.1f||FMath::Abs(S.Normal.Y)>.08f))return false;
  }
  FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraElectricPressureCorridor),false,V);
  const float QueryStart=Surface==5?-250:-RoadRearCM;
  const int QuerySteps=Surface==5?FMath::FloorToInt((LengthCM-QueryStart)/350):FMath::CeilToInt((LengthCM-QueryStart)/350);
  // 380 cm-long boxes spaced at most 350 cm overlap continuously; road
  // queries include both exact endpoints, including the EXP's rear margin.
  for(int Step=0;Step<=QuerySteps;++Step){
    const float Along=FMath::Min(QueryStart+Step*350,LengthCM);
    FVector Q=P+FVector(Along,0,0);Q.Z=T->Height(Q.X,Q.Y)+(Surface==5?120:260);
    TArray<FOverlapResult> Overlaps;
    if(V->GetWorld()->OverlapMultiByChannel(Overlaps,Q,FQuat::Identity,ECC_WorldStatic,FCollisionShape::MakeBox(FVector(190,HalfWidthCM,Surface==5?100:240)),Params)){
      if(Surface!=5)return false;
      // A permitted dune can rise into this above-ground body envelope. Its
      // terrain triangles are the driving surface, not an obstacle. Keep all
      // actual rocks, tree trunks, signs and constructed bodies in the query.
      for(const auto& Hit:Overlaps)if(Hit.bBlockingHit){
        const auto* Component=Hit.GetComponent();
        if(!Component||!Component->ComponentHasTag(TEXT("TerraGround")))return false;
      }
    }
  }
  return true;
}
bool FindFixture(ATerraVehicle* V,bool Soft,FVector& Out){
  bool& Ready=Soft?State.SoftReady:State.RoadReady;FVector& Stored=Soft?State.SoftFixture:State.RoadFixture;
  if(Ready){Out=Stored;return true;}
  // The sand spawn is near a mixed dune edge. Start the bounded search in
  // the basin interior, where the source height field has a gentle full run.
  const FVector Origin=Soft?V->Terrain->Spawns[5]+FVector(5400,-600,0):V->Terrain->Spawns[1]-FVector(600,600,0);
  float Best=FLT_MAX;bool Found=false;FVector Candidate=Origin;
  for(int X=-30;X<=30;++X)for(int Y=-30;Y<=30;++Y){
    const float Cost=X*X+Y*Y;if(Cost>=Best)continue;
    const FVector P=Origin+FVector(X*200,Y*200,0);
    if(ClearCorridor(V,P,Soft?5:1,Soft?1600:RoadForwardCM,Soft?220:RoadHalfWidthCM)){Best=Cost;Candidate=P;Found=true;}
  }
  if(Found){Stored=Candidate;Ready=true;}Out=Candidate;return Found;
}
void Configure(ATerraVehicle* V,int Index,int Swap,float Psi,int Air=0){
  PlayerView(V);V->SetGarage(true);V->SelectVehicle(Index);V->ResetUpgrades(false);
  V->SetUpgrade(TerraSim::EVSwap,Swap,false);V->SetUpgrade(TerraSim::TireAir,Air,false);
  V->RequestTirePressure(Psi);V->BatterySOC=.65f;V->Damage=0;ResetInput(V);
  if(Swap==1&&!V->IsFactoryElectric())V->FourDrive=false;
}
void Park(ATerraVehicle* V,bool Soft){
  V->SetGarage(false);V->TeleportZone(Soft?5:1);V->RouteIndex=-1;ResetInput(V);
  V->Terrain->ResetSoil();State.FixtureValid=FindFixture(V,Soft,State.Fixture);
  State.Fixture.Z=V->Terrain->Height(State.Fixture.X,State.Fixture.Y);
  State.Finite=State.DrivenCorrectly=State.DriveCorridor=true;State.DriveMaximumSideCM=State.DriveMaximumForwardCM=State.DriveMinimumForwardCM=0;State.Frames=State.LoadedFrames=State.MovingFrames=0;
  State.PeakSpeed=State.PeakDrive=State.PeakRegen=State.WheelDifference=State.PatchSum=State.LoadSum=State.MaxDepth=0;
  // Re-enabling the garage's welded physics body can restore its pending pose
  // after this tick. Place the road fixture only after that restoration settles.
  State.Stopped=false;State.ParkPending=true;State.Start=V->GetActorLocation();Phase(1);
}
void FinishRoadPark(ATerraVehicle* V){
  if(State.FixtureValid){
    const FVector Normal=V->Terrain->Sample(State.Fixture).Normal;
    V->SetActorLocationAndRotation(State.Fixture+FVector(0,0,V->ExpectedRideHeight()*100+10),
      FRotationMatrix::MakeFromXZ(FVector::ForwardVector,Normal).Rotator(),false,nullptr,ETeleportType::TeleportPhysics);
    V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
    for(auto& Wheel:V->WheelState)Wheel=FTerraWheel();
  }
  ResetInput(V);V->ResetContactTelemetry();State.Start=V->GetActorLocation();State.ParkPending=false;Phase(1);
  UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE_ROAD_PLACE trial=%d found=%d requested=%s actual=%s yaw=%.4f"),
    State.Trial,State.FixtureValid,*State.Fixture.ToString(),*V->GetActorLocation().ToString(),V->GetActorRotation().Yaw);
}
bool RoadEntry(ATerraVehicle* V){
  const float Offset=FVector::Dist2D(V->GetActorLocation(),State.Fixture);
  const float Heading=FMath::Abs(FMath::FindDeltaAngleDegrees(0.f,float(V->GetActorRotation().Yaw)));
  const bool Matches=State.FixtureValid&&!V->Garage&&Offset<=12&&Heading<=1&&
    V->Terrain->SurfaceBlend(V->GetActorLocation().X,V->GetActorLocation().Y).Weight[1]>.97f;
  State.FixtureValid=Matches;
  UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE_ROAD_ENTRY trial=%d matched=%d requested=%s actual=%s offsetCM=%.4f headingDegrees=%.4f contacts=%d"),
    State.Trial,Matches,*State.Fixture.ToString(),*V->GetActorLocation().ToString(),Offset,Heading,V->ContactCount);
  return Matches;
}
void RollingStart(ATerraVehicle* V,float Speed){
  // Initial condition only. Subsequent motion, drive, braking and terrain
  // interaction use real contacts and forces without intervention.
  State.Start=V->GetActorLocation();V->ResetContactTelemetry();V->TestBrake=0;
  V->Chassis->SetPhysicsLinearVelocity(V->GetActorForwardVector()*Speed*100);
  V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  const float Radius=V->TireDiameter()*.0127f;
  for(auto& Wheel:V->WheelState)Wheel.Omega=Speed/FMath::Max(.1f,Radius);
}
void ParkSoil(ATerraVehicle* V){
  // Search/place while the garage has physics disabled. A long scene query
  // must not leave the previous trial's live body advancing in an old lane.
  V->TeleportZone(5);V->Terrain->ResetSoil();V->RouteIndex=-1;ResetInput(V);
  State.Finite=true;State.Frames=State.LoadedFrames=State.MovingFrames=0;State.PeakSpeed=0;
  State.SoilOrdered=true;for(auto& Path:State.SoilPath)Path.Reset();
  State.FixtureValid=FindFixture(V,true,State.Fixture);
  if(!State.FixtureValid){
    // Remain in the stationary garage. A failed search emits failed fixture
    // and drive checks; it never substitutes an unverified location or drives.
    State.Start=V->GetActorLocation();
    UE_LOG(LogTemp,Warning,TEXT("TERRA_PRESSURE_SOIL_NO_LANE no verified natural sand corridor; this trial will not drive"));
    Phase(1);return;
  }
  State.Fixture.Z=V->Terrain->Height(State.Fixture.X,State.Fixture.Y);
  const FVector Normal=V->Terrain->Sample(State.Fixture).Normal;
  V->SetActorLocationAndRotation(State.Fixture+FVector(0,0,V->ExpectedRideHeight()*100+10),
    FRotationMatrix::MakeFromXZ(FVector::ForwardVector,Normal).Rotator(),false,nullptr,ETeleportType::TeleportPhysics);
  V->SetGarage(false);V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  ResetInput(V);V->FourDrive=true;State.Start=V->GetActorLocation();
  UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE_SOIL_PLACE found=%d requested=%s actual=%s surface=%d weight=%.5f softness=%.4f maxSink=%.4f garage=%d"),State.FixtureValid,
    *State.Fixture.ToString(),*V->GetActorLocation().ToString(),V->Terrain->Sample(State.Fixture).Surface,
    V->Terrain->SurfaceBlend(State.Fixture.X,State.Fixture.Y).Weight[5],V->Terrain->Sample(State.Fixture).Softness,V->Terrain->Sample(State.Fixture).MaxSink,V->Garage);
  Phase(1);
}
void RecordSoil(ATerraVehicle* V){
  for(int I=0;I<2;++I){
    const auto& Wheel=V->WheelState[I+2];auto& Path=State.SoilPath[I];
    if(!Wheel.ContactValid||Wheel.Constructed||Wheel.Load<=500||!Wheel.SoilConnected)continue;
    const float Forward=(Wheel.LastSoil.X-State.Start.X)/100;
    if(!Path.IsEmpty()){
      const float Delta=Forward-Path.Last().ForwardM;
      if(Delta<-.00625f)State.SoilOrdered=false;
      if(Delta<.001f)continue;
    }
    Path.Add({Wheel.LastSoil,Forward,Wheel.Footprint,Wheel.Load,FMath::Abs(Wheel.LongSpeed)});
  }
}
bool SoilAt(const TArray<FSoilPoint>& Path,float Forward,FSoilPoint& Result){
  for(int I=1;I<Path.Num();++I)if(Path[I-1].ForwardM<=Forward&&Path[I].ForwardM>=Forward){
    const auto& A=Path[I-1];const auto& B=Path[I];const float T=(Forward-A.ForwardM)/FMath::Max(.0001f,B.ForwardM-A.ForwardM);
    Result={FMath::Lerp(A.Position,B.Position,T),Forward,FMath::Lerp(A.PatchM,B.PatchM,T),FMath::Lerp(A.LoadN,B.LoadN,T),FMath::Lerp(A.SpeedMPS,B.SpeedMPS,T)};
    return true;
  }
  return false;
}
bool SoilProfile(ATerraVehicle* V,int Trial,float& Coverage,int& Samples){
  auto* T=V->Terrain.Get();float Patch=0,Load=0,Speed=0,Sink=0,MaxDepth=0;Coverage=1;Samples=0;
  bool Valid=State.SoilOrdered,Bounded=true;
  for(const auto& Path:State.SoilPath){
    int Counted=0,Depressed=0;
    for(float S=SoilWindowStartM;S<=SoilWindowEndM+.001f;S+=.125f){
      FSoilPoint P;if(!SoilAt(Path,S,P)){Valid=false;continue;}
      const auto Ground=T->Sample(P.Position);const auto Blend=T->SurfaceBlend(P.Position.X,P.Position.Y);
      // The verified natural lane has no standing water. New ruts must stay
      // dry rather than inventing a puddle at the old ground height.
      Valid&=Ground.Surface==5&&Blend.Weight[5]>.97f&&Ground.Softness>.72f&&Ground.MaxSink>.27f&&Ground.Water<=.1f;
      Valid&=FMath::IsFinite(P.PatchM)&&FMath::IsFinite(P.LoadN)&&FMath::IsFinite(P.SpeedMPS)&&FMath::IsFinite(Ground.RutDepth)&&!P.Position.ContainsNaN();
      Bounded&=Ground.RutDepth>=0&&Ground.RutDepth<=Ground.MaxSink+.003f;
      Patch+=P.PatchM;Load+=P.LoadN;Speed+=P.SpeedMPS;Sink+=Ground.MaxSink;MaxDepth=FMath::Max(MaxDepth,Ground.RutDepth);
      if(Ground.RutDepth>.001f)++Depressed;++Counted;++Samples;
    }
    Coverage=FMath::Min(Coverage,float(Depressed)/FMath::Max(1,Counted));Valid&=Counted==33;
  }
  State.SoilPatch[Trial]=Patch/FMath::Max(1,Samples);State.SoilMeanLoad[Trial]=Load/FMath::Max(1,Samples);
  State.SoilMeanSpeed[Trial]=Speed/FMath::Max(1,Samples);State.SoilMeanSink[Trial]=Sink/FMath::Max(1,Samples);
  State.SoilDepth[Trial]=MaxDepth;State.SoilBounded[Trial]=Bounded;
  State.SoilVolumeError[Trial]=FMath::Abs(T->DepressedVolume-T->DisplacedVolume-T->CompactedVolume);
  return Valid;
}
void Record(ATerraVehicle* V){
  ++State.Frames;State.Finite&=!V->GetActorLocation().ContainsNaN()&&FMath::IsFinite(V->Speed)&&FMath::IsFinite(V->LastRegenPowerW);
  if(State.Trial>=DriveBegin&&State.Trial<BrakeBegin){
    // The whole coachwork must remain inside the searched road corridor for
    // acceleration, coasting AND braking. A chassis centre alone can still
    // carry a turning nose into scenery just beyond the clear strip.
    const FBox Box=V->Body->CalcBounds(V->Body->GetComponentTransform()).GetBox();
    const FVector Low=Box.Min-State.Fixture,High=Box.Max-State.Fixture;
    const float Side=FMath::Max(FMath::Abs(float(Low.Y)),FMath::Abs(float(High.Y)));
    State.DriveMaximumSideCM=FMath::Max(State.DriveMaximumSideCM,Side);State.DriveMaximumForwardCM=FMath::Max(State.DriveMaximumForwardCM,float(High.X));
    State.DriveMinimumForwardCM=FMath::Min(State.DriveMinimumForwardCM,float(Low.X));
    State.DriveCorridor&=State.FixtureValid&&Low.X>=-RoadRearCM&&High.X<=RoadForwardCM&&Side<=RoadHalfWidthCM;
  }
  State.PeakSpeed=FMath::Max(State.PeakSpeed,FMath::Abs(V->Speed));
  if(FMath::Abs(V->Speed)>.1f)++State.MovingFrames;if(V->ContactCount>=3)++State.LoadedFrames;
  float Sum=0;
  for(int I=0;I<4;++I){
    const auto& W=V->WheelState[I];State.Finite&=FMath::IsFinite(W.Load)&&FMath::IsFinite(W.Omega)&&FMath::IsFinite(W.Footprint)&&!W.Center.ContainsNaN();
    Sum+=FMath::Abs(V->LastWheelDriveNm[I]);
    if(!V->DrivenWheel(I)&&FMath::Abs(V->LastWheelDriveNm[I])>.05f)State.DrivenCorrectly=false;
    if(W.ContactValid&&W.Load>500){State.PatchSum+=W.Footprint;State.LoadSum+=1;State.MaxDepth=FMath::Max(State.MaxDepth,W.RutDepth);}
  }
  State.PeakDrive=FMath::Max(State.PeakDrive,Sum);State.PeakRegen=FMath::Max(State.PeakRegen,V->LastRegenPowerW);
  State.WheelDifference=FMath::Max(State.WheelDifference,FMath::Abs(V->WheelState[0].Omega-V->WheelState[1].Omega));
  if(V->Overturned||V->GetActorUpVector().Z<.15f){V->TestThrottle=0;V->TestBrake=1;State.Finite=false;}
}
void Matrix(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Index=State.Trial/4,Stage=State.Trial%4;const FString Label=FString::Printf(TEXT("vehicle %d conversion stage %d "),Index,Stage);
  if(State.Phase==0){
    Configure(V,Index,Stage,Metadata(V,Index,TEXT("stockPSI"),35));
    const auto Config=V->ElectricConfig();const auto ICE=V->CombustionConfig();const auto Expected=TerraSim::ResolveMotorLayout(Stage,int(Metadata(V,Index,TEXT("electricMotors"))));
    bool Layout=V->ElectricLayout()==Expected&&V->IsElectric()==(Expected!=TerraSim::MotorLayout::None);
    if(Expected==TerraSim::MotorLayout::Single){
      const bool Selected=V->FourDrive;
      V->FourDrive=false;
      const bool RearOnly=!V->DrivenWheel(0)&&!V->DrivenWheel(1)&&V->DrivenWheel(2)&&V->DrivenWheel(3);
      V->FourDrive=true;
      const bool Equipped=V->HasFourDrive();
      const bool SelectedFour=V->DrivenWheel(0)==Equipped&&V->DrivenWheel(1)==Equipped&&V->DrivenWheel(2)&&V->DrivenWheel(3)&&
        (!Equipped||!V->HasCenterLocker()||V->CenterLockActive()||V->DriveDescription()==TEXT("AWD HIGH"));
      V->FourDrive=Selected;
      Layout&=RearOnly&&SelectedFour;
      UE_LOG(LogTemp,Display,TEXT("TERRA_SINGLE_TOPOLOGY vehicle=%d rearOnly=%d fourEquipped=%d selectedFourCorrect=%d restoredSelection=%d"),Index,RearOnly,Equipped,SelectedFour,V->FourDrive==Selected);
    }
    if(V->IsICEConversion())Layout&=Expected==TerraSim::MotorLayout::None&&V->DrivenWheel(0)&&V->DrivenWheel(3)&&V->UpgradeName(TerraSim::EVSwap)==TEXT("ICE CONVERSION")&&Config.RegenPowerW==0&&Config.BatteryKWh==0;
    if(Expected==TerraSim::MotorLayout::Dual||Expected==TerraSim::MotorLayout::Triple||Expected==TerraSim::MotorLayout::Quad)
      for(int I=0;I<4;++I)Layout&=V->DrivenWheel(I);
    for(int I=0;I<4;++I)Layout&=V->IndependentWheel(I)==TerraSim::IndependentElectricWheel(Expected,I);
    Check(Label+TEXT("factory or selected motor topology controls the correct driven wheels"),Layout,TerraSim::ElectricMotorCount(V->ElectricLayout()));
    const float ExpectedMass=Metadata(V,Index,TEXT("mass"))+Config.NetMassKg+ICE.NetMassKg;
    const float ExpectedPower=V->IsElectric()?Config.PowerW:V->IsICEConversion()?ICE.PowerW:Metadata(V,Index,TEXT("powerHP"))*745.7f;
    // Independent reference values catch an incorrect factory capacity even if
    // the roster metadata and ElectricConfig agree with each other.
    const bool FactoryBattery=Stage!=0||((Index!=4||FMath::Abs(Config.BatteryKWh-170.f)<.001f)&&
      (Index!=7||FMath::Abs(Config.BatteryKWh-116.f)<.001f));
    const bool Budget=FactoryBattery&&FMath::IsFinite(V->Mass)&&FMath::Abs(V->Mass-ExpectedMass)<.2f&&V->Mass>500&&V->Mass<8000&&
      FMath::IsFinite(V->PowerHP())&&ExpectedPower>0&&FMath::Abs(V->PowerHP()*745.7f-ExpectedPower)<FMath::Max(10.f,ExpectedPower*.005f);
    Check(Label+TEXT("motor output, factory battery and donor-adjusted mass match the actual configured hardware"),Budget,V->Mass*2.2046226f);
    if(Stage==0){
      State.StockMass[Index]=V->Mass;State.StockPower[Index]=V->PowerHP();
      bool Loaded=V->Body&&V->Body->GetStaticMesh()&&V->Wheels.Num()==4;
      for(auto W:V->Wheels)Loaded&=W&&W->GetStaticMesh();
      Check(Label+TEXT("roster body and all four tire assets are loaded"),Loaded,V->Wheels.Num());
      if(V->IsFactoryElectric())for(int PowerStage=1;PowerStage<=3;++PowerStage){
        V->SetUpgrade(TerraSim::Engine,PowerStage,false);
        V->SetUpgrade(TerraSim::Electrical,PowerStage==3?3:0,false);
        const float Factors[]={1,1.18f,1.40f,1.68f};
        const float Factor=Factors[PowerStage]*(PowerStage==3?1.28f:1.f);
        const auto Tuned=V->ElectricConfig();
        Check(FString::Printf(TEXT("factory EV %d motor power stage %d retains factory motor topology and battery mass"),Index,PowerStage),
          V->ElectricLayout()==Expected&&V->UpgradeStage(TerraSim::EVSwap)==0&&FMath::Abs(V->PowerHP()-State.StockPower[Index]*Factor)<.1f&&
          FMath::Abs(Tuned.PeakWheelTorqueNm-Config.PeakWheelTorqueNm*Factor)<1.f&&FMath::Abs(Tuned.RegenPowerW-Config.RegenPowerW*FMath::Sqrt(Factor))<1.f&&
          FMath::Abs(V->Mass-State.StockMass[Index])<.2f&&Tuned.BatteryKWh==Config.BatteryKWh,V->PowerHP());
      }
      V->SetUpgrade(TerraSim::Engine,0,false);V->SetUpgrade(TerraSim::Electrical,0,false);
    }
    V->SetGarage(false);V->TeleportZone(1);ResetInput(V);Phase(1);return;
  }
  if(State.Phase==1&&State.Time>1.8f){
    const FVector P=V->GetActorLocation();const float Height=(P.Z-V->Terrain->Height(P.X,P.Y))/100;
    Check(Label+TEXT("real Chaos body mass remains equal to the configured vehicle mass"),FMath::IsFinite(V->Chassis->GetMass())&&FMath::Abs(V->Chassis->GetMass()-V->Mass)<FMath::Max(1.f,V->Mass*.001f),V->Chassis->GetMass()*2.2046226f);
    Check(Label+TEXT("real suspension settles with supported finite tires and an upright body"),!P.ContainsNaN()&&V->ContactCount>=3&&V->GetActorUpVector().Z>.8f&&FMath::Abs(Height-V->ExpectedRideHeight())<.15f,Height/.0254f);
    UE_LOG(LogTemp,Display,TEXT("TERRA_ELECTRIC_CONFIG vehicle=%d stage=%d motors=%d massKg=%.3f netKg=%.3f powerW=%.1f wheelTorqueNm=%.2f batteryKWh=%.3f contacts=%d rideM=%.4f"),Index,Stage,TerraSim::ElectricMotorCount(V->ElectricLayout()),V->Mass,V->ElectricConfig().NetMassKg,V->PowerHP()*745.7f,V->ElectricConfig().PeakWheelTorqueNm,V->ElectricConfig().BatteryKWh,V->ContactCount,Height);
    if((Index>=6&&Stage==0)||(Index==2&&Stage>0)||((Index==4||Index==7)&&Stage>0)){V->SetGarage(true);V->SetGarageView(0);Phase(2);}
    else {if(Stage==3){V->SetGarage(true);V->ResetUpgrades(false);Check(Label+TEXT("removing the conversion restores factory motor layout power and mass"),V->ElectricLayout()==TerraSim::ResolveMotorLayout(0,int(Metadata(V,Index,TEXT("electricMotors"))))&&FMath::Abs(V->Mass-State.StockMass[Index])<.2f&&FMath::Abs(V->PowerHP()-State.StockPower[Index])<.1f,V->Mass);}Next();}
  }else if(State.Phase==2&&State.Time>.4f){
    Capture(*FString::Printf(TEXT("native-electric-v%d-stage%d.png"),Index,Stage));Phase(3);
  }else if(State.Phase==3&&State.Time>.3f){
    if(Stage==3){V->ResetUpgrades(false);Check(Label+TEXT("removing the conversion restores factory motor layout power and mass"),V->ElectricLayout()==TerraSim::ResolveMotorLayout(0,int(Metadata(V,Index,TEXT("electricMotors"))))&&FMath::Abs(V->Mass-State.StockMass[Index])<.2f&&FMath::Abs(V->PowerHP()-State.StockPower[Index])<.1f,V->Mass);}Next();
  }
}
void Air(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Stage=State.Trial-AirBegin+1;const FString Label=FString::Printf(TEXT("CTIS stage %d "),Stage);
  const auto Hardware=TerraSim::ResolveTireAirHardware(Stage);
  if(State.Phase==0){
    const float Stock=Metadata(V,State.FactoryQuad,TEXT("stockPSI"),35);
    Configure(V,State.FactoryQuad,0,Stock,Stage);
    const auto Bounds=V->TireAirBounds();V->RequestTirePressure(100);
    bool WheelsBounded=true;for(int I=0;I<4;++I)WheelsBounded&=V->WheelPressure(I)<=65;
    Check(Label+TEXT("garage service clamps actual and requested pressure at the maximum"),V->Pressure==Bounds.MaximumPSI&&V->PressureTarget==Bounds.MaximumPSI&&WheelsBounded,V->Pressure);
    const float Minimum=Bounds.MinimumPSI;
    V->RequestTirePressure(-100);
    Check(Label+TEXT("garage service honors the loaded tire minimum without a hidden beadlock upgrade"),FMath::Abs(V->Pressure-Minimum)<.01f&&FMath::Abs(V->PressureTarget-Minimum)<.01f,V->Pressure);
    V->RequestTirePressure(Stock);Park(V,false);return;
  }
  if(State.Phase==1&&State.Time>1.8f){
    const bool Entry=RoadEntry(V);
    Check(Label+TEXT("garage air service sets actual pressure and target together at the verified road pose"),Entry&&FMath::Abs(V->Pressure-V->PressureTarget)<.001f,V->Pressure);
    const float Before=V->Pressure;V->RequestTirePressure(Before+3);
    Check(Label+TEXT("driving request changes target without teleporting actual pressure"),FMath::Abs(V->Pressure-Before)<.001f&&V->PressureTarget>Before,V->PressureTarget);
    const FVector RestingVelocity=V->Chassis->GetPhysicsLinearVelocity();
    V->Chassis->SetPhysicsLinearVelocity(V->GetActorForwardVector()*(Hardware.MaximumSpeedMPS+.5f)*100);V->AdvanceTireAirForValidation(1);
    Check(Label+TEXT("actual tire-air update pauses beyond fitted system speed limit"),FMath::Abs(V->Pressure-Before)<.001f,V->Pressure);
    V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);const float SOC=V->BatterySOC;V->BatterySOC=0;V->AdvanceTireAirForValidation(1);
    Check(Label+TEXT("actual electric tire-air update cannot inflate without control power"),!V->TireAirPowered()&&FMath::Abs(V->Pressure-Before)<.001f,V->Pressure);
    V->PressureTarget=Before;V->RequestTirePressure(Before-3);V->AdvanceTireAirForValidation(1);
    Check(Label+TEXT("actual electronic valves cannot deflate without control power"),FMath::Abs(V->Pressure-Before)<.001f,V->Pressure);
    V->BatterySOC=SOC;V->PressureTarget=Before;V->RequestTirePressure(Before+3);V->Chassis->SetPhysicsLinearVelocity(V->GetActorForwardVector()*100);
    const float Volume=TerraSim::TireAirVolumeScale(V->TireDiameter()*.0127f,V->SpecValue(TEXT("tireWidth"),.285f));
    V->AdvanceTireAirForValidation(1);
    Check(Label+TEXT("native powered inflation advances by its finite volume-scaled rate"),FMath::Abs(V->Pressure-Before-Hardware.InflatePSIPerSecond/Volume)<.002f,V->Pressure-Before);
    // Reset this diagnostic pressure fixture before the independent real
    // moving trial; no pressure or velocity is edited during that trial.
    V->Chassis->SetPhysicsLinearVelocity(RestingVelocity);V->Pressure=Before;V->PressureTarget=Before;V->RequestTirePressure(Before-3);State.InitialPSI=Before;
    if(Entry)RollingStart(V,1);else V->TestBrake=1;
    V->TestThrottle=V->TestSteer=0;State.Start=V->GetActorLocation();State.Frames=State.MovingFrames=0;Phase(2);return;
  }
  if(State.Phase==2){
    Record(V);
    if(State.Time>1.3f){
      const float Change=State.InitialPSI-V->Pressure,Volume=TerraSim::TireAirVolumeScale(V->TireDiameter()*.0127f,V->SpecValue(TEXT("tireWidth"),.285f));
      const float Expected=Hardware.DeflatePSIPerSecond*State.Time/Volume;
      const float TimingTolerance=.01f+Hardware.DeflatePSIPerSecond/Volume*.12f;
      Check(Label+TEXT("real moving vehicle ticks produce finite volume-scaled deflation"),State.Finite&&State.FixtureValid&&State.MovingFrames>=3&&Change>0&&FMath::Abs(Change-Expected)<TimingTolerance&&Change<3,Change);
      Check(Label+TEXT("actual and target pressure remain within the supported load-relative bounds"),V->Pressure>=10&&V->Pressure<=65&&V->PressureTarget>=10&&V->PressureTarget<=65,V->Pressure);
      UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE_AIR stage=%d dt=%.4f actualDrop=%.6f expectedDrop=%.6f volume=%.3f movingFrames=%d frames=%d target=%.3f"),Stage,State.Time,Change,Expected,Volume,State.MovingFrames,State.Frames,V->PressureTarget);
      V->TestBrake=1;Photo(V,V->GetActorLocation());Phase(3);
    }
  }else if(State.Phase==3&&State.Time>.3f){Capture(*FString::Printf(TEXT("native-pressure-ctis-stage%d.png"),Stage));Phase(4);}
  else if(State.Phase==4&&State.Time>.3f)Next();
}
void Drive(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Trial=State.Trial-DriveBegin,Index=Trial<3?2:Trial<6?Trial+3:Trial<9?4:7,Swap=Trial<3?Trial+1:Trial<6?0:(Trial-6)%3+1;
  const FString Label=FString::Printf(TEXT("actual vehicle %d conversion stage %d "),Index,Swap);
  if(State.Phase==0){Configure(V,Index,Swap,Metadata(V,Index,TEXT("stockPSI"),35));Park(V,false);return;}
  if(State.Phase==1&&State.Time>1.8f){
    const bool Entry=RoadEntry(V);
    Check(Label+TEXT("drive comparison starts at the verified pavement position and heading with supported tires"),Entry&&V->ContactCount>=3&&V->GetActorUpVector().Z>.8f,V->ContactCount);
    State.Start=V->GetActorLocation();V->ResetContactTelemetry();V->TestBrake=0;
    V->TestThrottle=!State.FixtureValid||V->ContactCount<3||V->Overturned||V->GetActorUpVector().Z<.15f?0:.35f;
    // A shared one-second turn exercises independent wheel speeds, then the
    // driver straightens the wheels before the faster coast/brake phases.
    V->TestSteer=.10f;Phase(2);return;
  }
  if(State.Phase==2&&State.Time>=1.f)V->TestSteer=0;
  if(State.Phase>=2&&State.Phase<=4)Record(V);
  if(State.Phase==2&&State.Time>3){
    const float Travel=FVector::Dist2D(State.Start,V->GetActorLocation())/100;
    Check(Label+TEXT("real motor or engine forces accelerate the car without pose or velocity intervention"),State.Finite&&State.DriveCorridor&&Travel>2&&State.PeakSpeed>1&&State.PeakDrive>30&&State.DrivenCorrectly&&V->ObjectBodyHits==0&&V->GetActorUpVector().Z>.7f,Travel*3.28084f);
    if(V->ElectricLayout()==TerraSim::MotorLayout::Quad)Check(Label+TEXT("independent axle wheels can rotate at different speeds while turning"),State.WheelDifference>.02f,State.WheelDifference);
    V->TestThrottle=V->TestSteer=0;V->TestBrake=0;State.PeakRegen=0;Phase(3);
  }else if(State.Phase==3&&State.Time>1){
    Check(Label+TEXT("lift off regeneration follows electrical capability without changing drive direction"),State.DriveCorridor&&V->ObjectBodyHits==0&&(V->IsElectric()?State.PeakRegen>0:State.PeakRegen<.01f),State.PeakRegen);
    V->TestBrake=1;Phase(4);
  }else if(State.Phase==4&&(FMath::Abs(V->Speed)<.12f||State.Time>6)){
    Check(Label+TEXT("service brake completes a forward stop inside the clear corridor without object impacts or reverse propulsion"),State.Finite&&State.DriveCorridor&&V->ObjectBodyHits==0&&FMath::Abs(V->Speed)<.2f&&V->Direction==1&&V->TestThrottle==0&&V->Speed>-.15f,V->Speed*2.2369363f);
    UE_LOG(LogTemp,Display,TEXT("TERRA_ELECTRIC_DRIVE vehicle=%d swap=%d peakMPS=%.4f peakTorqueNm=%.3f regenW=%.3f frontOmegaDifference=%.4f endMPS=%.5f objectHits=%d terrainHits=%d corridor=%d maxBodySideCM=%.3f maxBodyForwardCM=%.3f minBodyForwardCM=%.3f"),Index,Swap,State.PeakSpeed,State.PeakDrive,State.PeakRegen,State.WheelDifference,V->Speed,V->ObjectBodyHits,V->TerrainBodyHits,State.DriveCorridor,State.DriveMaximumSideCM,State.DriveMaximumForwardCM,State.DriveMinimumForwardCM);
    Photo(V,V->GetActorLocation());Phase(5);
  }else if(State.Phase==5&&State.Time>.3f){Capture(*FString::Printf(TEXT("native-electric-drive-v%d-stage%d.png"),Index,Swap));Phase(6);}
  else if(State.Phase==6&&State.Time>.3f)Next();
}
void Braking(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Trial=State.Trial-BrakeBegin;const FString Label=Trial?TEXT("aired-down road tires "):TEXT("placard road tires ");
  if(State.Phase==0){Configure(V,2,0,Metadata(V,2,TEXT("stockPSI"),33)*(Trial?.5f:1.f));Park(V,false);return;}
  if(State.Phase==1&&State.Time>1.8f){
    const bool Entry=RoadEntry(V);
    const auto Handling=V->TirePressureHandling();
    Check(Label+TEXT("native pressure handling reaches the road tire stiffness response and grip"),Trial?
      Handling.LongitudinalGrip<.90f&&Handling.LateralGrip<.9f&&Handling.CorneringStiffness<.7f&&Handling.SteeringResponse<.7f&&Handling.RollingCoefficientAdd>.01f:
      FMath::Abs(Handling.LongitudinalGrip-1)<.01f&&FMath::Abs(Handling.SteeringResponse-1)<.01f,Handling.LongitudinalGrip);
    Check(Label+TEXT("brake fixture matches the verified pavement position and heading with all four tires loaded"),Entry&&V->ContactCount==4,V->ContactCount);
    if(Entry)RollingStart(V,12);
    V->TestThrottle=V->TestSteer=0;V->TestBrake=1;Phase(2);return;
  }
  if(State.Phase==2){
    Record(V);
    if(FMath::Abs(V->Speed)<.12f||State.Time>8){
      State.BrakeDistance[Trial]=FVector::Dist2D(State.Start,V->GetActorLocation())/100;State.BrakeTime[Trial]=State.Time;
      Check(Label+TEXT("matched real service-brake input stops without hitting scenery or reversing"),State.Finite&&FMath::Abs(V->Speed)<.2f&&V->Speed>-.15f&&V->ObjectBodyHits==0&&State.BrakeDistance[Trial]>1,State.BrakeDistance[Trial]*3.28084f);
      if(Trial)Check(TEXT("half-pressure road tires require a measurably longer actual braking distance"),State.BrakeDistance[1]>State.BrakeDistance[0]*1.06f&&State.BrakeDistance[1]<State.BrakeDistance[0]*2,State.BrakeDistance[1]/FMath::Max(.01f,State.BrakeDistance[0]));
      UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE_BRAKE trial=%d psi=%.4f distanceM=%.5f stopTime=%.4f speedMPS=%.5f contacts=%d objects=%d"),Trial,V->Pressure,State.BrakeDistance[Trial],State.Time,V->Speed,V->ContactCount,V->ObjectBodyHits);
      Photo(V,V->GetActorLocation());Phase(3);
    }
  }else if(State.Phase==3&&State.Time>.3f){Capture(Trial?TEXT("native-pressure-road-low.png"):TEXT("native-pressure-road-placard.png"));Phase(4);}
  else if(State.Phase==4&&State.Time>.3f)Next();
}
void Soil(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Trial=State.Trial-SoilBegin;const FString Label=Trial?TEXT("aired-down sand tires "):TEXT("placard sand tires ");
  if(State.Phase==0){Configure(V,0,0,Trial?20:Metadata(V,0,TEXT("stockPSI"),37));ParkSoil(V);return;}
  if(State.Phase==1&&State.Time>1.8f){
    bool Contacts=V->ContactCount==4;
    for(int I=0;I<V->WheelCount();++I){const auto& W=V->WheelState[I];Contacts&=W.ContactValid&&!W.Constructed&&W.Ground.Surface==5&&W.Ground.Softness>.72f&&W.Ground.MaxSink>.27f;}
    State.SoilMass[Trial]=V->Mass;State.SoilPsi[Trial]=V->Pressure;State.SoilWidth[Trial]=V->SpecValue(TEXT("tireWidth"),.285f)*V->Tuning.TireWidth;State.SoilRadius[Trial]=V->TireDiameter()*.0127f;
    State.SoilMatched[Trial]=State.FixtureValid&&Contacts&&FVector::Dist2D(V->GetActorLocation(),State.Fixture)<12&&V->GetActorUpVector().Z>.8f;
    if(Trial)State.SoilMatched[Trial]&=FMath::Abs(State.SoilMass[1]-State.SoilMass[0])<.01f;
    Check(Label+TEXT("matched fixture is actual pure gentle sand with four loaded tires and the same stock mass"),State.SoilMatched[Trial],V->ContactCount);
    if(State.SoilMatched[Trial]){RollingStart(V,SoilEntryMPS);State.SoilEntry[Trial]=V->Chassis->GetPhysicsLinearVelocity().Size()/100;}
    else{V->TestThrottle=0;V->TestBrake=1;State.SoilEntry[Trial]=0;}
    State.Start=V->GetActorLocation();State.Frames=State.LoadedFrames=0;Phase(2);return;
  }
  if(State.Phase==2){
    Record(V);RecordSoil(V);
    // Both passes use the same bounded throttle-only driver to hold the same
    // target speed despite pressure-dependent rolling loss. All acceleration
    // remains the real engine, tire and Chaos response; no force/pose/speed is
    // overwritten after the rolling initial condition.
    V->TestThrottle=!State.SoilMatched[Trial]||V->Overturned||V->GetActorUpVector().Z<.15f?0:FMath::Clamp(.22f+(SoilEntryMPS-V->Speed)*.12f,.08f,.40f);
    const float Travel=(V->GetActorLocation().X-State.Start.X)/100;
    if(Travel>=SoilFinishM||State.Time>10||!State.SoilMatched[Trial]){
      float Coverage=0;int Samples=0;const bool Profile=SoilProfile(V,Trial,Coverage,Samples);
      Check(Label+TEXT("real tires complete the common distance window with continuous bounded physical sand ruts"),State.SoilMatched[Trial]&&State.Finite&&Profile&&Samples==66&&Travel>=SoilFinishM&&Travel<12&&
        FMath::Abs(State.SoilEntry[Trial]-SoilEntryMPS)<.01f&&Coverage>.90f&&State.SoilDepth[Trial]>.001f&&State.SoilBounded[Trial]&&V->Terrain->DepressedVolume>.0001&&
        V->ObjectBodyHits==0&&V->TerrainBodyHits==0&&State.LoadedFrames>State.Frames*.9f,Travel*3.28084f);
      if(Trial){
        const float LoadRatio=State.SoilMeanLoad[1]/FMath::Max(1.f,State.SoilMeanLoad[0]),SpeedRatio=State.SoilMeanSpeed[1]/FMath::Max(.01f,State.SoilMeanSpeed[0]);
        Check(TEXT("airing down enlarges actual carcass contact over equal distance with matched load and speed"),State.SoilMatched[0]&&State.SoilMatched[1]&&Profile&&LoadRatio>.90f&&LoadRatio<1.10f&&SpeedRatio>.85f&&SpeedRatio<1.15f&&
          State.SoilPatch[1]>State.SoilPatch[0]*1.12f,State.SoilPatch[1]/FMath::Max(.001f,State.SoilPatch[0]));
        const float MatchedLoad=(State.SoilMeanLoad[0]+State.SoilMeanLoad[1])*.5f,Width=State.SoilWidth[0],Radius=State.SoilRadius[0],Sink=FMath::Min(State.SoilMeanSink[0],State.SoilMeanSink[1]);
        const float NormalPatch=TerraSim::FootprintLength(MatchedLoad,State.SoilPsi[0],Width,Radius,false),LowPatch=TerraSim::FootprintLength(MatchedLoad,State.SoilPsi[1],Width,Radius,false);
        const auto NormalSoil=TerraSim::SoftSoilFootprint(NormalPatch,MatchedLoad,Width,Radius,Sink,.08f,0),LowSoil=TerraSim::SoftSoilFootprint(LowPatch,MatchedLoad,Width,Radius,Sink,.08f,0);
        const float StressRatio=NormalPatch/FMath::Max(.001f,LowPatch);
        // Natural strength/slip and the rolling arc need not make one run's
        // peak rut shallower. Prove the actual model's same-load pressure/area
        // relationship, while bounding both real retained paths and conserving
        // their displaced/compacted volume. Do not relabel depth noise a gain.
        Check(TEXT("lower pressure reduces matched carcass stress without extra modeled sink or lost native soil volume"),State.SoilMatched[0]&&State.SoilMatched[1]&&State.SoilBounded[0]&&State.SoilBounded[1]&&
          FMath::Abs(State.SoilWidth[0]-State.SoilWidth[1])<.0001f&&FMath::Abs(State.SoilRadius[0]-State.SoilRadius[1])<.0001f&&MatchedLoad>1000&&StressRatio<.90f&&
          LowSoil.Depth<=NormalSoil.Depth+.00001f&&State.SoilVolumeError[0]<.00001&&State.SoilVolumeError[1]<.00001,StressRatio);
      }
      UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE_SOIL trial=%d fixture=%d actual=%s requested=%s psi=%.4f massKg=%.3f entryMPS=%.5f travelM=%.4f windowM=4:8 samples=%d profile=%d coverage=%.5f meanCarcassPatchM=%.6f meanLoadN=%.3f meanMPS=%.4f meanSinkM=%.5f maxRetainedRutM=%.6f bounded=%d loaded=%d frames=%d removedM3=%.7f volumeErrorM3=%.10f objectHits=%d terrainHits=%d"),
        Trial,State.SoilMatched[Trial],*V->GetActorLocation().ToString(),*State.Fixture.ToString(),V->Pressure,V->Mass,State.SoilEntry[Trial],Travel,Samples,Profile,Coverage,
        State.SoilPatch[Trial],State.SoilMeanLoad[Trial],State.SoilMeanSpeed[Trial],State.SoilMeanSink[Trial],State.SoilDepth[Trial],State.SoilBounded[Trial],State.LoadedFrames,State.Frames,V->Terrain->DepressedVolume,State.SoilVolumeError[Trial],V->ObjectBodyHits,V->TerrainBodyHits);
      V->TestThrottle=0;V->TestBrake=1;Photo(V,(State.Start+V->GetActorLocation())*.5f);Phase(3);
    }
  }else if(State.Phase==3&&State.Time>.4f){Capture(Trial?TEXT("native-pressure-sand-low.png"):TEXT("native-pressure-sand-placard.png"));Phase(4);}
  else if(State.Phase==4&&State.Time>.3f)Next();
}
void Steering(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Trial=State.Trial-SteerBegin;const FString Label=Trial?TEXT("aired-down road steering "):TEXT("placard road steering ");
  if(State.Phase==0){Configure(V,2,0,Metadata(V,2,TEXT("stockPSI"),33)*(Trial?.5f:1.f));Park(V,false);return;}
  if(State.Phase==1&&State.Time>1.8f){
    const bool Entry=RoadEntry(V);
    Check(Label+TEXT("maneuver starts at the same verified road position and heading with supported tires"),Entry&&V->ContactCount==4,V->ContactCount);
    if(Entry)RollingStart(V,8);
    V->TestThrottle=0;V->TestBrake=Entry?0:1;V->TestSteer=.28f;V->Steer=0;State.StartYaw=V->GetActorRotation().Yaw;Phase(2);return;
  }
  if(State.Phase==2){
    Record(V);
    if(State.Time>1.2f){
      State.SteerYaw[Trial]=FMath::Abs(FMath::FindDeltaAngleDegrees(State.StartYaw,float(V->GetActorRotation().Yaw)));
      const FVector Side=FRotator(0,State.StartYaw,0).RotateVector(FVector::RightVector);
      State.SteerLateral[Trial]=FMath::Abs(FVector::DotProduct(V->GetActorLocation()-State.Start,Side))/100;
      Check(Label+TEXT("real tire forces turn the moving car under the matched steering input"),State.Finite&&State.SteerYaw[Trial]>.4f&&State.SteerLateral[Trial]>.02f&&V->ObjectBodyHits==0&&V->GetActorUpVector().Z>.8f,State.SteerYaw[Trial]);
      if(Trial)Check(TEXT("half-pressure road tires have measurably slower actual yaw response"),State.SteerYaw[1]<State.SteerYaw[0]*.97f,State.SteerYaw[1]/FMath::Max(.01f,State.SteerYaw[0]));
      UE_LOG(LogTemp,Display,TEXT("TERRA_PRESSURE_STEER trial=%d psi=%.4f dt=%.5f yawDegrees=%.6f lateralM=%.5f speedMPS=%.4f"),Trial,V->Pressure,State.Time,State.SteerYaw[Trial],State.SteerLateral[Trial],V->Speed);
      V->TestSteer=0;V->TestBrake=1;Photo(V,V->GetActorLocation());Phase(3);
    }
  }else if(State.Phase==3&&State.Time>.3f){Capture(Trial?TEXT("native-pressure-steer-low.png"):TEXT("native-pressure-steer-placard.png"));Phase(4);}
  else if(State.Phase==4&&State.Time>.3f)Next();
}
void WidgetTexts(const TSharedRef<SWidget>& Widget,TArray<FString>& Texts){
  if(Widget->GetType()==FName(TEXT("STextBlock")))Texts.Add(StaticCastSharedRef<STextBlock>(Widget)->GetText().ToString());
  FChildren* Children=Widget->GetChildren();
  for(int I=0;Children&&I<Children->Num();++I)WidgetTexts(Children->GetChildAt(I),Texts);
}
void UpgradeUI(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  const int Trial=State.Trial-UIBegin,Part=Trial==0?TerraSim::Engine:TerraSim::EVSwap;
  const TCHAR* Titles[]={TEXT("MOTOR POWER"),TEXT("ICE CONVERSION"),TEXT("EV CONVERSION")};
  const TCHAR* Files[]={TEXT("native-powertrain-ui-g580-motor-power.png"),TEXT("native-powertrain-ui-g580-ice-conversion.png"),TEXT("native-powertrain-ui-civic-ev-conversion.png")};
  if(State.Phase==0){
    const int Index=Trial==2?2:7;
    Configure(V,Index,Trial==0?0:2,Metadata(V,Index,TEXT("stockPSI"),35));
    if(Trial==0)V->SetUpgrade(TerraSim::Engine,2,false);
    if(auto Garage=V->GetGarageWidget())Garage->ShowUpgradePart(Part);
    Phase(1);return;
  }
  if(State.Phase==1&&State.Time>.65f){
    auto Garage=V->GetGarageWidget();TArray<FString> Texts;bool Visible=false;
    if(Garage.IsValid()){
      auto Row=Garage->UpgradePartWidget(Part);auto Scroll=Garage->UpgradePartScrollBox();
      if(Row.IsValid()&&Scroll.IsValid()){
        WidgetTexts(Row.ToSharedRef(),Texts);
        const auto& R=Row->GetCachedGeometry();const auto& S=Scroll->GetCachedGeometry();
        const FVector2D R0=R.LocalToAbsolute(FVector2D::ZeroVector),R1=R.LocalToAbsolute(R.GetLocalSize());
        const FVector2D S0=S.LocalToAbsolute(FVector2D::ZeroVector),S1=S.LocalToAbsolute(S.GetLocalSize());
        Visible=R.GetLocalSize().X>100&&R.GetLocalSize().Y>20&&R0.X>=S0.X-2&&R1.X<=S1.X+2&&R0.Y>=S0.Y-2&&R1.Y<=S1.Y+2;
      }
    }
    bool Labels=Texts.Contains(Titles[Trial])&&Texts.Contains(TEXT("STOCK"));
    if(Trial==0)Labels&=Texts.Contains(TEXT("I"))&&Texts.Contains(TEXT("II"))&&Texts.Contains(TEXT("III"))&&V->IsFactoryElectric()&&TerraSim::ElectricMotorCount(V->ElectricLayout())==4;
    else if(Trial==1)Labels&=Texts.Contains(TEXT("350HP"))&&Texts.Contains(TEXT("500HP"))&&Texts.Contains(TEXT("700HP"))&&!Texts.Contains(TEXT("SINGLE"))&&!Texts.Contains(TEXT("DUAL"))&&!Texts.Contains(TEXT("QUAD"))&&V->IsICEConversion()&&!V->IsElectric();
    else Labels&=Texts.Contains(TEXT("SINGLE"))&&Texts.Contains(TEXT("DUAL"))&&Texts.Contains(TEXT("QUAD"))&&!Texts.Contains(TEXT("350HP"))&&!V->IsFactoryElectric()&&V->ElectricLayout()==TerraSim::MotorLayout::Dual;
    Check(FString::Printf(TEXT("constructed garage %s row displays correct dynamic stage labels completely inside the scrolled viewport"),Titles[Trial]),Visible&&Labels,Texts.Num());
    UE_LOG(LogTemp,Display,TEXT("TERRA_POWERTRAIN_UI trial=%d vehicle=%d part=%d visible=%d labels=%d text=%s"),Trial,V->VehicleIndex,Part,Visible,Labels,*FString::Join(Texts,TEXT(" | ")));
    Phase(2);
  }else if(State.Phase==2&&State.Time>.25f){Capture(Files[Trial]);Phase(3);}
  else if(State.Phase==3&&State.Time>.3f)Next();
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(!V||!V->Initialized||!V->Terrain||!V->Terrain->Ready)return false;
  if(State.Vehicle.Get()!=V){
    State=FState();State.Vehicle=V;
    State.OriginalVehicle=V->VehicleIndex;State.OriginalGarage=V->Garage;State.OriginalZone=V->Zone;State.OriginalRoute=V->RouteIndex;
    State.OriginalTracks=V->Tracks;State.OriginalFour=V->FourDrive;State.OriginalLow=V->LowRange;State.OriginalFrontLock=V->FrontLocked;State.OriginalRearLock=V->RearLocked;State.OriginalCenterLock=V->CenterLocked;State.OriginalDescent=V->DescentAssist;
    State.OriginalPressure=V->Pressure;State.OriginalTarget=V->PressureTarget;State.OriginalSOC=V->BatterySOC;State.OriginalFuel=V->FuelFraction;State.OriginalEnergyUsage=V->EnergyUsageEnabled;State.OriginalDamage=V->Damage;
    State.OriginalAirRequested=V->TireAirRequested;State.OriginalDamageEnabled=V->DamageEnabled;
    State.OriginalDriverInput=V->TestDriverInput;State.OriginalForward=V->TestForward;State.OriginalReverse=V->TestReverse;State.OriginalStop=V->TestStop;
    State.OriginalThrottle=V->TestThrottle;State.OriginalSteer=V->TestSteer;State.OriginalBrake=V->TestBrake;
    State.OriginalTransform=V->GetActorTransform();State.OriginalVelocity=V->Chassis->GetPhysicsLinearVelocity();State.OriginalAngular=V->Chassis->GetPhysicsAngularVelocityInRadians();
    for(int I=0;I<Count;++I){State.Before[I]=V->Builds[I];State.BeforePressure[I]=V->PressureProfiles[I];State.BeforeBattery[I]=V->BatteryProfiles[I];State.BeforeFuel[I]=V->FuelProfiles[I];}
    for(int I=0;I<4;++I)State.OriginalWheels[I]=V->WheelState[I];
    if(auto* PC=Cast<APlayerController>(V->GetController()))if(auto* HUD=PC->GetHUD())State.OriginalHUD=HUD->bShowHUD;
    const bool Shape=Roster(V).Num()==ATerraVehicle::VehicleCount&&Count==9&&TerraSim::PartCount==13;
    Check(TEXT("electric and pressure suite covers nine legacy vehicles in the expanded roster and thirteen upgrade slots"),Shape,Roster(V).Num());
    if(!Shape){Restore(V);return true;}
    for(int I=0;I<Count;++I)if(int(Metadata(V,I,TEXT("electricMotors")))==4){State.FactoryQuad=I;break;}
    SaveChecks(V,Check);
  }
  if(State.Trial>=TrialCount){Restore(V);return true;}
  // Match the real pawn's bounded simulation step, not render stalls.
  State.Time+=FMath::Clamp(Dt,0.f,.1f);
  if(State.ParkPending){if(State.Time>1.1f)FinishRoadPark(V);return false;}
  if(V->Overturned||V->GetActorUpVector().Z<.15f)V->TestThrottle=0;
  if(State.Trial<AirBegin)Matrix(V,Check,Capture);
  else if(State.Trial<DriveBegin)Air(V,Check,Capture);
  else if(State.Trial<BrakeBegin)Drive(V,Check,Capture);
  else if(State.Trial<SteerBegin)Braking(V,Check,Capture);
  else if(State.Trial<SoilBegin)Steering(V,Check,Capture);
  else if(State.Trial<UIBegin)Soil(V,Check,Capture);
  else UpgradeUI(V,Check,Capture);
  return false;
}
}
