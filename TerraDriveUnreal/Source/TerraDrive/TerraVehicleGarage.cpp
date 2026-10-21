#include "TerraVehicle.h"
#include "TerraGarage.h"
#include "TerraUnits.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

FString ATerraVehicle::GaragePath() const { return FPaths::ProjectSavedDir()/TEXT("garage-builds.json"); }
bool ATerraVehicle::SaveGarage(const FString &Path) const {
  auto Root=MakeShared<FJsonObject>(); Root->SetNumberField(TEXT("version"),1);
  Root->SetNumberField(TEXT("vehicle"),VehicleIndex);
  TArray<TSharedPtr<FJsonValue>> Cars;
  for(const auto &Build:Builds){
    TArray<TSharedPtr<FJsonValue>> Stages;
    for(int S:Build.Stage)Stages.Add(MakeShared<FJsonValueNumber>(S));
    Cars.Add(MakeShared<FJsonValueArray>(Stages));
  }
  Root->SetArrayField(TEXT("builds"),Cars);
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
  if(!Root->TryGetNumberField(TEXT("version"),Version)||Version!=1||
      !Root->TryGetArrayField(TEXT("builds"),Cars)||Cars->Num()!=5)return false;
  TerraSim::UpgradeSetup Loaded[5];
  for(int I=0;I<5;++I){
    const TArray<TSharedPtr<FJsonValue>> *Stages=nullptr;
    if(!(*Cars)[I]->TryGetArray(Stages)||Stages->Num()!=TerraSim::PartCount)return false;
    for(int P=0;P<TerraSim::PartCount;++P){
      double S=0;if(!(*Stages)[P]->TryGetNumber(S)||!FMath::IsFinite(S))return false;
      Loaded[I].Stage[P]=int(FMath::Clamp(S,0.,3.));
    }
    Loaded[I].Sanitize(I!=2);
  }
  for(int I=0;I<5;++I)Builds[I]=Loaded[I];
  Root->TryGetNumberField(TEXT("vehicle"),Selected);
  LastVehicle=FMath::IsFinite(Selected)?int(FMath::Clamp(Selected,0.,4.)):0;
  return true;
}
void ATerraVehicle::ApplyUpgrades(){
  if(!Spec.IsValid())return;
  Builds[VehicleIndex].Sanitize(HasElectrical());
  Tuning=TerraSim::Tune(Builds[VehicleIndex],VehicleIndex==4,HasElectrical());
  EngineUpgrade=Builds[VehicleIndex].Stage[TerraSim::Engine];
  LiftUpgrade=Builds[VehicleIndex].Stage[TerraSim::Suspension];
  Mass=Number(TEXT("mass"),2100)*Tuning.Mass;
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
  for(auto W:Wheels)W->SetRelativeScale3D(Tracks?FVector::OneVector:FVector(TireVisualScale,WidthVisualScale,TireVisualScale));
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
    Chassis->SetMassOverrideInKg(NAME_None,Mass+(Tracks?380:0));
    SpawnCooldown=.7f;
    PC->bShowMouseCursor=false;PC->SetInputMode(FInputModeGameOnly());
    FSlateApplication::Get().SetAllUserFocusToGameViewport();
    if(!AutoTest)SaveGarage(GaragePath());
  }
}
FString ATerraVehicle::UpgradeName(int Part) const{
  const TCHAR *Names[]={TEXT("SUSPENSION"),TEXT("ENGINE POWER"),TEXT("TIRES"),TEXT("WHEELS"),TEXT("FRAME"),TEXT("BODY"),TEXT("ELECTRICAL")};
  return Part==TerraSim::Engine&&VehicleIndex==4?TEXT("MOTOR POWER"):Names[Part];
}
FString ATerraVehicle::UpgradeDescription(int Part) const{
  const TCHAR *Descriptions[]={TEXT("Longer articulation, controlled damping and added clearance."),
    TEXT("Stronger torque delivery at every engine speed."),
    TEXT("Larger, wider tires with a higher traction limit."),
    TEXT("Lighter rotating assembly and a wider stance."),
    TEXT("Reinforcement, lower center of mass and impact resistance."),
    TEXT("Lighter panels, skid protection and reduced drag."),
    TEXT("Sealed auxiliary power, stronger winch and deeper-water operation.")};
  if(Part==TerraSim::Electrical)return !HasElectrical()?TEXT("Not fitted to this vehicle."):VehicleIndex==4?TEXT("Battery/inverter output, sealing and auxiliary power."):Descriptions[Part];
  return Descriptions[Part];
}
FString ATerraVehicle::UpgradeEffect(int Part) const{
  const int S=UpgradeStage(Part);
  switch(Part){
  case TerraSim::Suspension:return FString::Printf(TEXT("+%.1f in travel  /  +%.1f in lift  /  +%.0f%% damping"),TerraUnits::Inches(Tuning.Travel),TerraUnits::Inches(Tuning.Lift),(Tuning.Damping-1)*100);
  case TerraSim::Engine:return FString::Printf(TEXT("+%.0f%% output  /  %.0f hp total"),(Tuning.Power-1)*100,PowerHP());
  case TerraSim::Tires:return FString::Printf(TEXT("%.1f in diameter  /  %.1f in width  /  +%.0f%% grip"),TireDiameter(),TerraUnits::Inches(Width),(Tuning.Grip-1)*100);
  case TerraSim::Wheels:return FString::Printf(TEXT("%.0f%% less rotational inertia  /  +%.1f in track"),(1-Tuning.WheelInertia)*100,TerraUnits::Inches(Tuning.Track));
  case TerraSim::Frame:return FString::Printf(TEXT("+%.0f%% chassis damping  /  %.0f%% less combined impact damage"),(Tuning.Stability-1)*100,(1-Tuning.Damage)*100);
  case TerraSim::Body:return FString::Printf(TEXT("%.0f lb total  /  %.0f%% less drag  /  armor stage %d"),TerraUnits::Pounds(Mass),(1-Tuning.Drag)*100,S);
  case TerraSim::Electrical:return !HasElectrical()?TEXT("NOT AVAILABLE"):FString::Printf(TEXT("+%.0f%% winch  /  %.1f in water margin%s"),(Tuning.Winch-1)*100,TerraUnits::Inches(Tuning.WaterDepth),VehicleIndex==4?*FString::Printf(TEXT("  /  +%.0f%% EV output"),(Tuning.ElectricalPower-1)*100):TEXT(""));
  }
  return FString();
}
float ATerraVehicle::ImpactDamage(float Impulse) const { return Impulse/(Mass*100*95)*Tuning.Damage; }
