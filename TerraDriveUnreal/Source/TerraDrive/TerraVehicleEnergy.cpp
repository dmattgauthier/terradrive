#include "TerraVehicle.h"
#include "Components/BoxComponent.h"

float ATerraVehicle::FuelCapacityGallons()const{
  // Gameplay tanks for the nine chassis, including optional gasoline donors.
  // These remain estimates; no certified fuel-economy figures are implied.
  static constexpr float Gallons[]={21.5f,20.8f,12.4f,24.5f,26.f,22.5f,60.f,26.f,26.f,42.f};
  return Gallons[FMath::Clamp(VehicleIndex,0,VehicleCount-1)];
}
FString ATerraVehicle::EnergyDescription()const{
  const FString Level=IsElectric()?FString::Printf(TEXT("Battery %.0f%% / %.0f kWh"),BatterySOC*100,ElectricConfig().BatteryKWh):
    FString::Printf(TEXT("Fuel %.1f / %.1f US gal"),FuelFraction*FuelCapacityGallons(),FuelCapacityGallons());
  return Level+(EnergyUsageEnabled?TEXT(" / usage on"):TEXT(" / UNLIMITED"));
}
bool ATerraVehicle::CanServiceEnergy()const{
  return TerraSim::EnergyServiceAllowed(Garage,PauseMenuOpen,Chassis->GetPhysicsLinearVelocity().Size()/100,
    Chassis->GetPhysicsAngularVelocityInRadians().Size(),Overturned);
}
bool ATerraVehicle::ServiceEnergy(bool Persist){
  if(!Spec.IsValid()||!CanServiceEnergy()){
    Notice=TEXT("Stop upright, then use Charge / Refuel in the garage or pause menu");return false;
  }
  if(IsElectric()){BatterySOC=1;BatteryProfiles[VehicleIndex]=1;}
  else{FuelFraction=1;FuelProfiles[VehicleIndex]=1;}
  BatteryEnergyRemainder=FuelEnergyRemainder=0;
  Notice=IsElectric()?TEXT("Battery fully charged"):TEXT("Fuel tank filled");
  if(Persist&&!AutoTest&&!SaveGarage(GaragePath()))Notice=TEXT("Energy restored; could not save garage");
  return true;
}
void ATerraVehicle::SetEnergyUsageEnabled(bool Enabled,bool Persist){
  const bool Before=EnergyUsageEnabled;EnergyUsageEnabled=Enabled;
  if(Persist&&!AutoTest&&!SaveGarage(GaragePath())){
    EnergyUsageEnabled=Before;Notice=TEXT("Could not save energy setting; previous setting kept");return;
  }
  Notice=Enabled?TEXT("Fuel and charge usage enabled"):TEXT("Unlimited fuel and charge enabled");
}
void ATerraVehicle::UpdateEnergy(float Dt){
  if(!Spec.IsValid()||Garage||PauseMenuOpen)return;
  if(IsElectric()){
    LastFuelGPH=0;
    if(EnergyUsageEnabled){
      const double Next=TerraSim::AdvanceBattery(double(BatterySOC)+BatteryEnergyRemainder,Dt,ElectricConfig().BatteryKWh,LastElectricDrawW,LastRegenPowerW,true);
      BatterySOC=float(Next);BatteryEnergyRemainder=Next-BatterySOC;
    }
  }else{
    LastElectricDrawW=LastRegenPowerW=0;
    float WheelPower=0;
    for(int I=0;I<WheelCount();++I)WheelPower+=FMath::Max(0.f,(LastWheelDriveNm[I]-WheelShaftCouplingNm(I))*WheelState[I].Omega);
    LastFuelGPH=TerraSim::FuelUseGallonsPerHour(WheelPower,.28f,.18f+PowerHP()*.00065f,HasPropulsionEnergy());
    if(EnergyUsageEnabled){
      const double Next=TerraSim::AdvanceFuel(double(FuelFraction)+FuelEnergyRemainder,Dt,FuelCapacityGallons(),LastFuelGPH,true);
      FuelFraction=float(Next);FuelEnergyRemainder=Next-FuelFraction;
    }
    if(!HasPropulsionEnergy())RPM=0;
  }
  // No per-frame disk writes. Persist through vehicle changes, service, clean
  // exit and a bounded 30-second checkpoint while actively consuming energy.
  if(!AutoTest&&EnergyUsageEnabled){
    EnergySaveTimer+=Dt;
    if(EnergySaveTimer>=30){EnergySaveTimer=0;SaveGarage(GaragePath());}
  }
}
