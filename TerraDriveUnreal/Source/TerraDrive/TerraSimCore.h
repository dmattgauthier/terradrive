#pragma once
#include <algorithm>
#include <cmath>

// SI-only functions shared by the actual Unreal simulation and the small
// standalone regression executable. No engine or graphics dependency.
namespace TerraSim {
inline float WheelOmega(float freeOmega, float stiffness, float longitudinalSpeed,
                        float radius, float dt, float inertia) {
    return (freeOmega + stiffness * longitudinalSpeed * radius * dt / inertia) /
           (1.f + stiffness * radius * radius * dt / inertia);
}
inline float SoilTarget(float maxSink, float load, float width, float length,
                        float slip) {
    const float stress = load / std::max(.025f, width * length);
    return maxSink * std::clamp(std::pow(stress / 150000.f, .68f), 0.f, 1.f) *
           (.32f + std::min(1.5f, std::abs(slip)) * .38f);
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
