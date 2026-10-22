#pragma once
#include <algorithm>
#include <cmath>

// SI-only functions shared by the actual Unreal simulation and the small
// standalone regression executable. No engine or graphics dependency.
namespace TerraSim {
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
