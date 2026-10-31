#pragma once
#include <algorithm>
#include <cmath>

namespace TerraSim {
struct CenterTorque { float Front=0,Rear=0; };
inline float CenterAxleCapacity(float left,float right,bool locked,bool limitedSlip) {
    const float a=std::max(0.f,left),b=std::max(0.f,right);
    return locked?a+b:limitedSlip?std::min(a+b,4*std::min(a,b)+120.f):2*std::min(a,b);
}
// Open center gearing has a fixed nominal split, but the lower-traction axle
// limits the transferable input. This is distinct from a rigid transfer case.
inline CenterTorque OpenCenterTorque(float input,float frontCapacity,float rearCapacity,float frontShare) {
    const float share=std::clamp(frontShare,.1f,.9f);
    const float available=std::min((std::max(0.f,frontCapacity)+24.f)/share,
                                 (std::max(0.f,rearCapacity)+24.f)/(1-share));
    const float delivered=std::copysign(std::min(std::abs(input),available),input);
    return {delivered*share,delivered*(1-share)};
}
inline float CenterRatedTorque(int stage,bool factory,float mass,float radius) {
    const float rating[]={0,.55f,.95f,1.5f};
    const float multiplier=factory?1.5f:rating[std::clamp(stage,0,3)];
    return std::max(1.f,mass)*9.81f*std::max(.1f,radius)*multiplier;
}
inline float CenterHardwareMass(int stage) {
    const float mass[]={0,35,48,64};return mass[std::clamp(stage,0,3)];
}
inline bool CenterShiftAllowed(bool available,bool frontDriven,bool rearDriven,float speed,float throttle,float shaftDifference) {
    return available&&frontDriven&&rearDriven&&std::isfinite(speed)&&std::abs(speed)<=.5f&&
           std::isfinite(throttle)&&throttle<=.05f&&std::isfinite(shaftDifference)&&std::abs(shaftDifference)<=2.f;
}
// Evaluate solves the actual four tire/axle equations with equal and opposite
// center torque, then returns front mean shaft speed minus rear mean speed.
// Solving this constraint spends wheel inertia and existing tire grip; there
// is no chassis velocity edit, extra traction or wheel-speed projection.
template<class Evaluate> float SolveCenterCoupling(float maximumTorque,Evaluate evaluate) {
    const float limit=std::max(0.f,maximumTorque);
    if(limit<=0)return 0;
    const float free=evaluate(0);
    if(!std::isfinite(free)||std::abs(free)<.0001f)return 0;
    float lo=-limit,hi=limit;
    const float low=evaluate(lo),high=evaluate(hi);
    if(!std::isfinite(low)||!std::isfinite(high))return 0;
    if(low>=0)return lo;
    if(high<=0)return hi;
    for(int i=0;i<20;++i){const float middle=(lo+hi)*.5f;if(evaluate(middle)>0)hi=middle;else lo=middle;}
    return (lo+hi)*.5f;
}
}
