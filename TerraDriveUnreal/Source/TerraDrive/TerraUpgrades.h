#pragma once
#include <algorithm>
#include <cmath>

namespace TerraSim {
// The original seven indices are persistent save data; append new hardware.
enum UpgradePart { Suspension, Engine, Tires, Wheels, Frame, Body, Electrical, Drivetrain, Differentials, Portals, EVSwap, TireAir, CenterDifferential, PartCount };
struct UpgradeSetup {
    int Stage[PartCount] = {};
    void Sanitize(bool electrical) {
        for (int &s : Stage) s = std::clamp(s, 0, 3);
        if (!electrical) Stage[Electrical] = 0;
    }
};
inline int UpgradeStageCountForVersion(int version) {
    return version==1||version==2?7:version==3?10:version==4||version==5?12:version==6?PartCount:0;
}
inline bool DecodeUpgradeStages(const double* values,int count,int version,bool electrical,UpgradeSetup& result,bool factoryElectric=false) {
    if(!values||count!=UpgradeStageCountForVersion(version)||count==0)return false;
    UpgradeSetup decoded;
    for(int i=0;i<count;++i){
        const double value=values[i];
        if(!std::isfinite(value)||value<0||value>3||std::floor(value)!=value)return false;
        decoded.Stage[i]=int(value);
    }
    // v4 allowed replacing a factory EV's motors. Reset that obsolete choice;
    // never reinterpret the player's old electric conversion as a gasoline kit.
    if(version<=4&&factoryElectric)decoded.Stage[EVSwap]=0;
    decoded.Sanitize(electrical);result=decoded;return true;
}
struct FactoryDrivetrain {
    bool FourDrive=false,Permanent=false,FrontPrimary=false,FrontLocker=false,RearLocker=false;
    float LowRatio=1;
    bool CenterLocker=false;
};
struct DriveCapabilities {
    bool FourDrive=false,Permanent=false,FrontPrimary=false,FrontLocker=false,RearLocker=false;
    float LowRatio=1,HardwareMass=0;
    bool CenterLocker=false,RigidTransfer=false;
};
inline DriveCapabilities ResolveDriveCapabilities(UpgradeSetup setup,FactoryDrivetrain factory) {
    setup.Sanitize(true);
    DriveCapabilities c;
    c.FourDrive=factory.FourDrive||setup.Stage[Drivetrain]>=1;
    c.Permanent=factory.Permanent;c.FrontPrimary=factory.FrontPrimary;
    c.LowRatio=std::max(1.f,factory.LowRatio);
    if(setup.Stage[Drivetrain]>=2)c.LowRatio=std::max(c.LowRatio,setup.Stage[Drivetrain]>=3?std::max(3.5f,factory.LowRatio*1.12f):2.5f);
    const int diff=setup.Stage[Differentials];
    c.FrontLocker=factory.FrontLocker||diff>=2||(diff>=1&&factory.FrontPrimary);
    c.RearLocker=factory.RearLocker||diff>=2||(diff>=1&&!factory.FrontPrimary);
    if(!factory.FourDrive&&c.FourDrive)c.HardwareMass+=90;
    if(factory.LowRatio<=1.05f&&c.LowRatio>1.05f)c.HardwareMass+=30;
    if(setup.Stage[Drivetrain]>=3)c.HardwareMass+=25;
    if(!factory.FrontLocker&&c.FrontLocker)c.HardwareMass+=12;
    if(!factory.RearLocker&&c.RearLocker)c.HardwareMass+=12;
    if(diff>=3)c.HardwareMass+=10;
    c.CenterLocker=factory.CenterLocker||(setup.Stage[CenterDifferential]>0&&c.FourDrive);
    // The retrofit replaces a part-time coupling with a full-time open center
    // and selectable lock. Without it, 4H/4L is intrinsically coupled.
    if(setup.Stage[CenterDifferential]>0&&c.FourDrive)c.Permanent=true;
    c.RigidTransfer=c.FourDrive&&!c.Permanent;
    const float centerMass[]={0,35,48,64};
    if(c.FourDrive&&!factory.CenterLocker)c.HardwareMass+=centerMass[setup.Stage[CenterDifferential]];
    return c;
}
inline bool DrivenAxle(const DriveCapabilities& c,bool fourSelected,bool front) {
    return ((fourSelected||c.Permanent)&&c.FourDrive)||(front==c.FrontPrimary);
}
struct LimitedSlipShare {float Left=0,Right=0;};
inline LimitedSlipShare LimitedSlipTorque(float torque,float leftCapacity,float rightCapacity) {
    // Three-to-one helical bias plus a small clutch preload still lets axle
    // speeds differ in corners. A selectable hard lock remains the crawl tool.
    const float l=std::max(0.f,leftCapacity),r=std::max(0.f,rightCapacity);
    const float allowed=std::min(std::abs(torque),4*std::min(l,r)+120.f);
    const float fraction=std::clamp((l+60)/(l+r+120),.25f,.75f);
    const float signedTorque=torque<0?-allowed:allowed;
    return {signedTorque*fraction,signedTorque*(1-fraction)};
}
struct UpgradeTuning {
    float Power = 1, Spring = 1, Damping = 1, Travel = 0, Lift = 0;
    float TireRadius = 1, TireWidth = 1, Grip = 1, WheelInertia = 1, Track = 0;
    float Mass = 1, Damage = 1, Drag = 1, Stability = 1;
    float Winch = 1, ElectricalPower = 1, WaterDepth = .25f;
    float PortalLift=0,PortalReduction=1,HardwareMass=0,RotatingMass=0,DriveEfficiency=1;
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
    const float portalLift[]={0,.08f,.13f,.18f};
    const float portalReduction[]={1,1.18f,1.35f,1.55f};
    const float portalMass[]={0,85,130,180};
    const float portalInertia[]={0,.5f,1.1f,1.8f};
    const float portalEfficiency[]={1,.96f,.94f,.92f};
    t.PortalLift=portalLift[s[Portals]];t.PortalReduction=portalReduction[s[Portals]];
    t.HardwareMass=portalMass[s[Portals]];t.RotatingMass=portalInertia[s[Portals]];
    t.DriveEfficiency=portalEfficiency[s[Portals]];t.Lift+=t.PortalLift;
    return t;
}
}
