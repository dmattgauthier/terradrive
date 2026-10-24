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
// The published travel is wheel travel about the loaded ride position, not
// an extra 30 cm of compression for every vehicle. Rubber bump stops engage
// only in the final third of bump travel. A tangent-stiffness solve keeps the
// rapidly rising stop force stable at the game's capped frame rates.
inline float SuspensionBumpTravel(float travel,float extraTravel) {
    return std::max(.055f,travel*.58f+std::max(0.f,extraTravel)*.45f);
}
inline float ProgressiveSuspensionForce(float compression,float velocity,float spring,
    float damping,float mass,float normalZ,float dt,float bumpTravel) {
    const float m=std::max(1.f,mass),load=m*9.81f,k=std::max(1.f,spring);
    const float travel=std::max(.04f,bumpTravel),preload=load/k;
    const float stopLength=travel*.32f;
    const float stop=std::max(0.f,(compression-preload-travel*.68f)/stopLength);
    const float stopForce=load*2.4f*stop*stop;
    const float tangent=k+load*4.8f*stop/stopLength;
    // A high-speed compression valve lets the wheel rise over a sharp seam
    // instead of transmitting the entire damper spike to the chassis. The
    // rebound valve and ordinary body-motion damping remain unchanged.
    const float compressionSpeed=std::max(0.f,-velocity);
    const float valve=.28f+.72f*std::min(1.f,1.25f/std::max(.001f,compressionSpeed));
    const float damper=damping*valve;
    const float step=std::max(0.f,dt),response=damper+tangent*step;
    const float compliant=(k*compression+stopForce-response*velocity+
        response*9.81f*normalZ*step*ContactCoupling)/(1+response*step*ContactCoupling/m);
    if(step<=0)return compliant;
    // At full bump the rubber stop becomes a unilateral travel constraint.
    // A tangent spring alone weakens as its implicit denominator grows and
    // can let a long frame push the front axle through the body. Spend only
    // the impulse needed to reach the end of travel, never a velocity reset.
    const float stopConstraint=m*(9.81f*normalZ+
        ((compression-preload-travel)/step-velocity)/step);
    return std::max(compliant,stopConstraint);
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
                        float slip,float churn=0) {
    const float stress = load / std::max(.025f, width * length);
    // Maximum available depth is a dig/soil-layer limit, not the ordinary
    // static deflection. A parked tire must not excavate half that layer.
    // Reaching the deepest limit requires accumulated shear work in one area.
    const float ordinary=.20f+std::min(1.5f,std::abs(slip))*.12f;
    const float disturbed=ordinary+(1-ordinary)*std::clamp(churn,0.f,1.f);
    return maxSink * std::clamp(std::pow(stress / 150000.f, .68f), 0.f, 1.f) *
           disturbed;
}
inline float SoilChurnDose(float previous,float slip,float speed,float dt,float coverage) {
    const float excess=std::clamp(std::abs(slip)-.35f,0.f,1.65f);
    // Sustained stationary spin can dig a hole. A passing rolling footprint
    // has little exposure and must not instantly behave like fully fluid mud.
    const float working=.25f+.75f/(1+std::abs(speed)*.8f);
    return std::clamp(previous+std::max(0.f,dt)*std::clamp(coverage,0.f,1.f)*excess*.055f*working,0.f,1.f);
}
struct SoilContactPatch { float Length,Depth; };
inline SoilContactPatch SoftSoilFootprint(float pressurePatch,float load,float width,float radius,
                                        float maxSink,float slip,float churn,float oldDepth=0) {
    const float base=std::max(.025f,pressurePatch),r=std::max(.05f,radius);
    if(maxSink<=0||load<=0)return {base,0};
    float depth=SoilTarget(maxSink,load,width,base,slip,churn),length=base;
    // A tire sinking into soil contacts a finite rolling arc, not just its
    // short hard-road pressure patch. Solve area and pressure/sink together;
    // otherwise a 10 cm centre stamp digs a wall below the front support
    // witness and traps a fully loaded vehicle in its own parked footprint.
    for(int i=0;i<8;++i){
        const float d=std::clamp(std::max(depth,oldDepth),0.f,r);
        length=std::max(base,2.f*std::sqrt(std::max(0.f,2*r*d-d*d)));
        depth=(depth+SoilTarget(maxSink,load,width,length,slip,churn))*.5f;
    }
    const float d=std::clamp(std::max(depth,oldDepth),0.f,r);
    length=std::max(base,2.f*std::sqrt(std::max(0.f,2*r*d-d*d)));
    return {length,SoilTarget(maxSink,load,width,length,slip,churn)};
}
inline float SoilResponse(float dt,float speed,float patchLength,float slip,float packing) {
    // Respond within a passing footprint, rather than requiring seconds of
    // stationary wheelspin. The time integration stays stable at varied FPS.
    const float rate=(10.f+std::abs(speed)/std::max(.1f,patchLength)*3.f+
                      std::min(2.f,std::abs(slip))*8.f)*(1.f-packing*.55f);
    return 1.f-std::exp(-std::max(0.f,dt)*rate);
}
inline float SoilCutDepth(float currentHeight,float targetDepth,float coverage,float response) {
    // Exponential convergence is bounded by the target. An absolute 5 cm
    // per-stamp cap made short patches depend on frame rate and grid phase.
    return std::max(0.f,(currentHeight+targetDepth*std::clamp(coverage,0.f,1.f))*std::clamp(response,0.f,1.f));
}
inline float FilteredSoilLoad(float previous,float supportedLoad,float dt) {
    // Soil responds to a supported load over a finite footprint passage,
    // rather than chasing a single rolling-envelope witness/load spike.
    const float response=1.f-std::exp(-std::max(0.f,dt)/.10f);
    return std::max(0.f,previous+(std::max(0.f,supportedLoad)-previous)*response);
}
// A tire leaves a loaded flat-ish floor and rounded collapsing walls. The
// former rectangular target put nearly vertical sides onto a 6.25 cm grid.
// A quintic falloff has zero first/second derivatives at both joins, so the
// physical normals stay continuous as a wheel crosses successive grid cells.
inline float SmoothSoilEdge(float t) {
    t=std::clamp(t,0.f,1.f);
    return std::clamp(t*t*t*(t*(t*6.f-15.f)+10.f),0.f,1.f);
}
inline float GrooveOuterHalfWidth(float halfWidth,float depth) {
    return std::max(.09f,halfWidth)+std::clamp(.035f+std::max(0.f,depth)*.65f,.055f,.18f);
}
inline float GrooveCrossSection(float lateral,float halfWidth,float depth) {
    const float core=std::max(.09f,halfWidth)*.64f;
    const float outer=GrooveOuterHalfWidth(halfWidth,depth);
    return 1.f-SmoothSoilEdge((std::abs(lateral)-core)/(outer-core));
}
struct SoilBank {
    float fraction,width,height;
};
inline SoilBank SoilBankShape(int surface,float tireWidth,float depth,float loose,float slip) {
    const float churn=std::clamp(std::abs(slip),0.f,1.5f)/1.5f;
    // Snow loses pore space under load; sand and wet soil displace more of
    // their volume sideways. Low broad banks cannot repeatedly turn into the
    // tire-high volcanoes made by re-cutting the old rolling front pile.
    if(surface==6)return {.22f,.17f+depth*.35f,std::min(.10f,depth*(.40f+churn*.08f))};
    if(surface==5)return {.74f,std::max(.17f,tireWidth*.70f)+depth*.30f,std::min(.13f,depth*.62f)};
    if(surface==0)return {.08f+std::clamp(loose,0.f,1.f)*.66f,.14f+depth*.40f,std::min(.11f,depth*.58f)};
    return {.80f,std::max(.16f,tireWidth*.58f)+depth*.30f,std::min(.09f,depth*.64f)};
}
inline float SoilBankProfile(float lateral,float inner,float width) {
    const float t=(std::abs(lateral)-inner)/std::max(.05f,width);
    if(t<=.000001f||t>=.999999f)return 0;
    // Unit peak, compact support and C2 joins at undisturbed ground.
    const float a=t*(1-t);
    return 64.f*a*a*a;
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
