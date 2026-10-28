#include "TerraVehicle.h"
#include "TerraGarage.h"
#include "TerraUnits.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/RectLightComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

FString ATerraVehicle::GaragePath() const { FString Path=FPaths::ProjectSavedDir()/TEXT("garage-builds.json");FParse::Value(FCommandLine::Get(),TEXT("TerraGarage="),Path);return Path; }
void ATerraVehicle::OrbitGarageCamera(float YawDelta,float PitchDelta){
  if(!Garage)return;
  GarageYaw=FMath::UnwindDegrees(GarageYaw+YawDelta);
  GaragePitch=FMath::Clamp(GaragePitch+PitchDelta,-52.f,12.f);
}
void ATerraVehicle::ZoomGarageCamera(float Steps){
  if(Garage)GarageDistance=FMath::Clamp(GarageDistance*FMath::Pow(.88f,Steps),Number(TEXT("length"),4.8f)*85,1800.f);
}
void ATerraVehicle::SetGarageView(int View){
  GarageYaw=View==1?180:View==2?90:View==3?0:145;
  GaragePitch=View==0?-12:-8;
  if(View==0)GarageDistance=FMath::Clamp(Number(TEXT("length"),4.8f)*215,950.f,1450.f);
}
bool ATerraVehicle::SaveGarage(const FString &Path) const {
  auto Root=MakeShared<FJsonObject>(); Root->SetNumberField(TEXT("version"),4);
  Root->SetNumberField(TEXT("vehicle"),VehicleIndex);
  TArray<TSharedPtr<FJsonValue>> Cars;
  for(const auto &Build:Builds){
    TArray<TSharedPtr<FJsonValue>> Stages;
    for(int S:Build.Stage)Stages.Add(MakeShared<FJsonValueNumber>(S));
    Cars.Add(MakeShared<FJsonValueArray>(Stages));
  }
  Root->SetArrayField(TEXT("builds"),Cars);
  TArray<TSharedPtr<FJsonValue>> Air,Charge;
  for(int I=0;I<VehicleCount;++I){Air.Add(MakeShared<FJsonValueNumber>(I==VehicleIndex?PressureTarget:PressureProfiles[I]));Charge.Add(MakeShared<FJsonValueNumber>(I==VehicleIndex?BatterySOC:BatteryProfiles[I]));}
  Root->SetArrayField(TEXT("pressureTargets"),Air);Root->SetArrayField(TEXT("batteryCharge"),Charge);
  FString Text; auto Writer=TJsonWriterFactory<>::Create(&Text);
  if(!FJsonSerializer::Serialize(Root,Writer))return false;
  IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path),true);
  const FString Temp=Path+TEXT(".tmp");
  return FFileHelper::SaveStringToFile(Text,*Temp)&&IFileManager::Get().Move(*Path,*Temp,true,true);
}
bool ATerraVehicle::LoadGarage(const FString &Path) {
  FString Text;TSharedPtr<FJsonObject> Root;
  if(!FFileHelper::LoadFileToString(Text,*Path)||
      !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Root)||!Root.IsValid())return false;
  double Version=0,Selected=0;
  const TArray<TSharedPtr<FJsonValue>> *Cars=nullptr;
  if(!Root->TryGetNumberField(TEXT("version"),Version)||(Version!=1&&Version!=2&&Version!=3&&Version!=4)||
      !Root->TryGetArrayField(TEXT("builds"),Cars)||Cars->Num()!=(Version==1?5:Version<4?6:VehicleCount))return false;
  TerraSim::UpgradeSetup Loaded[VehicleCount];
  for(int I=0;I<Cars->Num();++I){
    const TArray<TSharedPtr<FJsonValue>> *Stages=nullptr;
    if(!(*Cars)[I].IsValid()||!(*Cars)[I]->TryGetArray(Stages)||Stages->Num()!=TerraSim::UpgradeStageCountForVersion(int(Version)))return false;
    double Values[TerraSim::PartCount]={};
    for(int P=0;P<Stages->Num();++P)if(!(*Stages)[P].IsValid()||!(*Stages)[P]->TryGetNumber(Values[P]))return false;
    if(!TerraSim::DecodeUpgradeStages(Values,Stages->Num(),int(Version),I!=2||(Version==4&&Values[TerraSim::EVSwap]>0),Loaded[I]))return false;
  }
  if(Root->HasField(TEXT("vehicle"))&&(!Root->TryGetNumberField(TEXT("vehicle"),Selected)||!FMath::IsFinite(Selected)||Selected<0||Selected>=Cars->Num()||std::floor(Selected)!=Selected))return false;
  float Air[VehicleCount]={},Charge[VehicleCount];for(float &C:Charge)C=.75f;
  if(Version==4){
    for(int Field=0;Field<2;++Field){const TCHAR *Key=Field?TEXT("batteryCharge"):TEXT("pressureTargets");
      if(!Root->HasField(Key))continue;
      const TArray<TSharedPtr<FJsonValue>> *Values=nullptr;
      if(!Root->TryGetArrayField(Key,Values)||Values->Num()!=VehicleCount)return false;
      for(int I=0;I<VehicleCount;++I){double N;
        if(!(*Values)[I].IsValid()||!(*Values)[I]->TryGetNumber(N)||!FMath::IsFinite(N)||N<0||N>(Field?1:65)||(Field==0&&N>0&&N<8))return false;
        (Field?Charge[I]:Air[I])=N;
      }
    }
  }
  for(int I=0;I<VehicleCount;++I){Builds[I]=Loaded[I];PressureProfiles[I]=Air[I];BatteryProfiles[I]=Charge[I];}
  LastVehicle=int(Selected);
  return true;
}
TerraSim::DriveCapabilities ATerraVehicle::DriveCapabilities() const {
  TerraSim::FactoryDrivetrain Factory;
  if(Spec.IsValid()){
    const auto& Modes=Spec->GetArrayField(TEXT("driveModes"));
    for(const auto& Value:Modes){const FString Mode=Value->AsString();Factory.FourDrive|=Mode.Contains(TEXT("4"))||Mode.Contains(TEXT("AWD"));}
    Factory.Permanent=Factory.FourDrive&&Modes.Num()==1;
    Factory.FrontPrimary=Spec->GetStringField(TEXT("defaultMode"))==TEXT("FWD");
    Factory.LowRatio=Number(TEXT("lowRatio"),1);
    const auto Features=Spec->GetObjectField(TEXT("features"));
    Factory.FrontLocker=Features->GetBoolField(TEXT("frontLocker"));Factory.RearLocker=Features->GetBoolField(TEXT("rearLocker"));
  }
  auto C=TerraSim::ResolveDriveCapabilities(Builds[VehicleIndex],Factory);
  const auto Layout=ElectricLayout();
  if(Layout==TerraSim::MotorLayout::Single){C.FrontPrimary=false;C.Permanent=false;}
  if(TerraSim::ElectricAllWheelDrive(Layout)){C.FourDrive=true;C.Permanent=true;C.FrontPrimary=false;}
  // Independent motors use wheel torque control; a selectable virtual lock is
  // a control mode, never a rigid shaft constraint between their wheel speeds.

  return C;
}
FString ATerraVehicle::DriveDescription() const {
  const auto C=DriveCapabilities();
  if(LowRange&&HasLowRange())return FString::Printf(TEXT("4L %.2f:1"),C.LowRatio);
  if(C.Permanent)return TEXT("AWD HIGH");
  if(FourDrive&&C.FourDrive)return TEXT("4H");
  return C.FrontPrimary?TEXT("FWD"):TEXT("RWD");
}
void ATerraVehicle::ApplyUpgrades(){
  if(!Spec.IsValid())return;
  Builds[VehicleIndex].Sanitize(HasElectrical());
  Tuning=TerraSim::Tune(Builds[VehicleIndex],IsElectric(),HasElectrical());
  EngineUpgrade=Builds[VehicleIndex].Stage[TerraSim::Engine];
  LiftUpgrade=Builds[VehicleIndex].Stage[TerraSim::Suspension];
  const auto Capabilities=DriveCapabilities();
  Mass=(Number(TEXT("mass"),2100)+ElectricConfig().NetMassKg)*Tuning.Mass+Tuning.HardwareMass+Capabilities.HardwareMass+TerraSim::ResolveTireAirHardware(UpgradeStage(TerraSim::TireAir)).MassKg;
  if(!Capabilities.FourDrive)FourDrive=false;
  if(Capabilities.Permanent)FourDrive=true;
  if(!HasLowRange())LowRange=false;
  if(!Capabilities.FrontLocker||!DrivenWheel(0))FrontLocked=false;
  if(!Capabilities.RearLocker||!DrivenWheel(2))RearLocked=false;
  Radius=Number(TEXT("tireRadius"),.42f)*Tuning.TireRadius;
  Width=Number(TEXT("tireWidth"),.285f)*Tuning.TireWidth;
  Track=Number(TEXT("track"),1.63f)+Tuning.Track;
  CG=Number(TEXT("cgHeight"),.76f);
  const auto S=Spec->GetObjectField(TEXT("suspension"));
  Spring=S->GetNumberField(TEXT("springRate"))*Tuning.Spring;
  Damping=S->GetNumberField(TEXT("damping"))*Tuning.Damping;
  Rest=S->GetNumberField(TEXT("restLength"));
  Droop=.16f+Tuning.Travel;
  TireVisualScale=Tuning.TireRadius;WidthVisualScale=Tuning.TireWidth;
  Chassis->SetMassOverrideInKg(NAME_None,Mass+(Tracks?380:0));
  Chassis->SetAngularDamping(.6f*Tuning.Stability);
  Chassis->SetCenterOfMass(FVector(0,0,-2.f*Builds[VehicleIndex].Stage[TerraSim::Frame]));
  if(!Tracks){
    const int Stage=UpgradeStage(TerraSim::Tires);
    const FString Name=Spec->GetStringField(TEXT("asset"))+TEXT("_tire")+(Stage?FString::Printf(TEXT("_%d"),Stage):TEXT(""));
    auto *Mesh=LoadObject<UStaticMesh>(nullptr,*(TEXT("/Game/Meshes/")+Name));
    for(auto W:Wheels)W->SetStaticMesh(Mesh);
  }
  for(int I=0;I<Wheels.Num();++I){
    const float AxleWidth=I>=2?Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))/Number(TEXT("tireWidth"),.285f):1.f;
    Wheels[I]->SetRelativeScale3D(Tracks?FVector::OneVector:FVector(TireVisualScale,WidthVisualScale*AxleWidth,TireVisualScale));
  }
  if(Garage){
    const FVector P=GetActorLocation();
    const float Raised=Tuning.Lift+(Radius-Number(TEXT("tireRadius"),.42f));
    const float Floor=RouteIndex>=0?Terrain->Routes[RouteIndex].Spawn.Z:Terrain->Spawns[Zone].Z;
    SetActorLocation(FVector(P.X,P.Y,Floor+(CG+Raised)*100),false,nullptr,ETeleportType::TeleportPhysics);
    for(int I=0;I<4;++I){
      const FVector Local(Wheelbase*(I<2?1-FrontWeight:-FrontWeight)*100,(I%2?1:-1)*Track*50,(Radius-CG-Raised)*100);
      Wheels[I]->SetWorldLocationAndRotation(GetActorTransform().TransformPosition(Local),GetActorQuat());
    }
  }
  UpdateVisualDetails();
}
void ATerraVehicle::SetUpgrade(int Part,int Stage,bool Persist){
  if(Part<0||Part>=TerraSim::PartCount||(!Garage&&!AutoTest))return;
  if(Part==TerraSim::Electrical&&!HasElectrical())return;
  Builds[VehicleIndex].Stage[Part]=FMath::Clamp(Stage,0,3);
  if(Part==TerraSim::Drivetrain&&Stage>0)FourDrive=HasFourDrive();
  if(Part==TerraSim::EVSwap){FourDrive=Stage!=1;BatterySOC=.75f;BatteryProfiles[VehicleIndex]=BatterySOC;}
  ApplyUpgrades();
  if(Persist&&!AutoTest&&!SaveGarage(GaragePath()))Notice=TEXT("Could not save garage setup");
}
void ATerraVehicle::ResetUpgrades(bool Persist){
  Builds[VehicleIndex]=TerraSim::UpgradeSetup();
  ApplyUpgrades();
  if(Persist&&!AutoTest)SaveGarage(GaragePath());
}
void ATerraVehicle::SetGarage(bool Open){
  if(Open==Garage)return;
  if(Open&&FMath::Abs(Speed)>.5f&&!AutoTest){Notice=TEXT("Stop the vehicle to open your garage");return;}
  auto *PC=Cast<APlayerController>(GetController());
  if(!PC||!GEngine||!GEngine->GameViewport)return;
  Garage=Open;
  Throttle=Steer=0;Brake=1;Reeling=false;
  Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  Chassis->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);
  if(Open){
    SetGarageView(0);
    if(RouteIndex>=0)TeleportRoute(RouteIndex);else TeleportZone(Zone);
    Chassis->SetSimulatePhysics(false);
    ApplyUpgrades();
    GarageWidget=SNew(STerraGarage).Vehicle(this);
    GEngine->GameViewport->AddViewportWidgetContent(GarageWidget.ToSharedRef(),20);
    PC->bShowMouseCursor=true;
    FInputModeGameAndUI Mode;Mode.SetWidgetToFocus(GarageWidget).SetHideCursorDuringCapture(false).SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
    PC->SetInputMode(Mode);
    FSlateApplication::Get().SetKeyboardFocus(GarageWidget);
  }else{
    if(GarageWidget.IsValid())GEngine->GameViewport->RemoveViewportWidgetContent(GarageWidget.ToSharedRef());
    GarageWidget.Reset();
    Chassis->SetSimulatePhysics(true);
    ConfigureCoachworkCollision();
    Chassis->SetMassOverrideInKg(NAME_None,Mass+(Tracks?380:0));
    Chassis->SetCenterOfMass(FVector(0,0,-2.f*UpgradeStage(TerraSim::Frame)));
    SpawnCooldown=.7f;
    PC->bShowMouseCursor=false;PC->SetInputMode(FInputModeGameOnly());
    FSlateApplication::Get().SetAllUserFocusToGameViewport();
    if(!AutoTest)SaveGarage(GaragePath());
  }
  for(auto Light:GarageLights)Light->SetVisibility(Garage);
}
FString ATerraVehicle::UpgradeName(int Part) const{
  const TCHAR *Names[]={TEXT("SUSPENSION"),TEXT("ENGINE POWER"),TEXT("TIRES"),TEXT("WHEELS"),TEXT("FRAME"),TEXT("BODY"),TEXT("ELECTRICAL"),TEXT("DRIVETRAIN"),TEXT("DIFFERENTIALS"),TEXT("PORTAL AXLES"),TEXT("EV CONVERSION"),TEXT("TIRE AIR CONTROL")};
  return Part==TerraSim::Engine&&IsElectric()?TEXT("MOTOR POWER"):Names[Part];
}
FString ATerraVehicle::UpgradeDescription(int Part) const{
  const TCHAR *Descriptions[]={TEXT("Longer articulation, controlled damping and added clearance."),
    TEXT("Stronger torque delivery at every engine speed."),
    TEXT("Larger, wider tires with a higher traction limit."),
    TEXT("Lighter rotating assembly and a wider stance."),
    TEXT("Reinforcement, lower center of mass and impact resistance."),
    TEXT("Lighter panels, skid protection and reduced drag."),
    TEXT("Sealed auxiliary power, stronger winch and deeper-water operation."),
    TEXT("Add missing four-wheel high drive, then low range and reinforced crawler gearing. Factory equipment is retained."),
    TEXT("Add a locker on the main drive axle, then both axles; stage III adds limited-slip preload when unlocked. Z rear / U front; stop to engage."),
    TEXT("Wheel-end reduction raises the axle shafts and body. More clearance and torque trade road speed, weight and rotating response."),
    TEXT("Original game conversion kits: single rear motor with optional transfer 4WD, dual axle motors, or four independent wheel motors. Includes battery and donor hardware mass changes."),
    TEXT("Onboard inflation and deflation while moving. Higher stages improve air flow and operating speed. Lower PSI helps soft ground but adds squirm and hurts road braking.")};
  if(Part==TerraSim::Electrical)return !HasElectrical()?TEXT("Not fitted to this vehicle."):IsElectric()?TEXT("Battery/inverter output, sealing and auxiliary power."):Descriptions[Part];
  return Descriptions[Part];
}
FString ATerraVehicle::UpgradeStageName(int Part,int Stage) const {
  if(Stage==0)return TEXT("STOCK");
  if(Part==TerraSim::EVSwap)return Stage==1?TEXT("SINGLE"):Stage==2?TEXT("DUAL"):TEXT("QUAD");
  if(Part==TerraSim::TireAir)return Stage==1?TEXT("BASIC"):Stage==2?TEXT("CTIS"):TEXT("FAST");
  if(Part==TerraSim::Drivetrain)return Stage==1?TEXT("4H"):Stage==2?TEXT("4L"):TEXT("CRAWL");
  if(Part==TerraSim::Differentials)return Stage==1?TEXT("MAIN"):Stage==2?TEXT("BOTH"):TEXT("LSD+");
  if(Part==TerraSim::Portals)return FString::Printf(TEXT("+%.1f\""),TerraUnits::Inches(Stage==1?.08f:Stage==2?.13f:.18f));
  return Stage==1?TEXT("I"):Stage==2?TEXT("II"):TEXT("III");
}
FString ATerraVehicle::UpgradeEffect(int Part) const{
  const int S=UpgradeStage(Part);
  switch(Part){
  case TerraSim::Suspension:return FString::Printf(TEXT("+%.1f in travel  /  +%.1f in spring lift  /  +%.0f%% damping"),TerraUnits::Inches(Tuning.Travel),TerraUnits::Inches(Tuning.Lift-Tuning.PortalLift),(Tuning.Damping-1)*100);
  case TerraSim::Engine:return FString::Printf(TEXT("+%.0f%% output  /  %.0f hp total"),(Tuning.Power-1)*100,PowerHP());
  case TerraSim::Tires:return FString::Printf(TEXT("%.1f in diameter  /  %.1f in width  /  +%.0f%% grip"),TireDiameter(),TerraUnits::Inches(Width),(Tuning.Grip-1)*100);
  case TerraSim::Wheels:return FString::Printf(TEXT("%.0f%% less rotational inertia  /  +%.1f in track"),(1-Tuning.WheelInertia)*100,TerraUnits::Inches(Tuning.Track));
  case TerraSim::Frame:return FString::Printf(TEXT("+%.0f%% chassis damping  /  %.0f%% less combined impact damage"),(Tuning.Stability-1)*100,(1-Tuning.Damage)*100);
  case TerraSim::Body:return FString::Printf(TEXT("%.0f lb total  /  %.0f%% less drag  /  armor stage %d"),TerraUnits::Pounds(Mass),(1-Tuning.Drag)*100,S);
  case TerraSim::Electrical:return !HasElectrical()?TEXT("NOT AVAILABLE"):FString::Printf(TEXT("+%.0f%% winch  /  %.1f in water margin%s"),(Tuning.Winch-1)*100,TerraUnits::Inches(Tuning.WaterDepth),IsElectric()?*FString::Printf(TEXT("  /  +%.0f%% EV output"),(Tuning.ElectricalPower-1)*100):TEXT(""));
  case TerraSim::Drivetrain:return FString::Printf(TEXT("%s  /  %s  /  %.0f lb drivetrain + locker hardware"),HasFourDrive()?TEXT("4H equipped"):TEXT("Two-wheel drive"),HasLowRange()?*FString::Printf(TEXT("%.2f:1 selectable low"),DriveCapabilities().LowRatio):TEXT("High range only"),TerraUnits::Pounds(DriveCapabilities().HardwareMass));
  case TerraSim::EVSwap:{const auto C=ElectricConfig();return C.Layout==TerraSim::MotorLayout::None?TEXT("Factory combustion drivetrain"):FString::Printf(TEXT("%d motors / %.0f hp / %.0f kWh / %+.0f lb conversion mass"),TerraSim::ElectricMotorCount(C.Layout),PowerHP(),C.BatteryKWh,TerraUnits::Pounds(C.NetMassKg));}
  case TerraSim::TireAir:{const auto H=TerraSim::ResolveTireAirHardware(S);return S?FString::Printf(TEXT("%.2f PSI/s inflate / %.2f deflate / up to %.0f mph / +%.0f lb"),H.InflatePSIPerSecond,H.DeflatePSIPerSecond,TerraUnits::MPH(H.MaximumSpeedMPS),TerraUnits::Pounds(H.MassKg)):TEXT("Stopped manual bleed / garage inflation");}
  case TerraSim::Differentials:return FString::Printf(TEXT("Front: %s  /  Rear: %s%s"),IndependentWheel(0)?TEXT("motor torque control"):HasLocker(true)?TEXT("selectable locker"):TEXT("open"),IndependentWheel(2)?TEXT("motor torque control"):HasLocker(false)?TEXT("selectable locker"):TEXT("open"),S==3?TEXT("  /  3:1 limited-slip preload"):TEXT(""));
  case TerraSim::Portals:return FString::Printf(TEXT("+%.1f in clearance  /  %.2f:1 reduction  /  +%.0f lb  /  %.0f%% gearing speed"),TerraUnits::Inches(PortalLift()),PortalReduction(),TerraUnits::Pounds(Tuning.HardwareMass),100/PortalReduction());
  }
  return FString();
}
float ATerraVehicle::ImpactDamage(float Impulse) const { return Impulse/(Mass*100*95)*Tuning.Damage; }
