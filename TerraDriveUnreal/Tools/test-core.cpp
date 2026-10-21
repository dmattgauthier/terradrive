#include "../Source/TerraDrive/TerraSimCore.h"
#include "../Source/TerraDrive/TerraUpgrades.h"
#include <cstdlib>
#include <iostream>
#include <limits>

static int count=0;
void check(bool value,const char* name){++count;if(!value){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}}
int main(){
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
