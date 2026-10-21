#pragma once
#include <algorithm>

namespace TerraSim {
enum UpgradePart { Suspension, Engine, Tires, Wheels, Frame, Body, Electrical, PartCount };
struct UpgradeSetup {
    int Stage[PartCount] = {};
    void Sanitize(bool electrical) {
        for (int &s : Stage) s = std::clamp(s, 0, 3);
        if (!electrical) Stage[Electrical] = 0;
    }
};
struct UpgradeTuning {
    float Power = 1, Spring = 1, Damping = 1, Travel = 0, Lift = 0;
    float TireRadius = 1, TireWidth = 1, Grip = 1, WheelInertia = 1, Track = 0;
    float Mass = 1, Damage = 1, Drag = 1, Stability = 1;
    float Winch = 1, ElectricalPower = 1, WaterDepth = .25f;
};
inline UpgradeTuning Tune(UpgradeSetup setup, bool electric, bool electricalAvailable) {
    setup.Sanitize(electricalAvailable);
    const int *s = setup.Stage;
    const float power[] = {1,1.18f,1.40f,1.68f};
    const float damping[] = {1,1.18f,1.40f,1.65f};
    const float grip[] = {1,1.13f,1.28f,1.46f};
    const float inertia[] = {1,.82f,.65f,.50f};
    const float mass[] = {1,.97f,.93f,.88f};
    const float electrical[] = {1,1.08f,1.17f,1.28f};
    UpgradeTuning t;
    t.Power=power[s[Engine]];
    t.Spring=1+.03f*s[Suspension]+.006f*s[Suspension]*s[Suspension];
    t.Damping=damping[s[Suspension]];
    t.Travel=.07f*s[Suspension];
    t.Lift=.035f*s[Suspension];
    t.TireRadius=1+.04f*s[Tires];
    t.TireWidth=1+.07f*s[Tires];
    t.Grip=grip[s[Tires]]*(1+.025f*s[Wheels]);
    t.WheelInertia=inertia[s[Wheels]];
    t.Track=.035f*s[Wheels];
    t.Mass=mass[s[Body]]*(1+.014f*s[Frame]);
    t.Damage=1/(1+.35f*s[Frame]+.22f*s[Body]);
    t.Drag=1-.07f*s[Body];
    t.Stability=1+.3f*s[Frame];
    t.Winch=1+.30f*s[Electrical];
    t.ElectricalPower=electric?electrical[s[Electrical]]:1;
    t.WaterDepth=.25f+.20f*s[Electrical];
    return t;
}
}
