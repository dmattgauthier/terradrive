#pragma once
#include "TerraSimCore.h"

namespace TerraSim {
struct DriverDemand { float Throttle=0, Brake=0; };
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
