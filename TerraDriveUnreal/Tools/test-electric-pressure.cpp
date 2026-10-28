#include "../Source/TerraDrive/TerraElectric.h"
#include "../Source/TerraDrive/TerraPressure.h"
#include "../Source/TerraDrive/TerraSimCore.h"
#include "../Source/TerraDrive/TerraContact.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>

namespace {
int checks=0;
void Check(bool condition,const char* name) {
    ++checks;
    if(!condition){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}
}
bool Near(float a,float b,float tolerance=.002f) {return std::abs(a-b)<=tolerance;}
float TotalTorque(const TerraSim::ElectricTorqueOutput& output) {
    float total=0;
    for(float torque:output.Axle)total+=torque;
    for(float torque:output.Wheel)total+=torque;
    return total;
}
float ChannelMagnitude(const TerraSim::ElectricTorqueOutput& output) {
    float total=0;
    for(float torque:output.Axle)total+=std::abs(torque);
    for(float torque:output.Wheel)total+=std::abs(torque);
    return total;
}
bool Finite(const TerraSim::ElectricTorqueOutput& output) {
    for(float torque:output.Axle)if(!std::isfinite(torque))return false;
    for(float torque:output.Wheel)if(!std::isfinite(torque))return false;
    for(float rpm:output.MotorRPM)if(!std::isfinite(rpm))return false;
    return std::isfinite(output.MechanicalPowerW)&&std::isfinite(output.RecoveredPowerW);
}
bool Finite(const TerraSim::PressureEffects& effects) {
    return std::isfinite(effects.RoadOptimumPSI)&&std::isfinite(effects.Ratio)&&
        std::isfinite(effects.LongitudinalGrip)&&std::isfinite(effects.LateralGrip)&&
        std::isfinite(effects.CorneringStiffness)&&std::isfinite(effects.SteeringResponse)&&
        std::isfinite(effects.RollingCoefficientAdd)&&std::isfinite(effects.FootprintMultiplier)&&std::isfinite(effects.Squirm);
}
}
int main() {
    using namespace TerraSim;
    const float zero[]={0,0,0,0};
    const float nan=std::numeric_limits<float>::quiet_NaN(),inf=std::numeric_limits<float>::infinity();
    Check(ResolveMotorLayout(0,0)==MotorLayout::None,"factory combustion remains combustion without a swap");
    Check(ResolveMotorLayout(0,3)==MotorLayout::Triple,"stock Hummer layout keeps its three motors");
    Check(ResolveMotorLayout(0,4)==MotorLayout::Quad,"stock G580 layout keeps four independent motors");
    Check(ResolveMotorLayout(1,4)==MotorLayout::Single&&ResolveMotorLayout(2,3)==MotorLayout::Dual&&ResolveMotorLayout(3,0)==MotorLayout::Quad,
        "explicit swaps replace rather than silently preserve factory topology");
    Check(ResolveMotorLayout(-5,4)==MotorLayout::Quad&&ResolveMotorLayout(99,0)==MotorLayout::Quad&&ResolveMotorLayout(0,99)==MotorLayout::None,
        "layout selection bounds persisted stages and rejects invalid factory metadata");
    Check(!ElectricAllWheelDrive(MotorLayout::Single)&&ElectricAllWheelDrive(MotorLayout::Dual)&&ElectricAllWheelDrive(MotorLayout::Triple)&&ElectricAllWheelDrive(MotorLayout::Quad),
        "multi-axle independent motors supply AWD without a mechanical transfer-case upgrade");
    Check(!IndependentElectricWheel(MotorLayout::Triple,0)&&IndependentElectricWheel(MotorLayout::Triple,2)&&IndependentElectricWheel(MotorLayout::Quad,0)&&
        !IndependentElectricWheel(MotorLayout::Quad,4)&&!IndependentElectricWheel(MotorLayout::Quad,-1),"independent wheel metadata respects the physical topology and wheel bounds");
    Check(MakeElectricSwap(0,200000,2100).Layout==MotorLayout::None&&MakeElectricSwap(0,200000,2100).NetMassKg==0,
        "no selected conversion creates no swap mass or motor");
    for(int count:{1,2,3,4}) {
        const auto factory=FactoryElectricConfig(count,432000,12000,10,16000);
        const auto drive=ElectricDriveTorque(factory,zero,1,1);
        Check(Near(TotalTorque(drive),12000,.02f),"factory summed wheel torque is preserved at launch without multiplying its reduction twice");
        Check(factory.NetMassKg==0&&factory.KitMassKg==0&&factory.BatteryKWh==0,"factory configuration leaves existing vehicle and battery mass intact");
        Check(ElectricMotorCount(factory.Layout)==count,"factory resolver reports actual motor count");
    }
    float lastLightPower=0,lastHeavyPower=0;
    for(int stage:{1,2,3}) {
        const auto light=MakeElectricSwap(stage,158000,1350),heavy=MakeElectricSwap(stage,619000,4100);
        Check(light.PowerW>lastLightPower&&heavy.PowerW>lastHeavyPower,"each motor kit has a discernible increasing power budget");
        Check(heavy.PowerW>light.PowerW&&heavy.PowerW<=650000,"heavy vehicles receive a bounded mass-aware rather than unlimited conversion");
        Check(light.NetMassKg>0&&light.KitMassKg>light.BatteryMassKg&&Near(light.NetMassKg,light.KitMassKg-light.RemovedDrivelineMassKg),
            "conversion mass accounts for battery plus hardware and donor removal exactly once");
        Check(light.BatteryKWh>0&&light.RegenPowerW<light.PowerW&&light.Efficiency<1,"conversion exposes battery mass and a limited regenerative budget");
        lastLightPower=light.PowerW;lastHeavyPower=heavy.PowerW;
    }
    const auto single=MakeElectricSwap(1,215000,2100),dual=MakeElectricSwap(2,215000,2100),quad=MakeElectricSwap(3,215000,2100);
    const auto rear=ElectricDriveTorque(single,zero,1,1),four=ElectricDriveTorque(single,zero,1,1,1,1,1,true);
    Check(rear.Axle[0]==0&&rear.Axle[1]>0&&ChannelMagnitude(rear)>0,"single motor normally powers the rear mechanical differential");
    Check(four.Axle[0]>0&&Near(four.Axle[0],four.Axle[1])&&Near(TotalTorque(four),TotalTorque(rear)),
        "single-motor transfer case divides existing torque across axles without creating a second motor");
    const auto two=ElectricDriveTorque(dual,zero,1,1),fourIndependent=ElectricDriveTorque(quad,zero,1,1);
    Check(two.Axle[0]>0&&two.Axle[1]>0&&two.Wheel[0]==0&&two.Wheel[3]==0,"dual motors retain a mechanical differential within each axle");
    Check(fourIndependent.Axle[0]==0&&fourIndependent.Axle[1]==0&&fourIndependent.Wheel[0]>0&&fourIndependent.Wheel[3]>0,
        "quad motors drive each wheel without imposing shared axle angular speed");
    const auto triple=FactoryElectricConfig(3,619000,15592,10,16000);
    const auto three=ElectricDriveTorque(triple,zero,1,1);
    Check(three.Axle[0]>0&&three.Axle[1]==0&&three.Wheel[0]==0&&three.Wheel[2]>0&&three.Wheel[3]>0,
        "factory tri-motor Hummer uses one front motor and independent rear motors");
    const auto openFront=SplitAxleTorque(three.Axle[0],0,2500,false);
    const float quadLoaded=fourIndependent.Wheel[1],tripleLoaded=three.Wheel[3];
    Check(openFront.right<=12.01f&&quadLoaded>500&&tripleLoaded>500,
        "diagonal wheel lift exposes open-differential limits while independent motors retain the other tire's own budget");
    for(float dt:{1.f/20,1.f/60,1.f/120}) {
        const float loaded=TractionControlledTorque(quadLoaded,0,0,.42f,3,dt,18000,4000,0,1);
        const float lifted=TractionControlledTorque(fourIndependent.Wheel[0],0,0,.42f,3,dt,0,0,0,1);
        Check(loaded>500&&loaded<=4000*.42f&&lifted==0,
            "independent motor traction control retains a loaded tire's bounded force without inventing force at a lifted tire");
    }
    const float ordinarySpeed[]={2,2,2,2},racingSpeed[]={80,80,80,80};
    const auto launch=ElectricDriveTorque(quad,ordinarySpeed,1,1),fast=ElectricDriveTorque(quad,racingSpeed,1,1);
    Check(Near(TotalTorque(launch),TotalTorque(fourIndependent),.01f),"motor supplies a constant low-speed torque plateau");
    Check(TotalTorque(fast)<TotalTorque(launch)&&Near(fast.MechanicalPowerW,quad.PowerW*quad.Efficiency,1.f),
        "torque falls with speed while total delivered mechanical power respects the motor rating");
    const float oneSpinning[]={180,2,2,2};
    const auto oneFast=ElectricDriveTorque(quad,oneSpinning,1,1);
    Check(oneFast.Wheel[0]<launch.Wheel[0]&&Near(oneFast.Wheel[1],launch.Wheel[1])&&Near(oneFast.Wheel[3],launch.Wheel[3]),
        "a spinning independent wheel cannot steal or donate unlimited motor torque to the other wheels");
    const float frontSpinning[]={180,180,2,2};
    const auto frontFast=ElectricDriveTorque(dual,frontSpinning,1,1),twoSlow=ElectricDriveTorque(dual,ordinarySpeed,1,1);
    Check(frontFast.Axle[0]<twoSlow.Axle[0]&&Near(frontFast.Axle[1],twoSlow.Axle[1]),
        "dual front motor reaches its own speed limit without cutting rear motor propulsion");
    const auto low=ElectricDriveTorque(single,zero,1,1,2.5f,1.35f,.92f);
    Check(Near(TotalTorque(low),TotalTorque(rear)*2.5f*1.35f*.92f,.02f),"low range and portals multiply launch torque while retaining drivetrain loss");
    const float cutoff=quad.MaxMotorRPM*6.28318530718f/(60*quad.Reduction);
    const float nearLimit[]={cutoff*.96f,cutoff*.96f,cutoff*.96f,cutoff*.96f},atLimit[]={cutoff,cutoff,cutoff,cutoff};
    const auto taper=ElectricDriveTorque(quad,nearLimit,1,1),off=ElectricDriveTorque(quad,atLimit,1,1);
    Check(taper.MechanicalPowerW>0&&taper.MechanicalPowerW<quad.PowerW*quad.Efficiency*.51f,"motor voltage limit tapers power smoothly before maximum shaft speed");
    Check(ChannelMagnitude(off)<.1f,"no motor produces propulsion beyond its shaft-speed limit");
    Check(ChannelMagnitude(ElectricDriveTorque(single,nearLimit,1,1,3))==0,"low gearing reduces available wheel speed as well as increasing wheel torque");
    for(int motors:{1,2,3,4})for(float speed:{0.f,1.f,20.f,80.f,200.f})for(int direction:{-1,1}) {
        const auto configuration=FactoryElectricConfig(motors,420000,13000,9.5f,16000);
        const float angular[]={direction*speed,direction*(speed*.8f),direction*(speed*.6f),direction*(speed*.3f)};
        const auto drive=ElectricDriveTorque(configuration,angular,.73f,direction,1.2f,1.18f,.93f,true);
        Check(Finite(drive)&&drive.MechanicalPowerW>=-.01f&&drive.MechanicalPowerW<=configuration.PowerW*configuration.Efficiency*.73f*.93f+1,
            "asymmetric per-motor speeds in forward and reverse conserve the combined power budget");
        Check(direction*TotalTorque(drive)>=0,"all requested motor channels use the selected drive direction");
    }
    Check(ChannelMagnitude(ElectricDriveTorque(quad,ordinarySpeed,1,0))==0&&ChannelMagnitude(ElectricDriveTorque(quad,ordinarySpeed,0,1))==0,
        "neutral direction and released throttle produce no propulsion");
    Check(ChannelMagnitude(ElectricDriveTorque(quad,nullptr,1,1))==0&&Finite(ElectricDriveTorque(MakeElectricSwap(3,nan,inf),zero,1,1)),
        "missing wheel state and invalid conversion input cannot create nonfinite drive torque");
    const float badAngular[]={nan,inf,-inf,0};
    Check(Finite(ElectricDriveTorque(quad,badAngular,1,1))&&ChannelMagnitude(ElectricDriveTorque(quad,zero,nan,1))==0,
        "nonfinite angular state and pedal input are safely bounded");
    const auto regen=ElectricRegen(quad,racingSpeed,1,0),halfRegen=ElectricRegen(quad,racingSpeed,1,0,.5f);
    Check(regen.MechanicalPowerW>0&&regen.MechanicalPowerW<=quad.RegenPowerW*quad.Efficiency+1&&regen.RecoveredPowerW<regen.MechanicalPowerW,
        "regenerative braking has its own smaller power budget and charging losses");
    Check(Near(halfRegen.MechanicalPowerW,regen.MechanicalPowerW*.5f,1)&&ChannelMagnitude(ElectricRegen(quad,racingSpeed,1,1,0))==0,
        "battery acceptance limits or disables regeneration without inventing an energy sink");
    const float reverseAngular[]={-80,-80,-80,-80};
    Check(Near(ChannelMagnitude(ElectricRegen(quad,reverseAngular,1,0)),ChannelMagnitude(regen)),
        "regeneration returns positive brake capacities in both travel directions");
    Check(ChannelMagnitude(ElectricRegen(quad,zero,1,1))==0&&ChannelMagnitude(ElectricRegen(quad,racingSpeed,0,0))==0,
        "regeneration neither holds stationary wheels nor brakes without a demand");
    const float crawl[]={.4f,.4f,.4f,.4f},transition[]={1.5f,1.5f,1.5f,1.5f};
    Check(ChannelMagnitude(ElectricRegen(quad,crawl,1,0))==0&&ChannelMagnitude(ElectricRegen(quad,transition,1,0))>0,
        "regeneration fades out near walking pace instead of applying discontinuous zero-speed torque");
    Check(ChannelMagnitude(ElectricRegen(single,racingSpeed,0,1))<ChannelMagnitude(ElectricRegen(single,racingSpeed,1,0)),
        "lift-off regeneration is deliberately weaker than full pedal braking");
    const float opposing[]={80,80,-20,-20},splitRotation[]={80,-20,80,-20};
    Check(ChannelMagnitude(ElectricRegen(single,opposing,1,0,1,1,1,1,true))==0,
        "one transfer-connected motor cannot claim independent regeneration from axles rotating in opposite directions");
    Check(ChannelMagnitude(ElectricRegen(dual,splitRotation,1,0))==0&&ChannelMagnitude(ElectricRegen(quad,splitRotation,1,0))>0,
        "opposed half shafts defer mechanical differential braking to friction while independent wheel motors can still regenerate");
    for(int direction:{-1,1}) {
        float wheelOmega=direction*3.f;
        bool noReverse=true;
        for(int n=0;n<120;++n){
            const float angular[]={wheelOmega,wheelOmega,wheelOmega,wheelOmega};
            const float drag=ElectricRegen(quad,angular,1,0).Wheel[0]+900;
            wheelOmega=BrakedWheelOmega(wheelOmega,0,0,.42f,1.f/60,3,0,drag);
            noReverse&=wheelOmega*direction>=0;
        }
        Check(noReverse,"implicit brake trajectory cannot use regeneration to drive a wheel through zero into reverse");
        Check(wheelOmega==0,"friction brakes finish the low-speed stop when generator torque has faded");
    }

    const auto bounds=PressureBounds(35,5000,5000);
    const auto proper=EvaluateTirePressure(35,35,5000,5000,20,0),lowRoad=EvaluateTirePressure(17.5f,35,5000,5000,20,0),highRoad=EvaluateTirePressure(55,35,5000,5000,20,0);
    Check(Near(proper.RoadOptimumPSI,35)&&Near(proper.LongitudinalGrip,1)&&Near(proper.LateralGrip,1)&&Near(proper.CorneringStiffness,1)&&Near(proper.SteeringResponse,1)&&proper.RollingCoefficientAdd==0,
        "stock loaded placard pressure retains the original road handling baseline");
    Check(lowRoad.LongitudinalGrip<.86f&&highRoad.LongitudinalGrip<.92f&&lowRoad.LateralGrip<proper.LateralGrip&&highRoad.LateralGrip<proper.LateralGrip,
        "both substantial underinflation and overinflation reduce road braking and cornering grip");
    Check(lowRoad.CorneringStiffness<.65f&&lowRoad.SteeringResponse<.60f&&lowRoad.RollingCoefficientAdd>.015f&&lowRoad.Squirm>0,
        "aired-down road tires steer more slowly, squirm, and lose energy rather than receive free grip");
    const float properStop=20*20/(2*.95f*9.81f*proper.LongitudinalGrip),lowStop=20*20/(2*.95f*9.81f*lowRoad.LongitudinalGrip),highStop=20*20/(2*.95f*9.81f*highRoad.LongitudinalGrip);
    Check(lowStop>properStop*1.15f&&highStop>properStop*1.1f,"pressure grip produces materially longer friction-limited braking distances at inappropriate road pressures");
    const auto softProper=EvaluateTirePressure(35,35,5000,5000,3,1),softLow=EvaluateTirePressure(21,35,5000,5000,3,1);
    Check(softLow.LongitudinalGrip>softProper.LongitudinalGrip&&softLow.LongitudinalGrip<=1.165f&&softLow.FootprintMultiplier>1.5f,
        "moderate airing down provides a bounded compliant-grip and flotation benefit on soft ground");
    const auto veryLow=EvaluateTirePressure(8,35,5000,5000,3,1),softFast=EvaluateTirePressure(21,35,5000,5000,25,1);
    Check(veryLow.LongitudinalGrip<softLow.LongitudinalGrip&&softFast.LongitudinalGrip<softLow.LongitudinalGrip&&softFast.SteeringResponse<softLow.SteeringResponse,
        "extreme airing down and excessive speed consume rather than amplify the soft-ground benefit");
    const float normalFootprint=FootprintLength(5000,35,.285f,.42f,false),airedFootprint=FootprintLength(5000,21,.285f,.42f,false);
    const auto normalSoil=SoftSoilFootprint(normalFootprint,5000,.285f,.42f,.36f,.08f,0),airedSoil=SoftSoilFootprint(airedFootprint,5000,.285f,.42f,.36f,.08f,0);
    Check(airedFootprint>normalFootprint&&5000/(airedFootprint*.285f)<5000/(normalFootprint*.285f),"existing physical footprint responds to actual PSI by spreading supported load");
    Check(airedSoil.Depth<=normalSoil.Depth+.0001f&&airedSoil.Length>=normalSoil.Length-.0001f,"soft-ground flotation couples pressure, rolling contact area, and sink without enlarging a tire twice");
    Check(LoadedRoadPressure(35,7000,5000)>35&&LoadedRoadPressure(35,4000,5000)<35,"upgrade and payload mass shift pressure relative to the stock reference load");
    Check(EvaluateTirePressure(35,35,7000,5000,20,0).LongitudinalGrip<proper.LongitudinalGrip,"unchanged PSI is underinflated after a substantial added static load");
    Check(LoadedRoadPressure(65,100000,5000)==65&&LoadedRoadPressure(20,0,5000)==20,"load-relative road optimum remains within the supported game tire range");
    Check(bounds.MinimumPSI>=10&&bounds.MaximumPSI==65&&PressureBounds(45,10000,5000).MinimumPSI>bounds.MinimumPSI,
        "minimum off-road pressure respects vehicle load rather than compressor upgrade tier");
    for(float speed:{-25.f,-3.f,0.f,3.f,25.f})for(float psi:{8.f,17.5f,35.f,65.f,90.f}) {
        const auto road=EvaluateTirePressure(psi,35,5000,5000,speed,0),soft=EvaluateTirePressure(psi,35,5000,5000,speed,1),mix=EvaluateTirePressure(psi,35,5000,5000,speed,.5f);
        Check(Finite(road)&&Finite(soft)&&road.LongitudinalGrip>0&&soft.LongitudinalGrip>0&&road.LateralGrip>0&&soft.LateralGrip>0,
            "pressure sweep retains finite positive grip across realistic and extreme test pressures");
        Check(Near(mix.LongitudinalGrip,(road.LongitudinalGrip+soft.LongitudinalGrip)*.5f)&&Near(mix.LateralGrip,(road.LateralGrip+soft.LateralGrip)*.5f),
            "blended terrain transitions interpolate pressure behavior continuously");
    }
    const auto tracked=EvaluateTirePressure(10,45,10000,5000,20,1,true);
    Check(tracked.LongitudinalGrip==1&&tracked.LateralGrip==1&&tracked.SteeringResponse==1&&tracked.RollingCoefficientAdd==0&&tracked.FootprintMultiplier==1,
        "rubber track contact does not inherit an inflated tire pressure advantage or penalty");
    Check(Finite(EvaluateTirePressure(nan,nan,nan,nan,nan,nan))&&Finite(EvaluateTirePressure(inf,-inf,-inf,0,inf,2)),
        "invalid pressure inputs cannot poison vehicle forces with nonfinite values");
    Check(Near(TireAirVolumeScale(.42f,.285f),1)&&TireAirVolumeScale(.48f,.34f)>1&&TireAirVolumeScale(.32f,.20f)<1,
        "larger tires take longer and small tires take less time to change pressure");
    for(int stage:{0,1,2,3}) {
        const auto hardware=ResolveTireAirHardware(stage);
        const float allowed=stage==0?0:hardware.MaximumSpeedMPS*.5f;
        Check(!TireAirCanOperate(hardware,hardware.MaximumSpeedMPS+.1f,true,false),"every air system pauses beyond its hardware operating speed");
        Check(AdvanceTirePressure(35,20,0,hardware,allowed,true,bounds)==35&&AdvanceTirePressure(35,20,-1,hardware,allowed,true,bounds)==35,
            "zero or negative elapsed time cannot change pressure");
        Check(AdvanceTirePressure(35,20,1,hardware,hardware.MaximumSpeedMPS+.1f,true,bounds)==35,
            "queued target does not instantly deflate while the hardware is speed-interlocked");
        if(stage==0){
            Check(AdvanceTirePressure(20,35,100,hardware,0,true,bounds)==20,"stock manual valves cannot inflate without an installed air supply");
            Check(AdvanceTirePressure(35,20,10,hardware,0,false,bounds)<35,"stock manual valves can bleed air while stopped without electrical power");
        }else{
            Check(AdvanceTirePressure(20,35,1,hardware,allowed,true,bounds)>20&&AdvanceTirePressure(35,20,1,hardware,allowed,true,bounds)<35,
                "all three fitted CTIS tiers genuinely inflate and deflate while moving within their limits");
            Check(AdvanceTirePressure(20,35,30,hardware,allowed,false,bounds)==20&&AdvanceTirePressure(35,20,30,hardware,allowed,false,bounds)==35,
                "an unpowered electronic air system cannot change pressure in either direction");
            Check(AdvanceTirePressure(20,35,1,hardware,allowed,true,bounds)<21&&AdvanceTirePressure(35,20,1,hardware,allowed,true,bounds)>34,
                "air-pressure commands begin a finite process rather than an instant multi-PSI jump");
        }
        for(float dt:{1.f/20,1.f/30,1.f/60,1.f/120}) {
            float pressure=35;
            for(int n=0;n<int(std::round(30/dt));++n)pressure=AdvanceTirePressure(pressure,20,dt,hardware,allowed,true,bounds);
            const float expected=std::max(20.f,35-30*hardware.DeflatePSIPerSecond);
            Check(Near(pressure,expected,.015f),"thirty seconds of deflation matches hardware flow across frame rates");
            if(stage>0){
                pressure=20;
                for(int n=0;n<int(std::round(30/dt));++n)pressure=AdvanceTirePressure(pressure,35,dt,hardware,allowed,true,bounds);
                Check(Near(pressure,std::min(35.f,20+30*hardware.InflatePSIPerSecond),.015f),"inflation duration is frame-rate independent and cannot overshoot target");
            }
        }
    }
    const auto basic=ResolveTireAirHardware(1),middle=ResolveTireAirHardware(2),fastAir=ResolveTireAirHardware(3);
    Check(basic.MaximumSpeedMPS==2.2352f&&middle.MaximumSpeedMPS==11.176f&&fastAir.MaximumSpeedMPS==17.8816f,"fitted CTIS limits are 5, 25 and 40 mph in the simulation");
    Check(AdvanceTirePressure(20,35,30,basic,0,true,bounds)<AdvanceTirePressure(20,35,30,middle,0,true,bounds)&&
        AdvanceTirePressure(20,35,30,middle,0,true,bounds)<AdvanceTirePressure(20,35,30,fastAir,0,true,bounds),"each air-system upgrade delivers a discernible faster pressure change");
    Check(AdvanceTirePressure(20,35,30,fastAir,0,true,bounds,2)<AdvanceTirePressure(20,35,30,fastAir,0,true,bounds,1),
        "compressor rate is shared with the larger air volume rather than magically constant for all tire sizes");
    Check(AdvanceTirePressure(35,100,10000,fastAir,0,true,bounds)==bounds.MaximumPSI&&
        AdvanceTirePressure(35,-100,10000,fastAir,0,true,bounds)==bounds.MinimumPSI,"extreme requested targets stop at supported pressure bounds");
    Check(AdvanceTirePressure(35,20,nan,fastAir,0,true,bounds)==35&&std::isfinite(AdvanceTirePressure(nan,inf,1,fastAir,0,true,bounds,nan)),
        "invalid air timing, target and tire volume inputs remain finite without a pressure teleport");
    std::cout<<"PASS "<<checks<<" electric and pressure checks\n";
    return 0;
}
