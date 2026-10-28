#pragma once
#include <algorithm>
#include <cmath>

// PSI is an intentional interface unit; loads, speed and dimensions are SI.
// Handling coefficients/rates are bounded game estimates, not tire load tables.
namespace TerraSim {
namespace PressureDetail {
inline float Finite(float value,float fallback=0) {return std::isfinite(value)?value:fallback;}
inline float Unit(float value) {return std::clamp(Finite(value),0.f,1.f);}
}
struct TireAirHardware {
    int Stage=0;
    float InflatePSIPerSecond=0,DeflatePSIPerSecond=.10f,MaximumSpeedMPS=.22352f,MassKg=0;
};
inline TireAirHardware ResolveTireAirHardware(int stage) {
    stage=std::clamp(stage,0,3);
    const float inflate[]={0,.08f,.16f,.30f},deflate[]={.10f,.20f,.35f,.60f};
    const float speed[]={.22352f,2.2352f,11.176f,17.8816f},mass[]={0,9,16,24};
    return {stage,inflate[stage],deflate[stage],speed[stage],mass[stage]};
}
inline float LoadedRoadPressure(float placardPSI,float currentStaticLoadN,float stockStaticLoadN) {
    const float stock=std::clamp(PressureDetail::Finite(placardPSI,35),20.f,65.f);
    const float reference=std::max(100.f,PressureDetail::Finite(stockStaticLoadN,5000));
    const float load=std::max(0.f,PressureDetail::Finite(currentStaticLoadN,reference));
    const float relative=std::clamp(load/reference,.65f,1.8f);
    return std::clamp(stock*std::clamp(std::pow(relative,.8f),.75f,1.5f),20.f,65.f);
}
struct TirePressureBounds {float MinimumPSI=10,MaximumPSI=65,RoadPSI=35;};
inline TirePressureBounds PressureBounds(float placardPSI,float currentStaticLoadN,float stockStaticLoadN) {
    const float road=LoadedRoadPressure(placardPSI,currentStaticLoadN,stockStaticLoadN);
    // Air-system upgrades do not magically supply beadlocks or a stronger tire.
    return {std::max(10.f,road*.35f),65.f,road};
}
inline float ClampTirePressure(float psi,const TirePressureBounds& bounds) {
    const float lo=std::clamp(PressureDetail::Finite(bounds.MinimumPSI,10),8.f,65.f);
    const float hi=std::clamp(PressureDetail::Finite(bounds.MaximumPSI,65),lo,65.f);
    return std::clamp(PressureDetail::Finite(psi,bounds.RoadPSI),lo,hi);
}
// Air volume estimate, normalized to the game's 33-inch all-terrain tire.
// This only scales compressor time; it does not enlarge the physical contact.
inline float TireAirVolumeScale(float radiusM,float widthM) {
    const float radius=std::clamp(PressureDetail::Finite(radiusM,.42f),.15f,.8f);
    const float width=std::clamp(PressureDetail::Finite(widthM,.285f),.12f,.65f);
    return std::clamp((radius/.42f)*(width/.285f)*(width/.285f),.3f,4.f);
}
inline bool TireAirCanOperate(const TireAirHardware& hardware,float speedMPS,bool airPowered,bool inflating) {
    const bool stoppedEnough=std::abs(PressureDetail::Finite(speedMPS,1000))<=std::max(0.f,hardware.MaximumSpeedMPS);
    // Manual valves work while stopped without electrical supply. Installed
    // CTIS needs electrical control for both directions; no phantom air source.
    return stoppedEnough&&(hardware.Stage==0?(!inflating):airPowered)&&
        (inflating?hardware.InflatePSIPerSecond>0:hardware.DeflatePSIPerSecond>0);
}
inline float AdvanceTirePressure(float actualPSI,float targetPSI,float dt,const TireAirHardware& hardware,
    float speedMPS,bool airPowered,const TirePressureBounds& bounds,float tireVolumeScale=1) {
    const float actual=ClampTirePressure(actualPSI,bounds),target=ClampTirePressure(targetPSI,bounds);
    const float step=std::max(0.f,PressureDetail::Finite(dt));
    const bool inflating=target>actual;
    if(step==0||target==actual||!TireAirCanOperate(hardware,speedMPS,airPowered,inflating))return actual;
    const float volume=std::clamp(PressureDetail::Finite(tireVolumeScale,1),.3f,4.f);
    const float rate=std::max(0.f,inflating?hardware.InflatePSIPerSecond:hardware.DeflatePSIPerSecond)/volume;
    return inflating?std::min(target,actual+step*rate):std::max(target,actual-step*rate);
}
struct PressureEffects {
    float RoadOptimumPSI=35,Ratio=1;
    float LongitudinalGrip=1,LateralGrip=1,CorneringStiffness=1,SteeringResponse=1;
    float RollingCoefficientAdd=0,FootprintMultiplier=1,Squirm=0;
};
inline PressureEffects EvaluateTirePressure(float psi,float placardPSI,float currentStaticLoadN,
    float stockStaticLoadN,float speedMPS,float softness,bool tracks=false) {
    PressureEffects effects;
    effects.RoadOptimumPSI=LoadedRoadPressure(placardPSI,currentStaticLoadN,stockStaticLoadN);
    if(tracks)return effects;
    const float pressure=std::clamp(PressureDetail::Finite(psi,effects.RoadOptimumPSI),8.f,90.f);
    const float ratio=std::clamp(pressure/effects.RoadOptimumPSI,.20f,3.f);
    const float under=std::max(0.f,1-ratio),over=std::max(0.f,ratio-1);
    const float soft=PressureDetail::Unit(softness),speed=std::abs(PressureDetail::Finite(speedMPS));
    const float fast=std::clamp((speed-5.56f)/12.32f,0.f,1.f);
    const float severe=std::max(0.f,.50f-ratio);
    const float roadLong=std::clamp(1-.26f*under-.12f*under*under-.20f*over,.58f,1.f);
    const float roadSide=std::clamp(1-.30f*under-.20f*under*under-.23f*over,.52f,1.f);
    // A larger compliant footprint helps on soft ground, but is not a free
    // Coulomb-friction multiplier on tarmac. Extreme airing down or road speed
    // consumes this small benefit through carcass distortion/squirm.
    const float softGrip=std::clamp(1+.30f*std::min(.55f,under)-.20f*over-
        severe*.65f-under*fast*.30f,.65f,1.165f);
    effects.Ratio=ratio;
    effects.LongitudinalGrip=roadLong+(softGrip-roadLong)*soft;
    const float softSide=softGrip*(1-.18f*under-.25f*severe);
    effects.LateralGrip=roadSide+(softSide-roadSide)*soft;
    effects.CorneringStiffness=std::clamp(std::pow(ratio,.75f),.40f,1.15f)*(1-.12f*under*fast);
    effects.SteeringResponse=std::clamp(std::pow(ratio,.85f),.42f,1.12f)*(1-.15f*under*fast);
    effects.RollingCoefficientAdd=(.012f*under+.045f*under*under)*(1+.30f*fast);
    // Informational ratio only. Existing FootprintLength already uses load /
    // pressure: do not multiply that footprint by this value a second time.
    effects.FootprintMultiplier=std::clamp(1/ratio,.5f,2.2f);
    effects.Squirm=under*under*(.35f+.65f*fast);
    return effects;
}
}
