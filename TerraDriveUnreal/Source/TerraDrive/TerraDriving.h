#pragma once
#include "TerraSimCore.h"

namespace TerraSim {
struct DriverDemand { float Throttle=0, Brake=0; };

// The launch multiplier tapers as the drivetrain couples, in either gear direction.
inline float ConverterLaunchMultiplier(float speed) {
    const float t=std::clamp(std::abs(speed)-1.5f,0.f,1.f);
    return 1.f+.35f*(1.f-t*t*(3.f-2.f*t));
}

// Allocate the existing brake authority using the estimated loaded axle balance.
// The same brake torque remains available at low speed for hill holds and ledges.
inline constexpr float BrakeBiasStartMPS=.8f;
inline float FrontServiceBrakeShare(float speed,float demandG,float availableGripG,
    float staticFrontShare,float cgHeight,float axleSpan,int wheelCount) {
    const float standingShare=2.f/std::max(2,wheelCount);
    constexpr float fullBiasMPS=2.5f;
    const float t=std::clamp((std::abs(speed)-BrakeBiasStartMPS)/(fullBiasMPS-BrakeBiasStartMPS),0.f,1.f);
    const float deceleration=std::clamp(std::min(demandG,availableGripG),0.f,.85f);
    const float transfer=deceleration*std::max(0.f,cgHeight)/std::max(.5f,axleSpan);
    const float dynamicShare=std::clamp(staticFrontShare+std::copysign(transfer,speed),.15f,.85f);
    return standingShare+(dynamicShare-standingShare)*t*t*(3.f-2.f*t);
}

inline float AirDragPerSpeed(float speed,float coefficient,float frontalArea) {
    return .5f*1.225f*std::abs(speed)*std::max(0.f,coefficient)*std::max(0.f,frontalArea);
}
// S/Down/LT brakes, then selects reverse after a continuous 0.65s stop.
// Space is a dedicated hold: it never changes gear or applies drive torque.
inline DriverDemand DriverControls(int &direction,bool forward,bool reverse,
    float trigger,float pedal,bool stop,float speed,float dt,float &held,bool &releaseRequired) {
    DriverDemand out;
    releaseRequired=false;
    trigger=std::clamp(trigger,0.f,1.f);pedal=std::clamp(pedal,0.f,1.f);
    const float ahead=forward?1.f:trigger,back=reverse?1.f:pedal;
    if(stop||(ahead>.05f&&back>.05f)){
        out.Brake=stop?1.f:back;held=0;return out;
    }
    const float opposite=direction>0?back:ahead,drive=direction>0?ahead:back;
    if(opposite>.05f){
        out.Brake=std::max(.35f,opposite);
        if(std::abs(speed)>.22f)held=0;
        else held+=std::max(0.f,dt);
        if(held>=.65f){direction=-direction;held=0;}
        return out; // Shift frame stays braked; torque begins on the next frame.
    }
    held=0;out.Throttle=drive;
    return out;
}
}
