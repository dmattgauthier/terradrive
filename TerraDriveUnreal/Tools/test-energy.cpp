#include "../Source/TerraDrive/TerraEnergy.h"
#include "../Source/TerraDrive/TerraUpgrades.h"
#include <cstdlib>
#include <iostream>
#include <limits>

int main(){
    using namespace TerraSim;
    int checks=0;
    auto check=[&](bool ok,const char* name){++checks;if(!ok){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}};
    const float nan=std::numeric_limits<float>::quiet_NaN();
    check(!PropulsionEnergyAvailable(true,0)&&PropulsionEnergyAvailable(false,0),"unlimited mode drives from empty without refilling");
    check(PropulsionEnergyAvailable(true,.00001f),"last positive energy remains usable");
    check(std::abs(AdvanceBattery(.75,3600,100,25000,0,true)-.5)<1e-8,"battery draw uses work and capacity");
    check(std::abs(AdvanceBattery(.5,3600,100,0,25000,true)-.75)<1e-8,"regen adds bounded energy");
    check(AdvanceBattery(.5,3600,100,25000,35000,false)==.5,"disabled battery holds charge including during regen");
    check(AdvanceBattery(.01,3600,100,25000,0,true)==0&&AdvanceBattery(.99,3600,100,0,25000,true)==1,"battery bounds");
    check(AdvanceFuel(.1,3600,10,2,true)==0&&AdvanceFuel(.75,3600,20,5,true)==.5,"fuel draw and depletion");
    check(AdvanceFuel(.75,3600,20,5,false)==.75,"disabled fuel holds actual fuel level");
    check(FuelUseGallonsPerHour(0,.28f,.4f,true)>.39f&&FuelUseGallonsPerHour(0,.28f,.4f,false)==0,"idle consumes fuel only while running");
    check(FuelUseGallonsPerHour(100000,.28f,.4f,true)>FuelUseGallonsPerHour(50000,.28f,.4f,true),"load increases fuel demand");
    check(FuelUseGallonsPerHour(-100000,.28f,.4f,true)==.4f,"coasting cannot regenerate fuel");
    for(float dt:{1.f/20,1.f/60,1.f/120}){
        double battery=.75,fuel=.75;
        const int n=int(std::round(60/dt));
        for(int i=0;i<n;++i){battery=AdvanceBattery(battery,dt,170,350,0,true);fuel=AdvanceFuel(fuel,dt,12.4f,.35f,true);}
        check(std::abs(battery-AdvanceBattery(.75,60,170,350,0,true))<1e-7,"small accessory loads accumulate at normal frame rates");
        check(std::abs(fuel-AdvanceFuel(.75,60,12.4f,.35f,true))<1e-7,"idle burn is frame rate independent");
    }
    for(float bad:{nan,-1.f,0.f}){
        check(AdvanceBattery(.5,bad,100,1000,0,true)==.5,"invalid time cannot alter battery");
        check(AdvanceFuel(.5,bad,20,1,true)==.5,"invalid time cannot alter fuel");
    }
    check(AdvanceBattery(.5,1,nan,1000,0,true)==.5&&AdvanceFuel(.5,1,nan,1,true)==.5,"invalid capacity cannot alter levels");
    check(AdvanceBattery(.5,1,100,nan,0,true)==.5&&AdvanceFuel(.5,1,20,nan,true)==.5,"invalid draw cannot poison levels");
    check(EnergyServiceAllowed(true,false,10,1,true),"garage is a static service bay");
    check(EnergyServiceAllowed(false,true,0,0,false),"stopped upright pause menu permits service");
    check(!EnergyServiceAllowed(false,true,1,0,false)&&!EnergyServiceAllowed(false,true,0,1,false),"service cannot freeze moving or rotating vehicles");
    check(!EnergyServiceAllowed(false,true,0,0,true)&&!EnergyServiceAllowed(false,false,0,0,false),"service requires a safe menu context");
    check(!EnergyServiceAllowed(false,true,nan,0,false),"nonfinite speed blocks service");
    check(UpgradeStageCountForVersion(6)==13&&UpgradeStageCountForVersion(7)==13&&UpgradeStageCountForVersion(8)==0,"new save retains ordered upgrade slots and rejects unknown future format");
    std::cout<<checks<<" energy checks passed\n";
}
