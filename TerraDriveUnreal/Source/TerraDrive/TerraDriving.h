#pragma once
#include "TerraSimCore.h"

namespace TerraSim {
struct DriverDemand { float Throttle=0, Brake=0; };
// Opposite input stops and holds the car. Release it after braking, then hold
// it at rest to select the other direction; braking cannot silently become drive.
inline DriverDemand DriverControls(int &direction,bool forward,bool reverse,
    float trigger,float pedal,bool stop,float speed,float dt,float &held,bool &releaseRequired) {
    DriverDemand out;
    out.Brake=std::clamp(pedal,0.f,1.f);
    const bool opposite=direction>0?reverse:forward;
    if(!opposite){releaseRequired=false;held=0;}
    if(forward&&reverse){out.Brake=1;held=0;return out;}
    if(opposite){
        if(std::abs(speed)>.22f){releaseRequired=true;held=0;}
        if(releaseRequired){out.Brake=1;return out;}
        const int next=RequestedDirection(direction,forward,reverse,speed,dt,held);
        if(next==direction)out.Brake=1;
        else direction=next;
    }
    if(stop)out.Brake=1;
    out.Throttle=out.Brake>.01f?0.f:((direction>0?forward:reverse)?1.f:std::clamp(trigger,0.f,1.f));
    return out;
}
}
