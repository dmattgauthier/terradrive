#pragma once
#include <algorithm>
#include <cmath>

// Portable drivetrain helpers. Torques are N m, power W, mass kg, angular
// speed rad/s. Wheel order: front left/right, rear left/right.
namespace TerraSim {
enum class MotorLayout { None=0, Single=1, Dual=2, Triple=3, Quad=4 };

inline MotorLayout ResolveMotorLayout(int swapStage,int factoryMotorCount) {
    const int stage=std::clamp(swapStage,0,3);
    // Conversion on an already-electric donor means an ICE swap. Its factory
    // motor count is never replaced with a single/dual/quad electric topology.
    if(factoryMotorCount>0&&stage>0)return MotorLayout::None;
    if(stage>0)return stage==1?MotorLayout::Single:stage==2?MotorLayout::Dual:MotorLayout::Quad;
    return factoryMotorCount>=1&&factoryMotorCount<=4?static_cast<MotorLayout>(factoryMotorCount):MotorLayout::None;
}
inline int ElectricMotorCount(MotorLayout layout) {return static_cast<int>(layout);}
inline bool IndependentElectricWheel(MotorLayout layout,int wheel) {
    return wheel>=0&&wheel<4&&(layout==MotorLayout::Quad||(layout==MotorLayout::Triple&&wheel>=2));
}
inline bool ElectricAllWheelDrive(MotorLayout layout) {
    return layout==MotorLayout::Dual||layout==MotorLayout::Triple||layout==MotorLayout::Quad;
}

struct ElectricConfiguration {
    MotorLayout Layout=MotorLayout::None;
    float PowerW=0,PeakWheelTorqueNm=0,Reduction=1,MaxMotorRPM=16000,Efficiency=.95f;
    float NetMassKg=0,KitMassKg=0,RemovedDrivelineMassKg=0,BatteryMassKg=0,BatteryKWh=0;
    float RegenPowerW=0,FrontShare=.5f;
};

// Fictional gasoline conversion hardware for a factory EV. Stage zero means
// retain the factory EV; these figures are not an OEM retrofit specification.
struct CombustionConfiguration {
    int Stage=0;
    float PowerW=0,PeakTorqueNm=0,IdleRPM=750,RedlineRPM=6500,StallRPM=2400;
    float FinalDrive=4.10f,ReverseRatio=3.30f;
    float GearRatios[8]={4.71f,3.14f,2.10f,1.67f,1.29f,1.f,.84f,.67f};
    float KitMassKg=0,RemovedDrivelineMassKg=0,NetMassKg=0;
};
inline CombustionConfiguration MakeCombustionSwap(int stage,int factoryMotorCount,float batteryKWh,float removedHardwareKg=0) {
    CombustionConfiguration config;
    if(factoryMotorCount<1||factoryMotorCount>4)return config;
    config.Stage=std::clamp(stage,0,3);if(config.Stage==0)return config;
    const float hp[]={0,350,500,700},torque[]={0,475,650,900},mass[]={0,490,535,590};
    config.PowerW=hp[config.Stage]*745.7f;config.PeakTorqueNm=torque[config.Stage];config.KitMassKg=mass[config.Stage];
    const float pack=std::isfinite(batteryKWh)?std::clamp(batteryKWh,1.f,250.f):100.f;
    config.RemovedDrivelineMassKg=std::isfinite(removedHardwareKg)&&removedHardwareKg>0?removedHardwareKg:
        pack/.185f+factoryMotorCount*75.f+70.f;
    config.NetMassKg=config.KitMassKg-config.RemovedDrivelineMassKg;
    return config;
}
inline float CombustionSwapTorque(const CombustionConfiguration& config,float rpm) {
    if(config.Stage==0||!std::isfinite(rpm))return 0;
    const float speed=std::max(0.f,rpm);
    const float rise=std::clamp((speed-config.IdleRPM)/2000.f,0.f,1.f);
    const float curve=config.PeakTorqueNm*(.52f+.48f*rise);
    const float powerCap=config.PowerW/std::max(1.f,speed*6.28318530718f/60.f);
    const float limit=std::clamp((config.RedlineRPM+150.f-speed)/150.f,0.f,1.f);
    return std::min(curve,powerCap)*limit;
}

namespace ElectricDetail {
inline float Finite(float value,float fallback=0) {return std::isfinite(value)?value:fallback;}
inline float Nonnegative(float value) {return std::max(0.f,Finite(value));}
inline float Unit(float value) {return std::clamp(Finite(value),0.f,1.f);}
inline float ShaftRPM(float omega,float ratio) {return std::abs(Finite(omega))*ratio*60.f/6.28318530718f;}
inline float AxleSpeed(const float *omega,int axle) {
    return omega?(Finite(omega[axle*2])+Finite(omega[axle*2+1]))*.5f:0;
}
// Constant torque below base speed, constant shaft power above it, and a
// continuous voltage/speed-limit taper over the final 8% of motor speed.
inline float ChannelTorque(const ElectricConfiguration& config,float fraction,float omega,
                           float lowRatio,float portalRatio,float efficiencyScale) {
    const float ratio=std::max(.1f,Finite(config.Reduction,1))*lowRatio*portalRatio;
    const float rpm=ShaftRPM(omega,ratio),maximum=std::max(1000.f,Finite(config.MaxMotorRPM,16000));
    const float headroom=std::clamp((maximum-rpm)/(maximum*.08f),0.f,1.f);
    const float torque=Nonnegative(config.PeakWheelTorqueNm)*fraction*lowRatio*portalRatio;
    const float power=Nonnegative(config.PowerW)*Unit(config.Efficiency)*fraction;
    const float cap=power/std::max(.01f,std::abs(Finite(omega)));
    return std::min(torque,cap)*headroom*efficiencyScale;
}
}

// This only describes a factory drivetrain: stage zero adds no swap mass.
// PeakWheelTorqueNm is already the published/roster summed wheel torque at
// nominal reduction; do not multiply it by Reduction again at integration.
inline ElectricConfiguration FactoryElectricConfig(int motorCount,float powerW,float wheelTorqueNm,
                                                    float reduction=9.f,float maxMotorRPM=16000.f) {
    ElectricConfiguration config;
    config.Layout=ResolveMotorLayout(0,motorCount);
    if(config.Layout==MotorLayout::None)return config;
    config.PowerW=ElectricDetail::Nonnegative(powerW);
    config.PeakWheelTorqueNm=ElectricDetail::Nonnegative(wheelTorqueNm);
    config.Reduction=std::max(.1f,ElectricDetail::Finite(reduction,9));
    config.MaxMotorRPM=std::max(1000.f,ElectricDetail::Finite(maxMotorRPM,16000));
    config.RegenPowerW=config.PowerW*.23f;
    config.FrontShare=config.Layout==MotorLayout::Triple?1.f/3.f:.5f;
    return config;
}

// Fictional conversion kits, not manufacturer retrofit specifications. The
// mass-aware caps keep a light car's conversion below a heavy SUV's budget.
// NetMassKg is relative to an ICE donor. Factory EVs retain their original
// motors or use MakeCombustionSwap; this helper does not replace EV topology.
inline ElectricConfiguration MakeElectricSwap(int stage,float stockPowerW,float stockMassKg) {
    ElectricConfiguration config;
    stage=std::clamp(stage,0,3);
    if(stage==0)return config;
    const float mass=std::clamp(ElectricDetail::Finite(stockMassKg,2100),1000.f,4500.f);
    const float size=std::clamp(mass/2100.f,.65f,1.45f);
    const float performance=std::clamp(ElectricDetail::Nonnegative(stockPowerW)/(mass*100.f),.80f,1.15f);
    const float powers[]={0,210000,340000,520000};
    const float minimum[]={0,120000,200000,300000},maximum[]={0,300000,480000,650000};
    const float reduction[]={1,9.2f,9.5f,9.8f},rpm[]={0,14500,16000,17500};
    const float baseOmega[]={1,420,400,380},netMass[]={0,260,360,470},battery[]={0,65,80,95};
    config.Layout=ResolveMotorLayout(stage,0);
    config.PowerW=std::clamp(powers[stage]*size*performance,minimum[stage],maximum[stage]);
    config.Reduction=reduction[stage];config.MaxMotorRPM=rpm[stage];config.Efficiency=.94f;
    config.PeakWheelTorqueNm=config.PowerW/baseOmega[stage]*config.Reduction*config.Efficiency;
    config.NetMassKg=netMass[stage];
    config.RemovedDrivelineMassKg=std::clamp(mass*.125f,180.f,430.f);
    config.KitMassKg=config.NetMassKg+config.RemovedDrivelineMassKg;
    config.BatteryKWh=battery[stage];config.BatteryMassKg=config.BatteryKWh/.185f;
    config.RegenPowerW=config.PowerW*.24f;config.FrontShare=.45f;
    return config;
}

struct ElectricTorqueOutput {
    // Feed Axle through the existing mechanical differential. Wheel outputs
    // bypass that differential and its locked-shaft angular-speed constraint.
    float Axle[2]={},Wheel[4]={};
    bool Independent[4]={};
    float MotorRPM[4]={};
    float MechanicalPowerW=0,RecoveredPowerW=0;
};

inline ElectricTorqueOutput ElectricDriveTorque(const ElectricConfiguration& config,const float *omega,
    float throttle,int direction,float lowRatio=1,float portalRatio=1,float efficiencyScale=1,bool frontConnected=false) {
    ElectricTorqueOutput output;
    if(!omega||config.Layout==MotorLayout::None)return output;
    const float demand=ElectricDetail::Unit(throttle)*(direction<0?-1.f:direction>0?1.f:0.f);
    const float low=std::max(1.f,ElectricDetail::Finite(lowRatio,1));
    const float portal=std::max(1.f,ElectricDetail::Finite(portalRatio,1));
    const float efficiency=ElectricDetail::Unit(efficiencyScale);
    const float reduction=std::max(.1f,ElectricDetail::Finite(config.Reduction,1))*low*portal;
    auto axle=[&](int a,float fraction){
        const float speed=ElectricDetail::AxleSpeed(omega,a);
        output.Axle[a]=ElectricDetail::ChannelTorque(config,fraction,speed,low,portal,efficiency)*demand;
        output.MotorRPM[a]=ElectricDetail::ShaftRPM(speed,reduction);
    };
    auto wheel=[&](int i,float fraction){
        output.Independent[i]=true;
        output.Wheel[i]=ElectricDetail::ChannelTorque(config,fraction,omega[i],low,portal,efficiency)*demand;
        output.MotorRPM[i]=ElectricDetail::ShaftRPM(omega[i],reduction);
    };
    const float front=std::clamp(ElectricDetail::Finite(config.FrontShare,.5f),.05f,.95f);
    if(config.Layout==MotorLayout::Single){
        const float speed=frontConnected?(ElectricDetail::AxleSpeed(omega,0)+ElectricDetail::AxleSpeed(omega,1))*.5f:
                                         ElectricDetail::AxleSpeed(omega,1);
        const float torque=ElectricDetail::ChannelTorque(config,1,speed,low,portal,efficiency)*demand;
        output.Axle[0]=frontConnected?torque*.5f:0;output.Axle[1]=frontConnected?torque*.5f:torque;
        output.MotorRPM[0]=ElectricDetail::ShaftRPM(speed,reduction);
    }else if(config.Layout==MotorLayout::Dual){axle(0,front);axle(1,1-front);}
    else if(config.Layout==MotorLayout::Triple){axle(0,front);wheel(2,(1-front)*.5f);wheel(3,(1-front)*.5f);}
    else if(config.Layout==MotorLayout::Quad){
        wheel(0,front*.5f);wheel(1,front*.5f);wheel(2,(1-front)*.5f);wheel(3,(1-front)*.5f);
    }
    for(int a=0;a<2;++a)output.MechanicalPowerW+=output.Axle[a]*ElectricDetail::AxleSpeed(omega,a);
    for(int i=0;i<4;++i)output.MechanicalPowerW+=output.Wheel[i]*ElectricDetail::Finite(omega[i]);
    return output;
}

// Positive brake-torque capacities for the implicit wheel/axle brake solver.
// Never apply these as an unbounded signed drive torque: a stopped wheel must
// not be pushed into reverse by regenerative braking. Friction brakes still
// supply the remaining requested deceleration and the stationary holding load.
inline ElectricTorqueOutput ElectricRegen(const ElectricConfiguration& config,const float *omega,
    float brake,float coast,float acceptance=1,float lowRatio=1,float portalRatio=1,
    float efficiencyScale=1,bool frontConnected=false) {
    ElectricConfiguration regenerative=config;
    const float accepting=ElectricDetail::Unit(acceptance);
    regenerative.PowerW=std::min(ElectricDetail::Nonnegative(config.PowerW),
                                ElectricDetail::Nonnegative(config.RegenPowerW))*accepting;
    regenerative.PeakWheelTorqueNm=ElectricDetail::Nonnegative(config.PeakWheelTorqueNm)*.24f*accepting;
    const float demand=std::max(ElectricDetail::Unit(brake),ElectricDetail::Unit(coast)*.35f);
    auto output=ElectricDriveTorque(regenerative,omega,demand,1,lowRatio,portalRatio,efficiencyScale,frontConnected);
    if(!omega)return output;
    auto counterRotating=[&](int first,int last){
        bool positive=false,negative=false;
        for(int i=first;i<last;++i){const float speed=ElectricDetail::Finite(omega[i]);positive|=speed>.5f;negative|=speed<-.5f;}
        return positive&&negative;
    };
    // A mechanical motor cannot independently oppose counter-rotating half
    // shafts with two positive brake capacities. In that unusual articulation
    // state let the friction brake handle the stop; quad channels remain free
    // to generate in opposite directions. This prevents fictitious recovery.
    if(config.Layout==MotorLayout::Single&&frontConnected&&counterRotating(0,4))output.Axle[0]=output.Axle[1]=0;
    else for(int a=0;a<2;++a)if(counterRotating(a*2,a*2+2))output.Axle[a]=0;
    auto fade=[](float speed){return std::clamp((std::abs(ElectricDetail::Finite(speed))-.5f)/2.f,0.f,1.f);};
    if(config.Layout==MotorLayout::Single&&frontConnected){
        const float f=fade((ElectricDetail::AxleSpeed(omega,0)+ElectricDetail::AxleSpeed(omega,1))*.5f);
        output.Axle[0]*=f;output.Axle[1]*=f;
    }else for(int a=0;a<2;++a)output.Axle[a]*=fade(ElectricDetail::AxleSpeed(omega,a));
    for(int i=0;i<4;++i)output.Wheel[i]*=fade(omega[i]);
    output.MechanicalPowerW=0;
    for(int a=0;a<2;++a)output.MechanicalPowerW+=output.Axle[a]*std::abs(ElectricDetail::AxleSpeed(omega,a));
    for(int i=0;i<4;++i)output.MechanicalPowerW+=output.Wheel[i]*std::abs(ElectricDetail::Finite(omega[i]));
    output.RecoveredPowerW=output.MechanicalPowerW*.82f;
    return output;
}
}
