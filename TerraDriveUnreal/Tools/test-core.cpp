#include "../Source/TerraDrive/TerraSimCore.h"
#include "../Source/TerraDrive/TerraUpgrades.h"
#include "../Source/TerraDrive/TerraContact.h"
#include "../Source/TerraDrive/TerraUnits.h"
#include "../Source/TerraDrive/TerraDriving.h"
#include <cstdlib>
#include <iostream>
#include <limits>

static int count=0;
void check(bool value,const char* name){++count;if(!value){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}}
int main(){
    for(float dt:{1.f/30,1.f/60,1.f/120}){
        float locked=24,backward=-24,axle=24;
        for(float time=0;time<.2f;time+=dt){
            locked=TerraSim::BrakedWheelOmega(locked,22000,10,.42f,dt,3,4200,9000);
            backward=TerraSim::BrakedWheelOmega(backward,22000,-10,.42f,dt,3,4200,9000);
            axle=TerraSim::BrakedAxleOmega(axle,22000,18000,10,9,4200,3800,.42f,dt,6,18000);
        }
        check(locked==0,"service brake holds a wheel against the full moving-road contact reaction");
        check(backward==0,"braking holds in reverse without creating reverse wheel torque");
        check(axle==0,"locked differential brakes both contacts together");
        const float coast=TerraSim::LimitedWheelOmega(24,22000,10,.42f,dt,3,4200);
        check(std::abs(TerraSim::BrakedWheelOmega(24,22000,10,.42f,dt,3,4200,0)-coast)<.00001f,"zero braking retains the existing rolling solver");
    }
    {
        int direction=1;float held=0;bool release=false;TerraSim::DriverDemand demand;
        for(int i=0;i<60;++i)demand=TerraSim::DriverControls(direction,false,true,0,0,false,8,1.f/60,held,release);
        check(direction==1&&demand.Brake==1&&demand.Throttle==0,"S is a full brake while traveling forward");
        for(int i=0;i<180;++i)demand=TerraSim::DriverControls(direction,false,true,0,0,false,0,1.f/60,held,release);
        check(direction==1&&demand.Brake==1&&demand.Throttle==0,"holding S after stopping holds instead of silently accelerating backward");
        TerraSim::DriverControls(direction,false,false,0,0,false,0,1.f/60,held,release);
        for(int i=0;i<40;++i)demand=TerraSim::DriverControls(direction,false,true,0,0,false,0,1.f/60,held,release);
        check(direction==-1&&demand.Throttle==1&&demand.Brake==0,"release then hold S at rest deliberately selects reverse");
        demand=TerraSim::DriverControls(direction,false,true,0,0,true,-5,1.f/60,held,release);
        check(demand.Brake==1&&demand.Throttle==0,"Space overrides reverse throttle");
        demand=TerraSim::DriverControls(direction,true,false,0,0,false,-5,1.f/60,held,release);
        check(direction==-1&&demand.Brake==1&&demand.Throttle==0,"W brakes while reversing");
        direction=1;release=false;
        demand=TerraSim::DriverControls(direction,true,false,1,0,true,15,1.f/60,held,release);
        check(demand.Brake==1&&demand.Throttle==0,"Space overrides held W and the accelerator trigger");
        demand=TerraSim::DriverControls(direction,false,false,1,.7f,false,15,1.f/60,held,release);
        check(demand.Brake==.7f&&demand.Throttle==0,"gamepad pedal brake has priority over drive");
    }
    for(float dt:{1.f/30,1.f/60,1.f/120}){
        const float drive=TerraSim::RevLimitedTorque(10000,3,3,dt,9,420,200);
        const float omega=TerraSim::LimitedWheelOmega(3+(drive-200)*dt/3,20000,0,.42f,dt,3,1000);
        check(omega<=9.00001f&&omega>8.99f,"powered wheelspin reaches but cannot overshoot redline at different frame rates");
    }
    for(float phase:{0.f,.03f,.0625f}){
        float area=0;for(int cell=-5;cell<=5;++cell)area+=TerraSim::FootprintCoverage(cell*.125f-phase,.05f,.0625f)*.125f;
        check(std::abs(area-.10f)<.000001f,"short tire footprints conserve covered area at every grid phase");
    }
    check(std::abs(TerraUnits::MPH(44.704f)-100)<.001f,"speed displays miles per hour");
    check(std::abs(TerraUnits::Feet(.3048f)-1)<.00001f,"distance displays feet");
    check(std::abs(TerraUnits::Inches(.0254f)-1)<.00001f,"small lengths display inches");
    check(std::abs(TerraUnits::Pounds(.45359237f)-1)<.00001f,"weight displays pounds");
    check(std::abs(TerraUnits::PoundsForce(4.4482216f)-1)<.00001f,"winch force displays pounds force");
    const float roadPatch=TerraSim::FootprintLength(5200,37,.285f,.42f,false);
    check(TerraSim::FootprintLength(5200,16,.285f,.42f,false)>roadPatch*1.4f,"airing down expands actual soil footprint");
    check(TerraSim::FootprintLength(5200,16,.285f,.42f,true)==1.35f,"tracks retain their full supported length");
    check(TerraSim::PressureGrip(16,37,true,false)>1.1f&&TerraSim::PressureGrip(16,37,false,false)<1,"low pressure trades road precision for loose terrain grip");
    const float grip=TerraSim::TerrainGrip(.6f,5000,5000,37,37,true,false,0,0,0,10);
    check(TerraSim::TerrainGrip(.6f,5000,5000,37,37,true,false,0,2,0,10)<grip,"sustained wheelspin churns loose soil");
    check(TerraSim::TerrainGrip(.6f,5000,5000,37,37,true,false,0,0,.4f,15)<grip,"standing water reduces high speed tire grip");
    check(TerraSim::TerrainGrip(.6f,10000,5000,37,37,true,false,0,0,0,10)<grip,"overloaded tires lose friction coefficient");
    check(TerraSim::RutResistance(.15f,.42f,.8f,0,false)>TerraSim::RutResistance(.15f,.42f,.8f,1,false),"packing reduces repeated-pass rut resistance");
    check(TerraSim::RutResistance(.15f,.42f,.8f,0,true)<TerraSim::RutResistance(.15f,.42f,.8f,0,false),"tracks reduce bulldozing resistance");
    const float spin=TerraSim::LimitedWheelOmega(100,50000,2,.42f,1.f/60,3,1000);
    check(spin>90&&std::abs(3*(100-spin)/(.42f/60)-1000)<.02f,"traction limit permits real wheelspin and bounds reaction force");
    check(std::abs(TerraSim::LimitedWheelOmega(-100,50000,-2,.42f,1.f/60,3,1000)+spin)<.0001f,"limited wheel solver is symmetric in reverse");
    const float coupled=TerraSim::LimitedAxleOmega(12,22000,18000,3,5,1500,2500,.42f,1.f/60,6);
    const float f0=std::clamp(22000*(coupled*.42f-3),-1500.f,1500.f),f1=std::clamp(18000*(coupled*.42f-5),-2500.f,2500.f);
    check(std::abs(coupled+(f0+f1)*.42f/60/6-12)<.0001f,"locked shaft conserves angular momentum across unequal tire contacts");
    TerraSim::UpgradeSetup build;
    auto stock=TerraSim::Tune(build,false,true);
    check(stock.Power==1&&stock.Mass==1&&stock.Travel==0&&stock.Grip==1,"stock tuning preserves the baseline");
    for(int stage=1;stage<=3;++stage){
        for(int &s:build.Stage)s=stage;
        auto t=TerraSim::Tune(build,false,true);
        check(t.Power>stock.Power&&t.Grip>stock.Grip&&t.Travel>stock.Travel,"every stage adds power traction and articulation");
        check(t.Damping>stock.Damping&&t.WheelInertia<stock.WheelInertia,"every stage changes suspension damping and wheel response");
        check(t.Damage<stock.Damage&&t.Drag<stock.Drag&&t.Mass<stock.Mass,"every stage improves impact survival and power to weight");
        check(t.Winch>stock.Winch&&t.WaterDepth>stock.WaterDepth,"electrical stages improve actual recovery and water limits");
        stock=t;
    }
    build={};build.Stage[TerraSim::Electrical]=3;
    auto ev=TerraSim::Tune(build,true,true),ice=TerraSim::Tune(build,false,true),unsupported=TerraSim::Tune(build,false,false);
    check(ev.ElectricalPower>1.25f&&ice.ElectricalPower==1,"EV inverter upgrades affect propulsion without adding ICE horsepower");
    check(unsupported.Winch==1&&unsupported.WaterDepth==.25f,"unsupported electrical upgrades do not alter the vehicle");
    build={};build.Stage[TerraSim::Engine]=3;
    auto engine=TerraSim::Tune(build,false,true);
    check(engine.Power>1.6f&&engine.Grip==1&&engine.Damage==1,"one category does not secretly upgrade unrelated systems");
    build.Stage[TerraSim::Engine]=999;build.Stage[TerraSim::Tires]=-8;
    auto sanitized=TerraSim::Tune(build,false,true);
    check(sanitized.Power==engine.Power&&sanitized.Grip==1,"out of range saved stages are clamped safely");
    check(TerraSim::ValidSupport(.25f,-.3f,.57f,1),"upright support within suspension travel");
    check(!TerraSim::ValidSupport(-1,-.3f,.57f,1),"ground behind the suspension cannot support a rolled car");
    check(!TerraSim::ValidSupport(5,-.3f,.57f,1),"airborne wheel cannot reach distant ground");
    check(!TerraSim::ValidSupport(.25f,-.3f,.57f,-1),"back-facing surface cannot supply tire grip");
    check(!TerraSim::ValidSupport(std::numeric_limits<float>::quiet_NaN(),-.3f,.57f,1),"invalid suspension result rejected");
    auto open=TerraSim::SplitAxleTorque(3000,2000,0,false);
    auto locked=TerraSim::SplitAxleTorque(3000,2000,0,true);
    check(open.left==open.right&&open.left<=12,"open axle loses traction when one wheel lifts");
    check(locked.left==3000&&locked.right==0,"locked axle transfers torque to the loaded wheel");
    auto reverseLock=TerraSim::SplitAxleTorque(-3000,500,1500,true);
    check(reverseLock.left==-750&&reverseLock.right==-2250,"reverse locked torque conserves requested torque");
    auto equal=TerraSim::SplitAxleTorque(800,2000,2000,false);
    check(equal.left==400&&equal.right==400,"balanced open axle delivers requested torque");
    for(float dt:{1.f/30,1.f/60,1.f/120}){
        float omega=0;
        for(int i=0;i<300;i++)omega=TerraSim::WheelOmega(omega,50000,12,.42f,dt,3);
        check(std::isfinite(omega)&&std::abs(omega*.42f-12)<.0001f,"implicit wheel converges without high-stiffness oscillation");
        float reverse=0;
        for(int i=0;i<300;i++)reverse=TerraSim::WheelOmega(reverse,50000,-12,.42f,dt,3);
        check(std::abs(reverse+omega)<.0001f,"reverse rotation is symmetric");
    }
    for(float slip:{0.f,.4f,1.f}){
        float tires=TerraSim::SoilTarget(.6f,5000,.285f,.20f,slip);
        float tracks=TerraSim::SoilTarget(.6f,5950,.48f,1.35f,slip);
        check(tracks>0&&tracks<tires*.5f,"tracks float better despite added mass");
    }
    check(TerraSim::SoilTarget(0,10000,.3f,.2f,1)==0,"rigid surfaces cannot excavate");
    float s=TerraSim::FrictionScale(5000,6000,.45f,5200);
    check(std::abs(std::hypot(5000*s,6000*s)-.45f*5200)<.001f,"steering and drive share a finite force budget");
    check(TerraSim::FrictionScale(1000,1000,.8f,0)==0,"airborne tire applies no grip");
    float held=0;int d=1;for(int i=0;i<60;i++)d=TerraSim::RequestedDirection(d,false,true,8,1.f/60,held);
    check(d==1&&held==0,"opposite input brakes without reversing at speed");
    for(int i=0;i<20;i++)d=TerraSim::RequestedDirection(d,false,true,0,1.f/60,held);
    check(d==1,"brief opposite input at rest does not reverse");
    for(int i=0;i<10;i++)d=TerraSim::RequestedDirection(d,false,true,0,1.f/60,held);
    check(d==-1,"held opposite input changes direction after stopping");
    std::cout<<"PASS "<<count<<" native simulation core checks\n";
}
