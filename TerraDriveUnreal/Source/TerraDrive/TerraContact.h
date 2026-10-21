#pragma once
#include <algorithm>
#include <cmath>

namespace TerraSim {
inline float FootprintCoverage(float distance,float halfExtent,float halfCell) {
    return std::max(0.f,std::min(distance+halfCell,halfExtent)-
                           std::max(distance-halfCell,-halfExtent))/(2*halfCell);
}
inline float FootprintLength(float load, float psi, float width, float radius, bool tracks) {
    if (tracks) return 1.35f;
    return std::clamp(load / (std::max(8.f,psi)*6894.76f*std::max(.12f,width)),
                      .10f, std::min(.65f,radius*1.4f));
}
// Pressure helps a compliant carcass key into loose ground. Excessive airing
// down trades that benefit for lost road stability; it never creates free grip.
inline float PressureGrip(float psi, float stockPsi, bool loose, bool tracks) {
    if (tracks) return 1.f;
    const float ratio=std::clamp(psi/std::max(20.f,stockPsi),.25f,2.5f);
    return loose ? std::clamp(1.f+(1.f-ratio)*.28f,.78f,1.18f)
                 : std::clamp(1.f-std::abs(1.f-ratio)*.12f,.82f,1.f);
}
inline float TerrainGrip(float mu,float load,float staticLoad,float psi,float stockPsi,
                         bool loose,bool tracks,float packing,float slip,float water,float speed) {
    // Mild load sensitivity rewards distributing weight over four tires.
    const float sensitivity=std::clamp(std::pow(std::max(.1f,load/std::max(1.f,staticLoad)),-.07f),.86f,1.12f);
    const float churn=loose ? 1.f-std::clamp(std::abs(slip)-.3f,0.f,1.5f)*.13f*(1.f-packing*.65f) : 1.f;
    const float film=1.f-std::clamp(water*.55f,0.f,.40f)*std::clamp((std::abs(speed)-4.f)/12.f,0.f,1.f);
    return std::max(.06f,mu*PressureGrip(psi,stockPsi,loose,tracks)*sensitivity*churn*film);
}
inline float RutResistance(float depth,float radius,float softness,float packing,bool tracks) {
    const float penetration=std::clamp(depth/std::max(.1f,radius),0.f,1.f);
    return penetration*softness*(1.f-packing*.45f)*(tracks?.075f:.23f);
}
inline float RevLimitedTorque(float requested,float previousOmega,float inertia,float dt,
                              float maxOmega,float reactionAtLimit,float dragTorque) {
    if(requested==0)return 0;
    const float direction=requested<0?-1.f:1.f;
    const float allowance=direction*((direction*maxOmega-previousOmega)*inertia/dt+
                                      reactionAtLimit+dragTorque);
    return direction*std::min(std::abs(requested),std::max(0.f,allowance));
}
inline float LimitedWheelOmega(float freeOmega,float stiffness,float speed,float radius,
                              float dt,float inertia,float forceLimit) {
    stiffness=std::max(0.f,stiffness);forceLimit=std::max(0.f,forceLimit);
    const float implicit=(freeOmega+stiffness*speed*radius*dt/inertia)/
                         (1.f+stiffness*radius*radius*dt/inertia);
    const float force=stiffness*(implicit*radius-speed);
    if (std::abs(force)<=forceLimit) return implicit;
    return freeOmega-std::copysign(forceLimit*radius*dt/inertia,force);
}
inline float LimitedAxleOmega(float freeOmega,float c0,float c1,float v0,float v1,
                             float limit0,float limit1,float radius,float dt,float inertia) {
    const float reach=(limit0+limit1)*radius*dt/inertia;
    float lo=freeOmega-reach,hi=freeOmega+reach;
    for(int i=0;i<24;++i){
        const float omega=(lo+hi)*.5f;
        const float f0=std::clamp(c0*(omega*radius-v0),-limit0,limit0);
        const float f1=std::clamp(c1*(omega*radius-v1),-limit1,limit1);
        if(omega+(f0+f1)*radius*dt/inertia>freeOmega)hi=omega;else lo=omega;
    }
    return (lo+hi)*.5f;
}
// Solve brake holding torque together with the tire reaction. Clamping the
// free wheel to zero before the tire solve lets road contact spin it back up.
// At zero angular speed the brake supplies any torque inside its holding band.
inline float BrakedWheelOmega(float freeOmega,float stiffness,float speed,float radius,
                              float dt,float inertia,float forceLimit,float brakeTorque) {
    const float impulse=std::max(0.f,brakeTorque)*dt/inertia;
    const float reactionAtRest=std::clamp(-stiffness*speed,-forceLimit,forceLimit)*radius*dt/inertia;
    const float tendency=freeOmega-reactionAtRest;
    if(std::abs(tendency)<=impulse)return 0;
    return LimitedWheelOmega(freeOmega-std::copysign(impulse,tendency),stiffness,speed,radius,dt,inertia,forceLimit);
}
inline float BrakedAxleOmega(float freeOmega,float c0,float c1,float v0,float v1,
                             float limit0,float limit1,float radius,float dt,float inertia,float brakeTorque) {
    const float impulse=std::max(0.f,brakeTorque)*dt/inertia;
    const float reactionAtRest=(std::clamp(-c0*v0,-limit0,limit0)+std::clamp(-c1*v1,-limit1,limit1))*radius*dt/inertia;
    const float tendency=freeOmega-reactionAtRest;
    if(std::abs(tendency)<=impulse)return 0;
    return LimitedAxleOmega(freeOmega-std::copysign(impulse,tendency),c0,c1,v0,v1,limit0,limit1,radius,dt,inertia);
}
}
