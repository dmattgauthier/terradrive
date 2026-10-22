#pragma once
#include <algorithm>
#include <cmath>

// SI-only functions shared by the actual Unreal simulation and the small
// standalone regression executable. No engine or graphics dependency.
namespace TerraSim {
// An automatic's fluid coupling lets the engine rise above stationary input
// shaft speed under throttle. Stall speed is an estimate, not extra torque.
inline float ConverterEngineRPM(float shaftRPM,float idleRPM,float throttle,float stallRPM){
    const float launch=idleRPM+std::clamp(throttle,0.f,1.f)*(std::max(idleRPM,stallRPM)-idleRPM);
    return std::max(shaftRPM,launch);
}
// Implicit contact response includes the supported body's inertia. This keeps
// long render frames from alternating full bump force and airborne wheels.
// Normal and two tangential constraints act on the same body; reserve inertia
// for all three instead of independently spending the entire response budget.
inline constexpr float ContactCoupling=3.f;
inline float SuspensionForce(float compression,float velocity,float spring,float damping,float mass,float normalZ,float dt){
    const float step=std::max(0.f,dt),m=std::max(1.f,mass),response=damping+spring*step;
    return (spring*compression-response*velocity+response*9.81f*normalZ*step*ContactCoupling)/(1+response*step*ContactCoupling/m);
}
inline float ContactStiffness(float raw,float mass,float dt){
    return std::max(0.f,raw)/(1+std::max(0.f,raw)*std::max(0.f,dt)*ContactCoupling/std::max(1.f,mass));
}
inline float EffectiveContactMass(float mass,float ix,float iy,float iz,float tx,float ty,float tz){
    const float inverse=1/std::max(1.f,mass)+tx*tx/std::max(1.f,ix)+ty*ty/std::max(1.f,iy)+tz*tz/std::max(1.f,iz);
    return 1/inverse;
}
// Electronic traction control cuts drive and applies bounded wheel braking;
// it does not lock either axle or create extra contact grip.
inline float TractionControlledTorque(float requested,float omega,float speed,float radius,float inertia,float dt,float stiffness,float limit,float drag,int direction){
    const float r=std::max(.05f,radius),step=std::max(.001f,dt);
    // Compensate for numerical contact compliance: a long frame needs more
    // elastic slip to develop the same bounded fraction of available grip.
    const float elastic=.85f*limit/std::max(1.f,stiffness);
    const float target=(speed+direction*std::max({.35f,std::abs(speed)*.18f,elastic}))/r;
    const float reaction=r*std::clamp(stiffness*(target*r-speed),-limit,limit);
    const float friction=(target<0?-1.f:1.f)*drag;
    const float available=(target-omega)*inertia/step+reaction+friction;
    const float drive=direction*std::min(std::abs(requested),direction*available);
    return std::clamp(drive,-limit*r,limit*r);
}
// Wheelspin must not carry a nearly stationary vehicle into cruising gears.
// Road RPM supplies the shift demand; shaft RPM still guards an upshift.
inline int AutomaticGear(int gear,int last,float shaftRPM,float roadRPM,float redline){
    if(gear>0&&roadRPM<1500.f)return gear-1;
    if(gear<last&&roadRPM>redline*.85f&&shaftRPM>redline*.85f&&shaftRPM<roadRPM*1.35f)return gear+1;
    return gear;
}
inline bool ValidSupport(float distance, float minTravel, float maxTravel,
                         float normalDotUp) {
    return std::isfinite(distance) && distance >= minTravel &&
           distance <= maxTravel && normalDotUp > .15f;
}
struct AxleTorque { float left, right; };
inline AxleTorque SplitAxleTorque(float torque, float leftCapacity,
                                 float rightCapacity, bool locked) {
    const float sign = torque < 0 ? -1.f : 1.f;
    const float requested = std::abs(torque);
    leftCapacity = std::max(0.f, leftCapacity);
    rightCapacity = std::max(0.f, rightCapacity);
    if (!locked) {
        // An open differential delivers equal shaft torque. The lightly loaded
        // wheel limits both sides; a small allowance lets that wheel spin.
        const float each = std::min(requested * .5f,
                                   std::min(leftCapacity, rightCapacity) + 12.f);
        return {sign * each, sign * each};
    }
    const float sum = leftCapacity + rightCapacity;
    if (sum < 1.f) return {torque * .5f, torque * .5f};
    return {torque * leftCapacity / sum, torque * rightCapacity / sum};
}
inline float WheelOmega(float freeOmega, float stiffness, float longitudinalSpeed,
                        float radius, float dt, float inertia) {
    return (freeOmega + stiffness * longitudinalSpeed * radius * dt / inertia) /
           (1.f + stiffness * radius * radius * dt / inertia);
}
inline float SoilTarget(float maxSink, float load, float width, float length,
                        float slip) {
    const float stress = load / std::max(.025f, width * length);
    return maxSink * std::clamp(std::pow(stress / 150000.f, .68f), 0.f, 1.f) *
           (.55f + std::min(1.5f, std::abs(slip)) * .30f);
}
inline float SoilResponse(float dt,float speed,float patchLength,float slip,float packing) {
    // Respond within a passing footprint, rather than requiring seconds of
    // stationary wheelspin. The time integration stays stable at varied FPS.
    const float rate=(10.f+std::abs(speed)/std::max(.1f,patchLength)*3.f+
                      std::min(2.f,std::abs(slip))*8.f)*(1.f-packing*.55f);
    return 1.f-std::exp(-std::max(0.f,dt)*rate);
}
inline float FrictionScale(float longitudinal, float lateral, float mu,
                           float load) {
    const float force = std::hypot(longitudinal, lateral);
    return force > 0 ? std::min(1.f, mu * std::max(0.f, load) / force) : 1.f;
}
inline int RequestedDirection(int direction, bool forward, bool reverse,
                             float speed, float dt, float &held) {
    const bool opposite = (direction > 0 && reverse) || (direction < 0 && forward);
    if (!opposite || std::abs(speed) >= .22f) held = 0;
    else if ((held += dt) > .45f) { held = 0; return -direction; }
    return direction;
}
}
