#include "TerraSixWheelValidation.h"
#include "TerraVehicle.h"
#include "TerraGarage.h"
#include "TerraGameMode.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/PlayerController.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Misc/FileHelper.h"
#include "HAL/FileManager.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/World.h"
namespace TerraSixWheelValidation {
namespace {
struct FState {TWeakObjectPtr<ATerraVehicle> Vehicle;int Phase=0,EVStage=1,Samples=0,Loaded[6]={},Driven[6]={};float Time=0,PeakSpeed=0,Error=0,CenterError=0,TandemError=0,Rotation[6]={},MudDepth[3]={};bool Finite=true,SquaredCaptured=false;FVector Start;FString Folder;} S;
void Stop(ATerraVehicle* V){V->TestThrottle=V->TestSteer=0;V->TestBrake=1;V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);}
bool Write(TSharedPtr<FJsonObject> R,const FString& P){FString T;return FJsonSerializer::Serialize(R.ToSharedRef(),TJsonWriterFactory<>::Create(&T))&&FFileHelper::SaveStringToFile(T,*P);}
void Saves(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check){
  V->SetGarage(true);
  for(int I=0;I<9;++I){V->Builds[I].Stage[TerraSim::Tires]=I%4;V->FuelProfiles[I]=.25f+I*.04f;V->BatteryProfiles[I]=.3f+I*.03f;}
  V->FuelFraction=V->FuelProfiles[V->VehicleIndex];V->BatterySOC=V->BatteryProfiles[V->VehicleIndex];
  const FString Current=S.Folder/TEXT("current.json"),Legacy=S.Folder/TEXT("legacy7.json");
  bool Saved=V->SaveGarage(Current);FString Text;TSharedPtr<FJsonObject> R;
  Saved&=FFileHelper::LoadFileToString(Text,*Current)&&FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),R)&&R.IsValid();
  Check(TEXT("v8 garage writes all ten native vehicle profiles"),Saved&&R->GetNumberField(TEXT("version"))==8&&R->GetArrayField(TEXT("builds")).Num()==10,10);
  if(!Saved)return;
  for(const TCHAR* K:{TEXT("builds"),TEXT("fuelLevels"),TEXT("batteryCharge"),TEXT("pressureTargets")}){auto A=R->GetArrayField(K);A.SetNum(9);R->SetArrayField(K,A);}
  R->SetNumberField(TEXT("version"),7);R->SetNumberField(TEXT("vehicle"),8);
  bool Migrated=Write(R,Legacy)&&V->LoadGarage(Legacy);
  for(int I=0;I<9;++I)Migrated&=V->Builds[I].Stage[TerraSim::Tires]==I%4&&FMath::Abs(V->FuelProfiles[I]-(.25f+I*.04f))<.00001f&&FMath::Abs(V->BatteryProfiles[I]-(.3f+I*.03f))<.00001f;
  Migrated&=V->Builds[9].Stage[TerraSim::Tires]==0&&V->FuelProfiles[9]==.75f&&V->BatteryProfiles[9]==.75f;
  Check(TEXT("v7 migration retains nine old builds fuel and batteries and defaults only the appended six wheeler"),Migrated,10);
  V->SelectVehicle(9);V->FuelFraction=.43f;V->SetEnergyUsageEnabled(false,false);
  Check(TEXT("new vehicle fuel and unlimited setting roundtrip"),V->SaveGarage(Current)&&V->LoadGarage(Current)&&V->FuelProfiles[9]==.43f&&!V->EnergyUsageEnabled,V->FuelProfiles[9]);
  V->SetEnergyUsageEnabled(true,false);V->SetGarage(true);V->ResetUpgrades(false);V->FuelFraction=.75f;
}
void Record(ATerraVehicle* V){
  ++S.Samples;S.PeakSpeed=FMath::Max(S.PeakSpeed,FMath::Abs(V->Speed));
  for(int I=0;I<6;++I){auto& W=V->WheelState[I];S.Loaded[I]+=W.ContactValid&&W.Load>100;S.Driven[I]+=FMath::Abs(V->LastWheelDriveNm[I])>1;S.Finite&=FMath::IsFinite(W.Omega)&&FMath::IsFinite(W.Load)&&!W.Center.ContainsNaN();S.Rotation[I]=FMath::Max(S.Rotation[I],FMath::Abs(W.Rotation));}
  for(int A=0;A<3;++A)if(V->AxleLocked(A))S.Error=FMath::Max(S.Error,FMath::Abs(V->WheelState[A*2].Omega-V->WheelState[A*2+1].Omega));
  const float Front=(V->WheelState[0].Omega+V->WheelState[1].Omega)*.5f,Middle=(V->WheelState[2].Omega+V->WheelState[3].Omega)*.5f,Rear=(V->WheelState[4].Omega+V->WheelState[5].Omega)*.5f;
  S.CenterError=FMath::Max(S.CenterError,FMath::Abs(Front-(Middle+Rear)*.5f));S.TandemError=FMath::Max(S.TandemError,FMath::Abs(Middle-Rear));
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
 if(S.Vehicle.Get()!=V){S=FState();S.Vehicle=V;FString Report;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);S.Folder=FPaths::GetPath(Report)/TEXT("SixWheelFixtures");IFileManager::Get().MakeDirectory(*S.Folder,true);Saves(V,Check);}
 S.Time+=FMath::Clamp(Dt,0.f,.1f);auto Next=[&](int P){S.Phase=P;S.Time=0;};
 if(S.Phase==0){
  V->SelectVehicle(9);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(1);Stop(V);Next(1);
 }else if(S.Phase==1&&S.Time>2){
  Check(TEXT("new G63 6x6 has six real wheel rim and brake assemblies"),V->WheelCount()==6&&V->AxleCount()==3&&V->Wheels.Num()==6&&V->Rims.Num()==6&&V->HubDetails.Num()==24, V->Wheels.Num());
  Check(TEXT("factory tandem geometry uses distinct 123 inch and 43 inch axle spans"),FMath::Abs(V->AxleOffsetM(0)-V->AxleOffsetM(1)-3.12f)<.02f&&FMath::Abs(V->AxleOffsetM(1)-V->AxleOffsetM(2)-1.10f)<.02f,V->AxleOffsetM(1)-V->AxleOffsetM(2));
  Check(TEXT("six wheel stock suspension supports at least five loaded contacts"),V->ContactCount>=5,V->ContactCount);
  Stop(V);V->LowRange=true;V->ToggleCenterLocker();V->ToggleLocker(false);V->ToggleLocker(true);
  Check(TEXT("three OEM control groups engage all five differential locks"),V->AxleLocked(0)&&V->AxleLocked(1)&&V->AxleLocked(2)&&V->CenterLockActive()&&V->TandemLockActive(),0);
  S.Start=V->GetActorLocation();V->TestBrake=0;V->TestThrottle=.20f;V->TestSteer=.25f;Next(2);
 }else if(S.Phase==2){
  if(S.Time>.15f)Record(V);
  if(S.Time>2){
   for(int I=0;I<6;++I){Check(FString::Printf(TEXT("tire %d contributes load rotation and actual drive torque"),I),S.Loaded[I]>=5&&S.Driven[I]>=5&&S.Rotation[I]>.1f,S.Loaded[I]);}
   Check(TEXT("six wheel dynamics accelerate without invalid contacts or transforms"),S.Finite&&S.Samples>=10&&S.PeakSpeed>1&&FVector::Dist2D(S.Start,V->GetActorLocation())>100,S.PeakSpeed);
   Check(TEXT("all three cross axle locks preserve equal wheel speed under steering load"),S.Error<.0001f,S.Error);
   Check(TEXT("both longitudinal locks synchronize all three axle shafts under real tire load"),S.CenterError<.02f&&S.TandemError<.02f,FMath::Max(S.CenterError,S.TandemError));
   auto* PC=Cast<APlayerController>(V->GetController());auto* HUD=PC?Cast<ATerraHUD>(PC->GetHUD()):nullptr;
   Check(TEXT("driving HUD presents all five fitted differential locks"),HUD&&HUD->VisibleStatusIds.Contains(TEXT("frontLock"))&&HUD->VisibleStatusIds.Contains(TEXT("centerLock"))&&HUD->VisibleStatusIds.Contains(TEXT("rearLock"))&&HUD->VisibleStatusIds.Contains(TEXT("rear2Lock"))&&HUD->VisibleStatusIds.Contains(TEXT("tandemLock")),HUD?HUD->VisibleStatusIds.Num():0);
   Capture(TEXT("sixwheel-locked-motion.png"));V->TestThrottle=V->TestSteer=0;V->TestBrake=1;Next(3);
  }
 }else if(S.Phase==3&&S.Time>2){
  Check(TEXT("six wheel service brakes stop and hold all three axles"),FMath::Abs(V->Speed)<.2f&&V->Chassis->GetPhysicsLinearVelocity().Size()<25,V->Chassis->GetPhysicsLinearVelocity().Size()*.01f);
  Stop(V);V->SetGarage(true);
  for(int Stage=1;Stage<=3;++Stage){V->SetUpgrade(TerraSim::EVSwap,Stage,false);Check(FString::Printf(TEXT("six wheel EV conversion %d retains six driven physical contacts"),Stage),V->IsElectric()&&V->WheelCount()==6&&V->DrivenWheel(4)&&V->DrivenWheel(5),V->WheelCount());}
  V->BatterySOC=.2f;Check(TEXT("six wheel EV recharge uses the installed battery"),V->ServiceEnergy(false)&&V->BatterySOC==1,V->BatterySOC);
  V->SetUpgrade(TerraSim::EVSwap,0,false);V->FuelFraction=.2f;Check(TEXT("six wheel gasoline refueling fills the correct tank"),V->ServiceEnergy(false)&&V->FuelFraction==1,V->FuelFraction);
  V->SelectVehicle(8);V->ResetUpgrades(false);Check(TEXT("existing G63 save slot is now the factory portal axle 4x4 squared"),V->VehicleName.Contains(TEXT("4x4"))&&V->WheelCount()==4&&V->TireDiameter()>35&&V->SpecValue(TEXT("clearance"))>.3f,V->TireDiameter());
  Next(4);
 }else if(S.Phase==4){
  if(!S.SquaredCaptured&&S.Time>.6f){Capture(TEXT("g63-squared-garage.png"));S.SquaredCaptured=true;}
  if(S.Time<=1.f)return false;
  V->SelectVehicle(9);V->SetGarage(false);V->TeleportZone(3);Stop(V);Next(5);
 }else if(S.Phase==5&&S.Time>2){
  Check(TEXT("six wheel chassis supports itself on deformable mud terrain"),V->ContactCount>=4&&V->GetActorUpVector().Z>.8f,V->ContactCount);
  V->TestBrake=0;V->TestThrottle=.35f;S.Start=V->GetActorLocation();Next(6);
 }else if(S.Phase==6){
  // The rolling support witness can be ahead of the fresh footprint. Read
  // the physically displaced soil at each tire's actual last worked point.
  for(int I=0;I<6;++I){const auto& W=V->WheelState[I];if(W.SoilConnected&&W.Load>100)
    S.MudDepth[I/2]=FMath::Max(S.MudDepth[I/2],V->Terrain->Sample(W.LastSoil).RutDepth);}
  if(S.Time>3){
   const float Travel=FVector::Dist2D(S.Start,V->GetActorLocation());
   UE_LOG(LogTemp,Display,TEXT("TERRA_SIX_MUD travelCM=%.3f axleDepthM=%.6f,%.6f,%.6f"),Travel,S.MudDepth[0],S.MudDepth[1],S.MudDepth[2]);
   Check(TEXT("all three axles leave measurable physical mud displacement while driving"),S.MudDepth[0]>.001f&&S.MudDepth[1]>.001f&&S.MudDepth[2]>.001f&&Travel>100,Travel);
   Capture(TEXT("sixwheel-mud-ruts.png"));Stop(V);Next(7);
  }
 }else if(S.Phase==7&&S.Time>.5f){
  Stop(V);V->SetGarage(true);V->SetUpgrade(TerraSim::EVSwap,S.EVStage,false);V->BatterySOC=.7f;V->FourDrive=true;V->SetGarage(false);V->TeleportZone(1);Stop(V);Next(8);
 }else if(S.Phase==8&&S.Time>2){
  const float SpawnError=FVector::Dist2D(V->GetActorLocation(),V->Terrain->Spawns[1]);
  Check(FString::Printf(TEXT("EV donor stage %d reaches the requested road spawn after garage close"),S.EVStage),V->Zone==1&&SpawnError<50,SpawnError);
  S.Samples=0;S.PeakSpeed=0;S.Finite=true;for(int I=0;I<6;++I)S.Loaded[I]=S.Driven[I]=0;
  S.Start=V->GetActorLocation();V->TestThrottle=.18f;V->TestSteer=.12f;V->TestBrake=0;Next(9);
 }else if(S.Phase==9){
  if(S.Time>.2f)Record(V);
  if(S.Time>1.5f){
   bool All=S.Finite&&S.Samples>=10&&S.PeakSpeed>.5f;
   for(int I=0;I<6;++I)All&=S.Driven[I]>=5&&S.Loaded[I]>=5;
   Check(FString::Printf(TEXT("EV donor stage %d accelerates on all six loaded driven tires using actual motor force"),S.EVStage),All,S.PeakSpeed);
   Capture(*FString::Printf(TEXT("sixwheel-ev-drive-%d.png"),S.EVStage));V->TestThrottle=V->TestSteer=0;V->TestBrake=1;Next(10);
  }
 }else if(S.Phase==10&&S.Time>2){
  Check(FString::Printf(TEXT("EV donor stage %d brakes the actual moving six wheel chassis"),S.EVStage),FMath::Abs(V->Speed)<.2f&&V->Chassis->GetPhysicsLinearVelocity().Size()<25,V->Chassis->GetPhysicsLinearVelocity().Size()*.01f);
  if(++S.EVStage<=3)Next(7);else return true;
 }
 return false;
}
}
