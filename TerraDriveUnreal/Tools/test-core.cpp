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
    check(TerraSim::AutomaticGear(0,7,7000,100,6800)==0,"stationary wheelspin cannot shift first gear into a cruising ratio");
    check(TerraSim::AutomaticGear(3,7,3500,100,6800)==2,"hill stall downshifts despite spinning wheels");
    check(TerraSim::AutomaticGear(0,7,6000,6000,6800)==1,"road-speed acceleration still upshifts normally");
    check(TerraSim::AutomaticGear(1,7,6500,4200,6800)==1,"large wheelspin cannot trigger a road-speed upshift");
    check(TerraSim::AutomaticGear(7,7,6000,6000,6800)==7,"automatic transmission respects its top ratio");
    check(TerraSim::AutomaticGear(2,7,1400,1400,6800)==1,"low road speed requests a normal downshift");
    check(TerraSim::AutomaticGear(0,7,700,700,6800)==0,"automatic transmission retains first at idle");
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
        check(direction==-1&&demand.Throttle==1&&demand.Brake==0,"holding S after stopping selects reverse without releasing");
        TerraSim::DriverControls(direction,false,false,0,0,false,0,1.f/60,held,release);
        for(int i=0;i<40;++i)demand=TerraSim::DriverControls(direction,false,true,0,0,false,0,1.f/60,held,release);
        check(direction==-1&&demand.Throttle==1&&demand.Brake==0,"continued S maintains reverse drive");
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
        int direction=1;float held=0;bool release=false;TerraSim::DriverDemand demand;
        for(int i=0;i<int(.5f/dt);++i)demand=TerraSim::DriverControls(direction,false,false,0,.6f,false,0,dt,held,release);
        check(direction==1&&demand.Brake>.5f&&demand.Throttle==0,"left trigger holds a stopped vehicle during reverse dwell");
        for(int i=0;i<int(.3f/dt)+1;++i)demand=TerraSim::DriverControls(direction,false,false,0,.6f,false,0,dt,held,release);
        demand=TerraSim::DriverControls(direction,false,false,0,.6f,false,0,dt,held,release);
        check(direction==-1&&std::abs(demand.Throttle-.6f)<.001f,"left trigger selects proportional reverse at every tested frame rate");
        for(int i=0;i<int(1.f/dt);++i)demand=TerraSim::DriverControls(direction,true,false,1,0,true,0,dt,held,release);
        check(direction==-1&&demand.Brake==1&&demand.Throttle==0,"Space suppresses gear selection while opposite input remains held");
        for(int i=0;i<int(.8f/dt)+1;++i)demand=TerraSim::DriverControls(direction,true,false,1,0,false,0,dt,held,release);
        check(direction==1&&demand.Throttle==1,"forward selection is symmetric after reverse stops");
        direction=1;held=.60f;
        demand=TerraSim::DriverControls(direction,false,true,0,0,false,.3f,dt,held,release);
        check(direction==1&&held==0,"rolling beyond the stop threshold resets reverse dwell");
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
    for(float speed:{1.f,4.f,12.f}){
        const float passage=.20f/speed;
        const float response=TerraSim::SoilResponse(passage,speed,.20f,0,0);
        check(response>.94f,"a rolling footprint compacts soft ground during one passing contact");
        float remaining=1;
        for(int frame=0;frame<12;++frame)remaining*=1-TerraSim::SoilResponse(passage/12,speed,.20f,0,0);
        check(std::abs((1-remaining)-response)<.00001f,"soil response is stable when the same contact is split into substeps");
    }
    check(TerraSim::SoilTarget(.6f,9000,.32f,.2f,0)>TerraSim::SoilTarget(.6f,3000,.32f,.2f,0),"heavy axles compact deeper snow than light axles without requiring tire spin");
    check(TerraSim::SoilResponse(.04f,2,.2f,0,.9f)<TerraSim::SoilResponse(.04f,2,.2f,0,0),"previously packed ground resists further disturbance");
    float s=TerraSim::FrictionScale(5000,6000,.45f,5200);
    check(std::abs(std::hypot(5000*s,6000*s)-.45f*5200)<.001f,"steering and drive share a finite force budget");
    check(TerraSim::FrictionScale(1000,1000,.8f,0)==0,"airborne tire applies no grip");
    float held=0;int d=1;for(int i=0;i<60;i++)d=TerraSim::RequestedDirection(d,false,true,8,1.f/60,held);
    check(d==1&&held==0,"opposite input brakes without reversing at speed");
    for(int i=0;i<20;i++)d=TerraSim::RequestedDirection(d,false,true,0,1.f/60,held);
    check(d==1,"brief opposite input at rest does not reverse");
    for(int i=0;i<10;i++)d=TerraSim::RequestedDirection(d,false,true,0,1.f/60,held);
    check(d==-1,"held opposite input changes direction after stopping");
    check(TerraSim::ConverterEngineRPM(0,750,0,2300)==750,"automatic idles with no launch demand");
    check(TerraSim::ConverterEngineRPM(0,750,1,2300)==2300,"automatic engine can reach converter stall at zero road speed");
    check(TerraSim::ConverterEngineRPM(500,750,.5f,2300)==1525,"partial launch demand has a bounded engine speed");
    check(TerraSim::ConverterEngineRPM(4000,750,1,2300)==4000,"coupled shaft speed takes over above stall");
    check(TerraSim::ConverterEngineRPM(0,750,-1,2300)==750,"negative demand cannot lower idle");
    check(TerraSim::ConverterEngineRPM(0,750,2,2300)==2300,"launch demand cannot exceed configured stall");
    for(float dt:{1.f/120,1.f/30,.1f}){
        const float mass=562.5f,load=mass*9.81f;
        check(std::abs(TerraSim::SuspensionForce(load/47000,0,47000,5100,mass,1,dt)-load)<.01f,"implicit suspension preserves static support across frame times");
        const float c=TerraSim::ContactStiffness(14000,mass,dt);
        check(c>0&&c*dt/mass<1,"contact damping cannot reverse a supported mass in one frame");
    }
    check(TerraSim::SuspensionForce(.12f,1,47000,5100,562.5f,1,.1f)<TerraSim::SuspensionForce(.12f,-1,47000,5100,562.5f,1,.1f),"suspension damps compression and rebound in the proper direction");
    check(TerraSim::TractionControlledTorque(1000,50,5,.4f,3,.03f,3000,3000,30,1)<0,"traction control brakes an overspeeding driven wheel");
    check(TerraSim::TractionControlledTorque(1000,0,0,.4f,3,.03f,3000,3000,30,1)>0,"traction control permits launch torque");
    check(TerraSim::TractionControlledTorque(1000,50,5,.4f,3,.03f,0,0,0,1)==0,"traction control creates no airborne tire torque");
    check(TerraSim::TractionControlledTorque(-1000,-50,-5,.4f,3,.03f,3000,3000,30,-1)>0,"traction control bounds reverse wheelspin too");
    for(float dt:{.01f,.05f,.1f}){
        const float c=TerraSim::ContactStiffness(14000,562.5f,dt),limit=3900,r=.4f,inertia=3,speed=5,omega=speed/r;
        const float drive=TerraSim::TractionControlledTorque(3000,omega,speed,r,inertia,dt,c,limit,60,1);
        const float solved=TerraSim::BrakedWheelOmega(omega+drive*dt/inertia,c,speed,r,dt,inertia,limit,60);
        const float force=c*(solved*r-speed);
        check(force>limit*.6f&&force<=limit,"traction control retains useful bounded drive through the real tire solver across frame times");
    }
    for(float dt:{1.f/30,.1f}){
        float angle=.02f,rate=.05f,peak=.02f;const float mass=2250,share=mass*.25f,load=share*9.81f,inertia=703.13f;
        for(int frame=0;frame<int(6/dt);++frame){
            float torque=0;
            for(float y:{-.84f,.84f})for(int axle=0;axle<2;++axle){
                const float f=TerraSim::SuspensionForce(load/47000-angle*y,rate*y,47000,5100,share,1,dt);
                const float lateral=-TerraSim::ContactStiffness(load*5.5f/2,share,dt)*rate*.65f;
                torque+=(f-load)*y+lateral*.65f;
            }
            rate+=torque/inertia*dt;angle+=rate*dt;peak=std::max(peak,std::abs(angle));
        }
        check(std::isfinite(angle)&&peak<.15f&&std::abs(angle)<.01f,"combined tire and suspension roll response decays at normal and long frame intervals");
    }
    check(TerraSim::EffectiveContactMass(2250,703,3800,4200,0,0,0)==2250,"zero lever arm uses translational contact mass");
    check(TerraSim::EffectiveContactMass(2445,650,5000,5500,1.03f,0,1.83f)<2445*.25f,"high contact lever arms account for body rotation");
    check(std::isfinite(TerraSim::EffectiveContactMass(0,0,0,0,1,1,1)),"degenerate mass data cannot create an infinite brake impulse");
    struct BrakeBody {float mass,cg,track,width,length,spring,damping;};
    const BrakeBody brakeBodies[]={{2250,.77f,1.651f,1.938f,4.810f,35000,4300},{2445,1.03f,1.711f,2.024f,6.10f,50000,4900},{4000,.78f,1.863f,2.197f,5.25f,70000,6900}};
    for(const BrakeBody b:brakeBodies)for(float dt:{1.f/60,.1f}){
        const float share=b.mass*.25f,load=share*9.81f,ix=b.mass*(std::pow(b.width*.84f,2)+.44f*.44f)/12,iz=b.mass*(std::pow(b.width*.84f,2)+std::pow(b.length*.86f,2))/12;
        float angle=.02f,rate=.05f,peak=.02f;
        for(int frame=0;frame<int(6/dt);++frame){float torque=0;
            for(float side:{-1.f,1.f})for(float end:{-1.f,1.f}){
                const float y=side*b.track*.5f,pointMass=TerraSim::EffectiveContactMass(b.mass,ix,iz,iz,b.cg,0,end*b.length*.3f)/4;
                const float f=TerraSim::SuspensionForce(load/b.spring-angle*y,rate*y,b.spring,b.damping,share,1,dt);
                const float lateral=-pointMass*rate*b.cg/dt;torque+=(f-load)*y+lateral*b.cg;
            }
            rate+=torque/ix*dt;angle+=rate*dt;peak=std::max(peak,std::abs(angle));
        }
        check(std::isfinite(angle)&&peak<.15f&&std::abs(angle)<.01f,"brake holding and suspension settle together for tall vehicles across frame times");
    }
    std::cout<<"PASS "<<count<<" native simulation core checks\n";
}
