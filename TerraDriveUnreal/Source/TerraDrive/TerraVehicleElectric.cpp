#include "TerraVehicle.h"
#include "TerraUnits.h"
#include "Components/BoxComponent.h"

int ATerraVehicle::FactoryMotorCount() const {return int(Number(TEXT("electricMotors"),VehicleIndex==4?3:0));}
TerraSim::MotorLayout ATerraVehicle::ElectricLayout() const {return TerraSim::ResolveMotorLayout(UpgradeStage(TerraSim::EVSwap),FactoryMotorCount());}
bool ATerraVehicle::IsElectric() const {return ElectricLayout()!=TerraSim::MotorLayout::None;}
bool ATerraVehicle::IsFactoryElectric() const {return FactoryMotorCount()>0;}
bool ATerraVehicle::IsICEConversion() const {return IsFactoryElectric()&&UpgradeStage(TerraSim::EVSwap)>0;}
TerraSim::CombustionConfiguration ATerraVehicle::CombustionConfig() const {
  return TerraSim::MakeCombustionSwap(UpgradeStage(TerraSim::EVSwap),FactoryMotorCount(),
    Number(TEXT("batteryKWh"),VehicleIndex==4?170.f:116.f),Number(TEXT("electricHardwareMassKg"),0));
}
bool ATerraVehicle::IndependentWheel(int Index) const {return TerraSim::IndependentElectricWheel(ElectricLayout(),Index);}
bool ATerraVehicle::DrivenWheel(int Index) const {
  if(Index<0||Index>=WheelCount())return false;
  const auto Layout=ElectricLayout();
  if(TerraSim::ElectricAllWheelDrive(Layout))return true;
  return TerraSim::DrivenAxle(DriveCapabilities(),FourDrive,Index<2);
}
TerraSim::ElectricConfiguration ATerraVehicle::ElectricConfig() const {
  const int Stage=UpgradeStage(TerraSim::EVSwap),Factory=FactoryMotorCount();
  const float StockMass=Number(TEXT("mass"),2100),StockPower=Number(TEXT("powerHP"),285)*745.7f;
  if(Factory>0&&Stage>0)return {}; // Factory EV conversion stages are gasoline kits.
  auto C=Stage?TerraSim::MakeElectricSwap(Stage,StockPower,StockMass):
    TerraSim::FactoryElectricConfig(Factory,StockPower,Number(TEXT("wheelTorqueNm"),Number(TEXT("torqueNm"),350)*Number(TEXT("electricReduction"),9.f)*.95f),
      Number(TEXT("electricReduction"),9.f),Number(TEXT("motorMaxRPM"),16000));
  if(C.Layout==TerraSim::MotorLayout::None)return C;
  if(!Stage){C.BatteryKWh=Number(TEXT("batteryKWh"),VehicleIndex==4?170.f:116.f);C.BatteryMassKg=C.BatteryKWh/.185f;}
  C.FrontShare=Number(TEXT("frontTorqueFraction"),C.Layout==TerraSim::MotorLayout::Triple?1.f/3.f:.5f);
  if(Stage)C.FrontShare=C.Layout==TerraSim::MotorLayout::Single?.5f:.45f;
  C.PowerW*=Tuning.Power*Tuning.ElectricalPower;C.PeakWheelTorqueNm*=Tuning.Power*Tuning.ElectricalPower;
  C.RegenPowerW*=FMath::Sqrt(Tuning.Power*Tuning.ElectricalPower);
  // Motor voltage limits and the donor chassis' calibrated road-speed limit
  // remove drive demand progressively, without clamping chassis momentum.
  const float SafeSpeed=Number(TEXT("topSpeedMPH"),VehicleIndex==4?106.f:130.f)*.44704f;
  const float WheelRadius=Number(TEXT("tireRadius"),.42f)*Tuning.TireRadius;
  C.MaxMotorRPM=FMath::Min(C.MaxMotorRPM,SafeSpeed/FMath::Max(.15f,WheelRadius)*C.Reduction*60/(2*PI));
  return C;
}
float ATerraVehicle::PowerHP() const {return IsElectric()?ElectricConfig().PowerW/745.7f:(IsICEConversion()?CombustionConfig().PowerW:Power)/745.7f*Tuning.Power;}
FString ATerraVehicle::PowertrainDescription() const {
  const auto C=ElectricConfig();
  if(IsICEConversion())return FString::Printf(TEXT("Gasoline V8 / 8-speed / %.0f hp"),PowerHP());
  if(C.Layout==TerraSim::MotorLayout::None)return TEXT("Factory combustion / automatic");
  const int Motors=TerraSim::ElectricMotorCount(C.Layout);
  return FString::Printf(TEXT("%s %d motor EV / %.0f kWh / %.0f%% charge"),IsFactoryElectric()?TEXT("Factory"):TEXT("Converted"),Motors,C.BatteryKWh,BatterySOC*100);
}
float ATerraVehicle::WheelPressure(int Index) const {
  const float Front=Number(TEXT("stockPSIFront"),Number(TEXT("stockPSI"),35));
  const float Rear=Number(TEXT("stockPSIRear"),Front);
  return FMath::Clamp(Pressure*(Index>=2?Rear/FMath::Max(20.f,Front):1.f),8.f,65.f);
}
TerraSim::TirePressureBounds ATerraVehicle::TireAirBounds() const {
  const float StockMass=Number(TEXT("mass"),2100),Front=Number(TEXT("stockPSIFront"),Number(TEXT("stockPSI"),35));
  const float Rear=Number(TEXT("stockPSIRear"),Front),Scale=Rear/FMath::Max(20.f,Front);
  const auto F=TerraSim::PressureBounds(Front,Mass*9.81f*FrontWeight*.5f,StockMass*9.81f*FrontWeight*.5f);
  const auto R=TerraSim::PressureBounds(Rear,Mass*9.81f*AxleLoadFraction(1)*.5f,StockMass*9.81f*AxleLoadFraction(1)*.5f);
  return {FMath::Max(F.MinimumPSI,R.MinimumPSI/Scale),FMath::Min(F.MaximumPSI,R.MaximumPSI/Scale),F.RoadPSI};
}
TerraSim::PressureEffects ATerraVehicle::TirePressureHandling(bool Front) const {
  const float Share=AxleLoadFraction(Front?0:1)*.5f,Placard=Number(Front?TEXT("stockPSIFront"):TEXT("stockPSIRear"),Number(TEXT("stockPSI"),35));
  return TerraSim::EvaluateTirePressure(WheelPressure(Front?0:2),Placard,Mass*9.81f*Share,Number(TEXT("mass"),2100)*9.81f*Share,Speed,0,Tracks);
}
void ATerraVehicle::RequestTirePressure(float Target,bool Persist){
  if(!Spec.IsValid()||!FMath::IsFinite(Target))return;
  TireAirRequested=true;
  PressureTarget=TerraSim::ClampTirePressure(Target,TireAirBounds());PressureProfiles[VehicleIndex]=PressureTarget;
  if(Garage)Pressure=PressureTarget; // A stationary garage service, not CTIS.
  if(!Garage&&TireAirHardwareStage()==0&&PressureTarget>Pressure)Notice=TEXT("Fit tire air control or return to the garage to inflate");
  if(Persist&&!AutoTest)SaveSetup();
}
void ATerraVehicle::UpdateTireAir(float Dt){
  if(!Spec.IsValid())return;
  if(!TireAirRequested)return;
  const auto Hardware=TerraSim::ResolveTireAirHardware(TireAirHardwareStage());
  const float ActualSpeed=Chassis->GetPhysicsLinearVelocity().Size2D()/100;
  Pressure=TerraSim::AdvanceTirePressure(Pressure,PressureTarget,Dt,Hardware,ActualSpeed,TireAirPowered(),TireAirBounds(),TerraSim::TireAirVolumeScale(Radius,Width));
}
FString ATerraVehicle::TireAirDescription() const {
  const auto H=TerraSim::ResolveTireAirHardware(TireAirHardwareStage());
  if(FMath::Abs(PressureTarget-Pressure)<.04f)return FString::Printf(TEXT("%.0f PSI target / %s"),PressureTarget,H.Stage?TEXT("air ready"):TEXT("manual valves"));
  const bool Inflating=PressureTarget>Pressure;
  const bool Operating=TerraSim::TireAirCanOperate(H,Chassis->GetPhysicsLinearVelocity().Size2D()/100,TireAirPowered(),Inflating);
  return FString::Printf(TEXT("%.0f PSI target / %s%s"),PressureTarget,Operating?(Inflating?TEXT("inflating"):TEXT("deflating")):TEXT("air paused"),Operating?TEXT(""):!TireAirPowered()?TEXT(" - no power"):H.Stage?*FString::Printf(TEXT(" above %.0f mph"),TerraUnits::MPH(H.MaximumSpeedMPS)):TEXT(" - stop / garage"));
}
