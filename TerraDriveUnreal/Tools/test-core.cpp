#include "../Source/TerraDrive/TerraSimCore.h"
#include "../Source/TerraDrive/TerraUpgrades.h"
#include "../Source/TerraDrive/TerraContact.h"
#include "../Source/TerraDrive/TerraUnits.h"
#include "../Source/TerraDrive/TerraDriving.h"
#include <array>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <vector>

static int count=0;
void check(bool value,const char* name){++count;if(!value){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}}
int main(){
    for(float dt:{1.f/20,1.f/30,1.f/60,.1f})for(float direction:{-1.f,1.f})for(float lateral:{0.f,.8f,1.f}){
        const float speed=direction*4,r=.4f,c=9000,limit=4000,drag=160,inertia=3;
        float wheel=speed/r,axle=wheel;
        for(int i=0;i<80;i++){
            wheel=TerraSim::CombinedWheelOmega(wheel,c,speed,r,dt,inertia,limit,lateral,drag);
            axle=TerraSim::CombinedAxleOmega(axle,c,c,speed,speed*.85f,limit,limit,lateral,lateral,r,dt,inertia*2,drag*2);
        }
        check(wheel*direction>std::abs(speed)/r*.90f,"unbraked rolling tire keeps turning at saturated lateral grip");
        check(axle*direction>std::abs(speed)/r*.80f,"locked axle retains rolling speed at full steering demand");
        check(TerraSim::CombinedWheelOmega(wheel,c,speed,r,dt,inertia,limit,lateral,10000)==0,"combined slip still lets the service brake lock a moving tire");
        const auto forces=TerraSim::CombinedTireForces(c*(wheel*r-speed),lateral*limit,limit,limit);
        check(forces.Longitudinal*forces.Longitudinal+forces.Lateral*forces.Lateral<=limit*limit*1.00001f,"combined contact never exceeds its friction ellipse");
        const float next=TerraSim::CombinedWheelOmega(wheel,c,speed,r,dt,inertia,limit,lateral,drag);
        const float balance=(next-wheel)*inertia/dt+TerraSim::CombinedLongitudinal(next,c,speed,r,limit,lateral)*r+direction*drag;
        check(std::abs(balance)<.1f,"implicit rolling solution balances tire and drag torque");
    }
    for(float angle:{-.55f,.55f}){
        const float left=TerraSim::AckermannAngle(angle,0,-.8f,2.89f),right=TerraSim::AckermannAngle(angle,0,.8f,2.89f);
        const float leftRadius=2.89f/std::tan(left),rightRadius=2.89f/std::tan(right);
        check(std::abs((leftRadius-rightRadius)-1.6f)<.00001f,"front steering angles share a turn centre instead of scrubbing in parallel");
        const float rear=-angle*.25f;
        for(float side:{-.8f,.8f}){
            const float f=TerraSim::AckermannAngle(angle,rear,side,2.89f),r=TerraSim::AckermannAngle(rear,angle,side,-2.89f);
            check(std::abs(std::tan(f)/std::tan(angle)-std::tan(r)/std::tan(rear))<.00001f,"counter-steering rear axle shares the front axle turn centre");
        }
    }
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
    for(float dt:{1.f/20,1.f/30,1.f/60,1.f/120})for(float direction:{1.f,-1.f}){
        // A loaded locked shaft already at redline must retain its contact
        // reaction torque. It must not coast every other frame just because
        // engine RPM reached the cap. Unequal contacts represent one lightly
        // loaded wheel during a slow cross-axle climb.
        constexpr float radius=.4154f,inertia=6,maxOmega=8.948f,drag=60;
        constexpr float c0=3000,c1=650,limit0=5000,limit1=750,requested=4000;
        const float v0=direction*.4f,v1=direction*.1f;
        const float reactionAtLimit=radius*(std::clamp(c0*(direction*maxOmega*radius-v0),-limit0,limit0)+
                                           std::clamp(c1*(direction*maxOmega*radius-v1),-limit1,limit1));
        float omega=direction*maxOmega,minimumGrip=limit0+limit1,maximumOmega=0,maximumResidual=0,maximumDrive=0;
        for(int frame=0;frame<int(2/dt);++frame){
            const float previous=omega;
            const float drive=TerraSim::RevLimitedTorque(direction*requested,previous,inertia,dt,maxOmega,reactionAtLimit,direction*drag);
            omega=TerraSim::BrakedAxleOmega(previous+drive*dt/inertia,c0,c1,v0,v1,limit0,limit1,radius,dt,inertia,drag);
            const float force0=std::clamp(c0*(omega*radius-v0),-limit0,limit0),force1=std::clamp(c1*(omega*radius-v1),-limit1,limit1);
            minimumGrip=std::min(minimumGrip,direction*(force0+force1));
            maximumOmega=std::max(maximumOmega,std::abs(omega));
            maximumDrive=std::max(maximumDrive,std::abs(drive));
            maximumResidual=std::max(maximumResidual,std::abs(inertia*(omega-previous)/dt+(force0+force1)*radius+direction*drag-drive));
        }
        check(maximumOmega<=maxOmega+.0001f,"loaded locked shaft respects redline forward and reverse at 20/30/60/120 FPS");
        check(minimumGrip>(limit0+limit1)*.995f,"loaded locked shaft retains sustained traction at its RPM cap");
        check(maximumResidual<.03f,"sustained locked drive conserves wheel inertia, tire reaction and drag torque");
        check(maximumDrive<=requested+.001f,"redline contact support never exceeds requested engine torque");
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
    check(TerraSim::Electrical==6&&TerraSim::Drivetrain==7&&TerraSim::Differentials==8&&TerraSim::Portals==9&&TerraSim::EVSwap==10&&TerraSim::TireAir==11&&TerraSim::PartCount==12,"persistent original upgrade indices remain unchanged while electric and tire air append at ten and eleven");
    const TerraSim::FactoryDrivetrain factories[]={
        {true,false,false,true,true,4}, {true,false,false,true,true,3.06f},
        {false,false,true,false,false,1}, {false,false,false,false,false,1},
        {true,true,false,true,true,1}, {true,true,false,false,false,1}};
    for(const auto factory:factories){
        TerraSim::UpgradeSetup setup;
        const auto base=TerraSim::ResolveDriveCapabilities(setup,factory);
        check(base.FourDrive==factory.FourDrive&&base.LowRatio==factory.LowRatio&&base.FrontLocker==factory.FrontLocker&&base.RearLocker==factory.RearLocker,"factory driveline and lockers survive stock upgrade stage");
        check(TerraSim::DrivenAxle(base,false,factory.FrontPrimary),"stock primary axle remains driven");
        check(TerraSim::DrivenAxle(base,false,!factory.FrontPrimary)==factory.Permanent,"permanent AWD cannot be disabled and two-wheel mode retains its proper axle");
        setup.Stage[TerraSim::Drivetrain]=1;
        auto converted=TerraSim::ResolveDriveCapabilities(setup,factory);
        check(converted.FourDrive&&converted.LowRatio==factory.LowRatio,"drivetrain stage one adds missing high drive without inventing low range");
        check(TerraSim::DrivenAxle(converted,true,true)&&TerraSim::DrivenAxle(converted,true,false),"converted high drive supplies both actual axles");
        setup.Stage[TerraSim::Drivetrain]=2;converted=TerraSim::ResolveDriveCapabilities(setup,factory);
        check(converted.LowRatio>=2.5f&&converted.LowRatio>=factory.LowRatio,"stage two adds selectable low range without weakening factory gearing");
        setup.Stage[TerraSim::Drivetrain]=3;converted=TerraSim::ResolveDriveCapabilities(setup,factory);
        check(converted.LowRatio>=3.5f&&converted.LowRatio>=factory.LowRatio,"crawler stage retains stronger factory low gearing");
        setup.Stage[TerraSim::Differentials]=1;converted=TerraSim::ResolveDriveCapabilities(setup,factory);
        check(factory.FrontPrimary?converted.FrontLocker:converted.RearLocker,"first locker upgrade powers the primary driven axle");
        setup.Stage[TerraSim::Differentials]=2;converted=TerraSim::ResolveDriveCapabilities(setup,factory);
        check(converted.FrontLocker&&converted.RearLocker,"second locker stage equips both axles");
        check(converted.HardwareMass>=25,"added hardware contributes chassis mass");
    }
    TerraSim::UpgradeSetup portals;
    auto previous=TerraSim::Tune(portals,false,true);
    for(int stage=1;stage<=3;stage++){
        portals.Stage[TerraSim::Portals]=stage;auto t=TerraSim::Tune(portals,false,true);
        check(t.PortalLift>previous.PortalLift&&t.Lift==t.PortalLift&&t.PortalReduction>previous.PortalReduction,"portal stages increase real body clearance and wheel-end reduction");
        check(t.HardwareMass>previous.HardwareMass&&t.RotatingMass>previous.RotatingMass&&t.DriveEfficiency<previous.DriveEfficiency,"larger portal hardware has weight inertia and efficiency tradeoffs");
        check(1/t.PortalReduction<1/previous.PortalReduction,"portal reduction trades maximum geared speed for wheel torque");
        check(t.Power==1&&t.Travel==0&&t.TireRadius==1,"portal conversion does not secretly change engine suspension travel or tires");
        previous=t;
    }
    const auto lsd=TerraSim::LimitedSlipTorque(2000,1800,600),reverseLsd=TerraSim::LimitedSlipTorque(-2000,1800,600),liftedLsd=TerraSim::LimitedSlipTorque(2000,1800,0);
    check(lsd.Left>lsd.Right&&lsd.Left<=3*lsd.Right+.001f&&std::abs(lsd.Left+lsd.Right-2000)<.001f,"unlocked competition differentials bias torque within their three-to-one ratio");
    check(reverseLsd.Left==-lsd.Left&&reverseLsd.Right==-lsd.Right,"limited-slip bias remains symmetric in reverse");
    check(liftedLsd.Left+liftedLsd.Right<=120.001f,"unlocked limited slip does not behave as a hard locker with an airborne tire");
    double legacy[]={3,2,1,0,2,1,3};TerraSim::UpgradeSetup migrated;
    check(TerraSim::DecodeUpgradeStages(legacy,7,1,true,migrated)&&migrated.Stage[TerraSim::Engine]==2&&migrated.Stage[TerraSim::Portals]==0,"v1 seven-category saves migrate with new hardware stock");
    check(TerraSim::DecodeUpgradeStages(legacy,7,2,false,migrated)&&migrated.Stage[TerraSim::Electrical]==0&&migrated.Stage[TerraSim::Drivetrain]==0,"v2 saves retain supported categories and zero missing hardware");
    double modern[]={0,1,2,3,0,1,2,1,2,3};
    check(TerraSim::DecodeUpgradeStages(modern,10,3,true,migrated)&&migrated.Stage[TerraSim::Portals]==3&&migrated.Stage[TerraSim::EVSwap]==0&&migrated.Stage[TerraSim::TireAir]==0,"v3 saves retain all ten original categories and default electric and tire air to stock");
    for(double bad:{-1.,4.,.5,std::numeric_limits<double>::infinity(),std::numeric_limits<double>::quiet_NaN()}){
        modern[7]=bad;const auto before=migrated;
        check(!TerraSim::DecodeUpgradeStages(modern,10,3,true,migrated)&&migrated.Stage[TerraSim::Portals]==before.Stage[TerraSim::Portals]&&migrated.Stage[TerraSim::Drivetrain]==before.Stage[TerraSim::Drivetrain],"malformed stage data is rejected without partial save mutation");
    }
    check(!TerraSim::DecodeUpgradeStages(legacy,7,3,true,migrated)&&!TerraSim::DecodeUpgradeStages(legacy,7,9,true,migrated),"wrong stage count and unknown save versions are rejected");
    check(TerraSim::UpgradeStageCountForVersion(1)==7&&TerraSim::UpgradeStageCountForVersion(2)==7&&TerraSim::UpgradeStageCountForVersion(3)==10&&TerraSim::UpgradeStageCountForVersion(4)==12,"save version lengths remain explicit rather than inheriting the current part count");
    double electricBuild[]={0,1,2,3,0,1,2,1,2,3,3,2};
    check(TerraSim::DecodeUpgradeStages(electricBuild,12,4,true,migrated)&&migrated.Stage[TerraSim::EVSwap]==3&&migrated.Stage[TerraSim::TireAir]==2&&migrated.Stage[TerraSim::Portals]==3&&migrated.Stage[TerraSim::Engine]==1,"v4 saves retain conversion and tire air alongside every original hardware category");
    check(TerraSim::DecodeUpgradeStages(electricBuild,12,4,true,migrated,true)&&migrated.Stage[TerraSim::EVSwap]==0&&migrated.Stage[TerraSim::TireAir]==2&&migrated.Stage[TerraSim::Portals]==3&&migrated.Stage[TerraSim::Engine]==1,"legacy factory EV conversions migrate safely to factory motors while retaining all other upgrade slots");
    check(TerraSim::UpgradeStageCountForVersion(5)==12&&TerraSim::DecodeUpgradeStages(electricBuild,12,5,true,migrated,true)&&migrated.Stage[TerraSim::EVSwap]==3,"v5 records an explicit factory EV to gasoline conversion without losing its stage");
    check(TerraSim::DecodeUpgradeStages(electricBuild,12,5,true,migrated,false)&&migrated.Stage[TerraSim::EVSwap]==3,"v5 keeps combustion donor quad motor swaps independent from gasoline conversion semantics");
    for(int part:{int(TerraSim::EVSwap),int(TerraSim::TireAir)}){
        const double original=electricBuild[part];
        for(double bad:{-1.,4.,.5,std::numeric_limits<double>::infinity(),std::numeric_limits<double>::quiet_NaN()}){
            electricBuild[part]=bad;const auto before=migrated;
            const bool rejected=!TerraSim::DecodeUpgradeStages(electricBuild,12,4,true,migrated);
            bool unchanged=true;for(int i=0;i<TerraSim::PartCount;++i)unchanged&=migrated.Stage[i]==before.Stage[i];
            check(rejected&&unchanged,"invalid electric or air stage rejects the complete v4 build atomically");
        }
        electricBuild[part]=original;
    }
    check(!TerraSim::DecodeUpgradeStages(electricBuild,10,4,true,migrated)&&!TerraSim::DecodeUpgradeStages(electricBuild,12,3,true,migrated),"v4 truncated rows and v3 rows with appended undeclared fields reject without partial migration");
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
    for(float sink:{.14f,.30f,.48f})for(float slip:{0.f,1.5f}){
        const auto patch=TerraSim::SoftSoilFootprint(.10f,5500,.32f,.4154f,sink,slip,0);
        const float arc=2*std::sqrt(2*.4154f*patch.Depth-patch.Depth*patch.Depth);
        check(patch.Length>.20f&&patch.Length<.831f&&patch.Depth>0&&patch.Depth<sink,"soft soil contact expands beyond the hard-road patch while respecting the layer");
        check(std::abs(patch.Depth-TerraSim::SoilTarget(sink,5500,.32f,patch.Length,slip))<.000001f&&std::abs(arc-patch.Length)<.002f,"soft contact area and pressure-dependent sink solve the same rolling-circle geometry");
    }
    const auto rigidPatch=TerraSim::SoftSoilFootprint(.12f,5500,.32f,.4154f,0,0,0);
    check(rigidPatch.Length==.12f&&rigidPatch.Depth==0,"rigid ground retains its carcass pressure footprint");
    const auto trackPatch=TerraSim::SoftSoilFootprint(1.35f,5500,.48f,.4154f,.30f,1,0);
    check(trackPatch.Length==1.35f&&trackPatch.Depth>0,"flotation tracks retain their full supported length without an artificial tire arc");
    const auto deepPatch=TerraSim::SoftSoilFootprint(.10f,5500,.32f,.4154f,.30f,1,0,.15f);
    check(deepPatch.Length>1.2f*.4154f,"a tire in an existing deep rut works the leading rolling-envelope wall instead of only digging its centre");
    const auto unloadedPatch=TerraSim::SoftSoilFootprint(.10f,0,.32f,.4154f,.30f,1,0);
    check(unloadedPatch.Length==.10f&&unloadedPatch.Depth==0,"unsupported tires cannot create a soft-contact sink target");
    for(float depth:{.015f,.08f,.18f,.32f}){
        const float halfWidth=.16f,outer=TerraSim::GrooveOuterHalfWidth(halfWidth,depth),core=halfWidth*.64f;
        check(TerraSim::GrooveCrossSection(0,halfWidth,depth)==1&&TerraSim::GrooveCrossSection(outer+.001f,halfWidth,depth)==0,"tire groove has a loaded floor and an exact undisturbed outer boundary");
        float peakSlope=0,previous=1;bool monotone=true,symmetric=true;
        for(int i=1;i<=1000;++i){const float x=outer*i/1000.f,value=TerraSim::GrooveCrossSection(x,halfWidth,depth);
            monotone&=value<=previous+.00001f&&value>=0;
            symmetric&=std::abs(value-TerraSim::GrooveCrossSection(-x,halfWidth,depth))<.00001f;
            peakSlope=std::max(peakSlope,std::abs(value-previous)*depth/(outer/1000.f));previous=value;}
        check(monotone&&symmetric,"rounded tire walls are symmetric and cannot introduce secondary crater teeth");
        const float e=.0002f;
        const float innerSlope=std::abs(TerraSim::GrooveCrossSection(core+e,halfWidth,depth)-TerraSim::GrooveCrossSection(core-e,halfWidth,depth))/(2*e);
        const float outerSlope=std::abs(TerraSim::GrooveCrossSection(outer+e,halfWidth,depth)-TerraSim::GrooveCrossSection(outer-e,halfWidth,depth))/(2*e);
        check(innerSlope<.003f&&outerSlope<.015f,"quintic walls meet the floor and undisturbed ground with flat tangents");
        check(std::isfinite(peakSlope)&&peakSlope<4.5f,"deep soil groove walls remain finite instead of vertical grid cliffs");
    }
    for(int surface:{0,2,3,5,6}){
        const float depth=TerraSim::SoilTarget(surface==6?.6f:surface==5?.28f:.36f,5500,.32f,.30f,.08f);
        const auto bank=TerraSim::SoilBankShape(surface,.32f,depth,.8f,.08f);
        check(bank.fraction>0&&bank.fraction<1&&bank.width>=.14f&&bank.height>0&&bank.height<.1016f,"rolling bank budget and repose cap stay bounded for each loose surface");
        const float inner=TerraSim::GrooveOuterHalfWidth(.16f,depth);
        check(TerraSim::SoilBankProfile(inner,inner,bank.width)==0&&TerraSim::SoilBankProfile(inner+bank.width,inner,bank.width)==0&&std::abs(TerraSim::SoilBankProfile(inner+bank.width*.5f,inner,bank.width)-1)<.00001f,"side banks have compact support and a single smooth unit peak");
        float integral=0,peakSlope=0,previous=0;
        for(int i=1;i<=1000;++i){const float value=TerraSim::SoilBankProfile(inner+bank.width*i/1000.f,inner,bank.width);
            integral+=value*bank.width/1000.f;peakSlope=std::max(peakSlope,std::abs(value-previous)*bank.height/(bank.width/1000.f));previous=value;}
        check(std::abs(integral-bank.width*(16.f/35.f))<.00001f,"side bank cross-section has a stable integrable displacement envelope");
        check(peakSlope<1.7f,"ordinary rolling side banks cannot turn into tire-high pointed mounds");
    }
    const auto snowBank=TerraSim::SoilBankShape(6,.32f,.18f,.8f,.08f),sandBank=TerraSim::SoilBankShape(5,.32f,.18f,.8f,.08f);
    check(snowBank.fraction<sandBank.fraction*.4f&&snowBank.height<sandBank.height,"snow compacts pore volume and leaves lower banks than displaced sand");
    check(TerraSim::SoilBankShape(0,.32f,.02f,0,0).fraction<TerraSim::SoilBankShape(0,.32f,.02f,1,0).fraction,"firm dirt compresses with a light trail while loose dirt bunches sideways");
    for(float frameStep:{1.f/20,1.f/30,1.f/60,1.f/120})for(float phase:{0.f,.021f,.046f}){
        // Independent sampled strip: a continuously rolling contact crosses
        // grid phases at four simulation rates. This does not assert the
        // implementation's own target, but bounds the final longitudinal
        // roughness and minimum supported depth of the resulting profile.
        constexpr float cell=.0625f,speed=2.f,patch=.30f;
        const float target=TerraSim::SoilTarget(.6f,5500,.32f,patch,.08f);
        std::vector<float> height(97,0),packing(97,0);
        float previousPosition=-3.f+phase,previousTime=0;
        for(int frame=1;frame<=int(6.f/speed/frameStep)+1;++frame){
            const float now=std::min(6.f/speed,frame*frameStep),position=-3.f+phase+now*speed;
            const int substeps=std::max(1,int(std::ceil(std::abs(position-previousPosition)/cell)));
            for(int s=1;s<=substeps;++s){
                const float center=previousPosition+(position-previousPosition)*s/substeps,dt=(now-previousTime)/substeps;
                for(int i=0;i<int(height.size());++i){const float x=-3.f+i*cell;
                    const float edge=TerraSim::FootprintCoverage(x-center,patch*.5f,cell*.5f)*TerraSim::GrooveCrossSection(0,.16f,target);
                    const float response=TerraSim::SoilResponse(dt*edge,speed,patch,.08f,packing[i]);
                    height[i]-=TerraSim::SoilCutDepth(height[i],target,1,response);
                    packing[i]=std::clamp(packing[i]+(1-packing[i])*response,0.f,1.f);
                }
            }
            previousPosition=position;previousTime=now;
        }
        float minimum=1,peakStep=0,peakCurvature=0;
        // Ignore contact entry/exit, which are intentionally rounded ramps.
        for(int i=12;i<84;++i){minimum=std::min(minimum,-height[i]);
            peakStep=std::max(peakStep,std::abs(height[i]-height[i-1]));
            peakCurvature=std::max(peakCurvature,std::abs(height[i+1]-2*height[i]+height[i-1]));}
        check(minimum>target*.86f,"swept rolling snow footprint converges to its calibrated loaded target across frame rates and grid phases");
        check(peakStep<.018f&&peakCurvature<.025f,"swept groove avoids repeated longitudinal crater teeth across frame rates and grid phases");
    }
    for(float dt:{1.f/20,1.f/30,1.f/60,1.f/120}){
        const float staticMud=TerraSim::SoilTarget(.36f,5500,.32f,.10f,0);
        const float instantSpin=TerraSim::SoilTarget(.36f,5500,.32f,.10f,1.5f);
        check(staticMud>.05f&&staticMud<.09f,"ordinary static mud compression stays below running-board clearance rather than half the dig layer");
        check(instantSpin>staticMud&&instantSpin<.15f,"brief wheelspin cannot instantly excavate the full loose layer");
        float dose=0;
        for(int i=0;i<int(12.f/dt);++i)dose=TerraSim::SoilChurnDose(dose,2,0,dt,1);
        check(dose>.99f&&TerraSim::SoilTarget(.36f,5500,.32f,.10f,2,dose)>.35f,"sustained stationary shear work can reach the full available mud depth");
        float brief=0;
        for(int i=0;i<int(.10f/dt);++i)brief=TerraSim::SoilChurnDose(brief,2,2,dt,1);
        check(brief<.01f&&TerraSim::SoilTarget(.36f,5500,.32f,.10f,2,brief)<.145f,"a passing high-slip tire leaves a groove instead of an instant deep pit");
        check(TerraSim::SoilChurnDose(.2f,0,0,10,1)==.2f&&TerraSim::SoilChurnDose(.2f,2,0,10,0)==.2f,"parking and zero footprint exposure add no shear-dose excavation");
        float load=0;
        for(int i=0;i<int(2.f/dt);++i)load=TerraSim::FilteredSoilLoad(load,5000,dt);
        check(std::abs(load-5000)<.01f,"supported soil load converges consistently at 20/30/60/120 FPS");
        float low=10000,high=0;
        for(int i=0;i<int(2.f/dt);++i){load=TerraSim::FilteredSoilLoad(load,i%2?10000:0,dt);if(i>int(1.f/dt)){low=std::min(low,load);high=std::max(high,load);}}
        check(high-low<2600&&low>3600&&high<6400,"soil-only load response does not chase alternating contact spikes");
        const float previous=load;
        load=TerraSim::FilteredSoilLoad(load,0,.5f);
        check(load<previous*.01f,"unsupported soil history decays instead of preserving stale load");
    }
    for(float dt:{1.f/20,1.f/30,1.f/60,1.f/120})for(float speed:{2.f,6.f,12.f})for(float phase:{0.f,.021f,.046f}){
        constexpr float cell=.0625f,patch=.10f;
        const float target=TerraSim::SoilTarget(.6f,5500,.32f,patch,.08f);
        std::vector<float> height(161,0),packing(161,0);
        float previous=-5.f+phase,lastTime=0;
        for(int frame=1;frame<=int(10.f/speed/dt)+1;++frame){
            const float time=std::min(10.f/speed,frame*dt),position=-5.f+phase+time*speed;
            const int count=std::max(1,int(std::ceil(std::abs(position-previous)/.025f)));
            for(int k=1;k<=count;++k){const float p=previous+(position-previous)*k/count,step=(time-lastTime)/count;
                for(int i=0;i<int(height.size());++i){
                    const float along=TerraSim::FootprintCoverage(-5.f+i*cell-p,patch*.5f,cell*.5f);
                    const float response=TerraSim::SoilResponse(step*along,speed,patch,.08f,packing[i]);
                    height[i]-=TerraSim::SoilCutDepth(height[i],target,1,response);
                    packing[i]=std::clamp(packing[i]+(1-packing[i])*response,0.f,1.f);
                }
            }
            previous=position;lastTime=time;
        }
        float minimum=1,maximum=0,peakCurvature=0;
        for(int i=16;i<144;++i){minimum=std::min(minimum,-height[i]);maximum=std::max(maximum,-height[i]);peakCurvature=std::max(peakCurvature,std::abs(height[i+1]-2*height[i]+height[i-1]));}
        check(minimum>target*.86f&&maximum<=target+.00001f,"short real-pressure patch leaves continuous bounded depth at real driving speeds and frame rates");
        check(maximum-minimum<.014f&&peakCurvature<.018f,"short-patch sweep has no grid-phase crater or per-stamp cut-cap teeth");
    }
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
    for(float dt:{1.f/120,1.f/30,1.f/20,.1f}){
        const float mass=550,load=mass*9.81f,spring=35000,damping=4300;
        const float preload=load/spring,bump=TerraSim::SuspensionBumpTravel(.24f,0);
        check(std::abs(TerraSim::ProgressiveSuspensionForce(preload,0,spring,damping,mass,1,dt,bump)-load)<.01f,
            "progressive suspension preserves the loaded ride height at capped frame rates");
        const float ordinary=TerraSim::SuspensionForce(preload+.02f,0,spring,damping,mass,1,dt);
        check(std::abs(TerraSim::ProgressiveSuspensionForce(preload+.02f,0,spring,damping,mass,1,dt,bump)-ordinary)<.01f,
            "bump stops do not stiffen ordinary suspension articulation");
        check(TerraSim::ProgressiveSuspensionForce(preload+.02f,-5,spring,damping,mass,1,1.f/120,bump)<
              TerraSim::SuspensionForce(preload+.02f,-5,spring,damping,mass,1,1.f/120),
            "compression blow-off reduces a sharp terrain-edge damper impulse before full bump");
        check(std::abs(TerraSim::ProgressiveSuspensionForce(preload+.02f,2,spring,damping,mass,1,dt,bump)-
              TerraSim::SuspensionForce(preload+.02f,2,spring,damping,mass,1,dt))<.01f,
            "rebound damping remains intact after compression blow-off");
        float compression=preload,velocity=0,peak=preload;
        for(int frame=0;frame<int(5/dt);++frame){
            const float time=frame*dt,external=load*(time<.65f?2.2f:1.f);
            const float force=std::clamp(TerraSim::ProgressiveSuspensionForce(compression,velocity,
                spring,damping,mass,1,dt,bump),0.f,load*6);
            velocity+=(force-external)/mass*dt;compression-=velocity*dt;peak=std::max(peak,compression);
        }
        check(std::isfinite(compression)&&peak-preload<bump+std::max(.0015f,1.25f*9.81f*dt*dt)&&std::abs(compression-preload)<.012f,
            "progressive stops resist a 2.2-g dive and return to ride height without collapse");
    }
    check(TerraSim::SuspensionBumpTravel(.16f,0)<TerraSim::SuspensionBumpTravel(.3302f,0),
        "a sedan has less physical bump travel than the Hummer");
    check(TerraSim::SuspensionBumpTravel(.24f,.21f)>TerraSim::SuspensionBumpTravel(.24f,0)+.09f,
        "suspension upgrades add usable compression travel as well as droop");
    for(float dt:{1.f/120,1.f/30,1.f/20}){
        // Coast over a road/loose-ground boundary through the actual tire
        // solver. Changing grip/resistance alone must not become an impulse
        // brake, although rolling losses must still remove kinetic energy.
        const float mass=2250,radius=.4154f,inertia=3,load=mass*9.81f*.25f;
        float speed=8,omega=speed/radius,peakDeceleration=0;
        for(int frame=0;frame<int(1.f/dt);++frame){
            const bool loose=frame*dt>=.25f;
            const float rolling=loose?.20f:.013f,mu=loose?.36f:.98f;
            const float stiffness=TerraSim::ContactStiffness(load*(loose?5.f:10.f)/speed,mass*.25f,dt);
            omega=TerraSim::BrakedWheelOmega(omega,stiffness,speed,radius,dt,inertia,mu*load,rolling*load*radius);
            const float force=std::clamp(stiffness*(omega*radius-speed),-mu*load,mu*load);
            const float acceleration=4*force/mass;
            peakDeceleration=std::max(peakDeceleration,-acceleration);speed+=acceleration*dt;
        }
        check(speed>6&&speed<8&&peakDeceleration<2.4f,
            "coasting across a severe rolling-resistance transition preserves momentum without suppressing drag");
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
    check(!TerraSim::OutsideProvingGround(0,0,0),"normal proving-ground positions retain vehicle control");
    check(!TerraSim::OutsideProvingGround(56000,0,-3000),"recovery boundary retains its original inclusive limits");
    check(TerraSim::OutsideProvingGround(0,0,-3001),"a vehicle falling below the proving ground is recovered");
    check(TerraSim::OutsideProvingGround(56001,0,0)&&TerraSim::OutsideProvingGround(-56001,0,0),"recovery covers either horizontal direction");
    check(TerraSim::OutsideProvingGround(40000,40000,0),"recovery uses radial distance rather than a square bound");
    for(const auto loads: {std::array<float,4>{5000,5000,5000,5000},
                          std::array<float,4>{0,10000,10000,0},
                          std::array<float,4>{7000,0,5000,8000},
                          std::array<float,4>{0,0,0,20000}}){
        for(float dt:{.05f,.1f})for(float mu:{.2f,1.f}){
            const float mass=2250,slope=.45f,total=loads[0]+loads[1]+loads[2]+loads[3];
            float speed=0;bool bounded=true;
            for(int frame=0;frame<int(1/dt);++frame){
                float force=0;
                for(float load:loads){
                    const float share=TerraSim::SupportedBrakeMass(mass,load,total);
                    const float grip=mu*load;
                    const float hold=std::clamp(share*9.81f*std::sin(slope)-share*speed/dt,-grip,grip);
                    bounded&=std::abs(hold)<=grip+.001f;force+=hold;
                }
                speed+=(force/mass-9.81f*std::sin(slope))*dt;
            }
            check(mu>.5f?std::abs(speed)<.0001f:speed<-.5f,
                "brakes hold a slope through only the loaded tires, and still slide when available grip is insufficient");
            check(bounded,"slope holding never creates friction beyond the loaded tire budget");
        }
    }
    check(TerraSim::SupportedBrakeMass(2250,0,20000)==0,"an unloaded tire supplies no slope holding force");
    check(TerraSim::SupportedBrakeMass(2250,0,0)==0,"an airborne vehicle receives no artificial brake support");
    std::cout<<"PASS "<<count<<" native simulation core checks\n";
}
