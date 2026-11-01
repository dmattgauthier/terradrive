#pragma once
#include <algorithm>
#include <cmath>

namespace TerraSim {
// Internal fuel volume is US gallons. Consumption is a gameplay estimate,
// based on shaft work plus idle demand, rather than a certified economy map.
inline double EnergyFraction(double value) {
    return std::isfinite(value)?std::clamp(value,0.,1.):0.;
}
inline bool PropulsionEnergyAvailable(bool usage,float fraction) {
    return !usage||EnergyFraction(fraction)>0.f;
}
inline double AdvanceBattery(double fraction,float dt,float capacityKWh,float drawW,float regenW,bool usage) {
    fraction=EnergyFraction(fraction);
    if(!usage||!std::isfinite(dt)||dt<=0||!std::isfinite(capacityKWh)||capacityKWh<=0||
       !std::isfinite(drawW)||!std::isfinite(regenW))return fraction;
    return EnergyFraction(fraction+(std::max(0.f,regenW)-std::max(0.f,drawW))*dt/(capacityKWh*3600000.f));
}
inline float FuelUseGallonsPerHour(float wheelPowerW,float efficiency,float idleGPH,bool running) {
    if(!running||!std::isfinite(wheelPowerW)||!std::isfinite(efficiency)||!std::isfinite(idleGPH))return 0;
    // A 0.84 driveline efficiency and 33.7 kWh/US gal fuel energy budget.
    return std::max(0.f,idleGPH)+std::max(0.f,wheelPowerW)/(840.f*std::clamp(efficiency,.15f,.45f)*33.7f);
}
inline double AdvanceFuel(double fraction,float dt,float capacityGallons,float gallonsPerHour,bool usage) {
    fraction=EnergyFraction(fraction);
    if(!usage||!std::isfinite(dt)||dt<=0||!std::isfinite(capacityGallons)||capacityGallons<=0||
       !std::isfinite(gallonsPerHour))return fraction;
    return EnergyFraction(fraction-std::max(0.f,gallonsPerHour)*dt/(capacityGallons*3600.f));
}
inline bool EnergyServiceAllowed(bool garage,bool menu,float speedMPS,float angularSpeed,bool overturned) {
    return garage||((menu&&!overturned)&&std::isfinite(speedMPS)&&std::isfinite(angularSpeed)&&
        std::abs(speedMPS)<.15f&&std::abs(angularSpeed)<.1f);
}
}
