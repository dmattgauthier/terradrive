#include "../Source/TerraDrive/TerraUpgrades.h"
#include "../Source/TerraDrive/TerraContact.h"
#include "../Source/TerraDrive/TerraCenter.h"
#include "../Source/TerraDrive/TerraElectric.h"
#include <array>
#include <cstdio>
#include <cstdlib>
#include <limits>

int Checks=0;
void Check(bool pass,const char* name){++Checks;if(!pass){std::fprintf(stderr,"FAIL: %s\n",name);std::exit(1);}}
struct Trial {
    std::array<float,4> Previous{},Omega{},Speed{},C{},Limit{},Drive{},Lateral{},Drag{};
    bool FrontLocked=false,RearLocked=false;
    float Dt=.016666667f,Inertia=3,Radius=.45f;
    float Solve(float center){
        Omega=Previous;
        for(int axle=0;axle<2;++axle){const int a=axle*2,b=a+1;const float transfer=axle?-center:center;
            if(axle?RearLocked:FrontLocked){
                const float free=(Previous[a]+Previous[b])*.5f+(Drive[a]+Drive[b]+transfer)*Dt/(2*Inertia);
                Omega[a]=Omega[b]=TerraSim::CombinedAxleOmega(free,C[a],C[b],Speed[a],Speed[b],Limit[a],Limit[b],Lateral[a],Lateral[b],Radius,Dt,2*Inertia,Drag[a]+Drag[b]);
            }else for(int i=a;i<=b;++i){
                const float free=Previous[i]+(Drive[i]+transfer*.5f)*Dt/Inertia;
                Omega[i]=TerraSim::CombinedWheelOmega(free,C[i],Speed[i],Radius,Dt,Inertia,Limit[i],Lateral[i],Drag[i]);
            }
        }
        return (Omega[0]+Omega[1]-Omega[2]-Omega[3])*.5f;
    }
    float Couple(float rating=50000){const float torque=TerraSim::SolveCenterCoupling(rating,[&](float t){return Solve(t);});Solve(torque);return torque;}
    float Force()const {float f=0;for(int i=0;i<4;++i)f+=TerraSim::CombinedLongitudinal(Omega[i],C[i],Speed[i],Radius,Limit[i],Lateral[i]);return f;}
};
int main(){
    using namespace TerraSim;
    Check(CenterDifferential==12&&PartCount==13,"center appends without moving existing upgrade slots");
    for(int version=1;version<=6;++version){
        const int count=version<=2?7:version==3?10:version<=5?12:13;
        Check(UpgradeStageCountForVersion(version)==count,"historical save row lengths remain explicit");
        double data[13]={};for(int i=0;i<count;++i)data[i]=i%4;
        UpgradeSetup result;Check(DecodeUpgradeStages(data,count,version,true,result),"all supported save versions decode");
        Check(result.Stage[CenterDifferential]==(version==6?int(data[12]):0),"old saves default center kit to stock");
    }
    double data[13]={};data[12]=2;UpgradeSetup kept;
    Check(DecodeUpgradeStages(data,13,6,true,kept)&&kept.Stage[CenterDifferential]==2,"v6 preserves center kit stage");
    for(float invalid:{-1.f,4.f,.5f,std::numeric_limits<float>::infinity(),std::numeric_limits<float>::quiet_NaN()}){
        data[12]=invalid;UpgradeSetup after=kept;
        Check(!DecodeUpgradeStages(data,13,6,true,after)&&after.Stage[CenterDifferential]==2,"invalid center stage rejected atomically");
    }
    Check(!DecodeUpgradeStages(data,12,6,true,kept)&&!DecodeUpgradeStages(data,13,5,true,kept),"save length cannot silently expand historical versions");
    FactoryDrivetrain factory;factory.FourDrive=true;factory.LowRatio=4;
    UpgradeSetup stock;auto caps=ResolveDriveCapabilities(stock,factory);
    Check(caps.RigidTransfer&&!caps.CenterLocker&&!caps.Permanent,"part-time transfer is intrinsically coupled without a fake center diff");
    for(int stage=1;stage<=3;++stage){
        UpgradeSetup kit;kit.Stage[CenterDifferential]=stage;caps=ResolveDriveCapabilities(kit,factory);
        Check(caps.CenterLocker&&caps.Permanent&&!caps.RigidTransfer,"retrofit supplies full-time open center and selectable lock");
        Check(caps.HardwareMass==CenterHardwareMass(stage),"center retrofit adds actual hardware mass");
        Check(CenterRatedTorque(stage,false,2100,.45f)>CenterRatedTorque(stage-1,false,2100,.45f),"successive center cases increase rated transferable shaft torque");
    }
    FactoryDrivetrain g63;g63.FourDrive=g63.Permanent=g63.CenterLocker=true;g63.LowRatio=2.93f;
    caps=ResolveDriveCapabilities(stock,g63);Check(caps.CenterLocker&&caps.Permanent&&!caps.RigidTransfer&&caps.HardwareMass==0,"factory G63 center locker retained without aftermarket mass");
    FactoryDrivetrain fwd;fwd.FrontPrimary=true;UpgradeSetup kit;kit.Stage[CenterDifferential]=3;
    caps=ResolveDriveCapabilities(kit,fwd);Check(!caps.CenterLocker&&!caps.FourDrive&&caps.HardwareMass==0,"center kit alone cannot invent a second driven axle");
    kit.Stage[Drivetrain]=1;caps=ResolveDriveCapabilities(kit,fwd);Check(caps.CenterLocker&&caps.FourDrive&&caps.Permanent,"converted FWD can use full-time center hardware once second axle fitted");
    Check(CenterShiftAllowed(true,true,true,0,0,0),"stationary unloaded center selector permitted");
    Check(!CenterShiftAllowed(false,true,true,0,0,0)&&!CenterShiftAllowed(true,false,true,0,0,0),"missing hardware or second driven axle blocks selector");
    Check(!CenterShiftAllowed(true,true,true,1,0,0)&&!CenterShiftAllowed(true,true,true,-1,0,0),"shift denied while moving either direction");
    Check(!CenterShiftAllowed(true,true,true,0,.2f,0)&&!CenterShiftAllowed(true,true,true,0,0,3),"loaded engine or axle windup prevents shift");
    Check(!CenterShiftAllowed(true,true,true,std::numeric_limits<float>::quiet_NaN(),0,0),"nonfinite selector input rejected");
    const auto a=OpenCenterTorque(3000,0,5000,.4f),b=OpenCenterTorque(-3000,0,5000,.4f);
    Check(a.Front+a.Rear<61&&a.Front>0&&a.Rear>0,"airborne front axle limits open center through real shaft torque");
    Check(b.Front==-a.Front&&b.Rear==-a.Rear,"open center reverse torque is symmetric");
    Check(CenterAxleCapacity(5000,0,false,false)==0&&CenterAxleCapacity(5000,0,true,false)==5000,"center considers open versus locked axle capacity rather than summing a free spinning wheel");
    for(float dt:{.005f,1.f/60,.05f,.1f})for(float direction:{-1.f,1.f})for(int locks=0;locks<4;++locks){
        Trial t;t.Dt=dt;t.Previous={12*direction,7*direction,2*direction,-direction};t.FrontLocked=locks&1;t.RearLocked=locks&2;
        const auto before=t.Previous;const float torque=t.Couple();
        const float error=(t.Omega[0]+t.Omega[1]-t.Omega[2]-t.Omega[3])*.5f;
        Check(std::abs(error)<.005f,"locked center equalizes axle means in forward and reverse across frame lengths");
        float sumBefore=0,sumAfter=0,energyBefore=0,energyAfter=0;
        for(int i=0;i<4;++i){sumBefore+=before[i];sumAfter+=t.Omega[i];energyBefore+=before[i]*before[i];energyAfter+=t.Omega[i]*t.Omega[i];}
        Check(std::abs(sumBefore-sumAfter)<.0001f,"center shaft reaction conserves wheel angular momentum");
        Check(energyAfter<=energyBefore+.001f&&std::isfinite(torque),"constraint dissipates relative motion without adding kinetic energy");
        if(!(locks&1))Check(std::abs((t.Omega[0]-t.Omega[1])-(before[0]-before[1]))<.0001f,"center lock leaves front open differential free across corners");
        if(!(locks&2))Check(std::abs((t.Omega[2]-t.Omega[3])-(before[2]-before[3]))<.0001f,"center lock leaves rear open differential free across corners");
    }
    for(float direction:{-1.f,1.f}){
        Trial open;open.C={0,0,8000,8000};open.Limit={0,0,5000,5000};open.Drive={a.Front*.5f*direction,a.Front*.5f*direction,a.Rear*.5f*direction,a.Rear*.5f*direction};open.Solve(0);
        Trial locked=open;locked.Drive={750*direction,750*direction,750*direction,750*direction};locked.Couple();
        Check(std::abs(locked.Force())>std::abs(open.Force())*5,"locked center transfers real engine torque from lifted axle to gripped axle");
        Check(std::abs((locked.Omega[0]+locked.Omega[1]-locked.Omega[2]-locked.Omega[3])*.5f)<.005f,"loaded contact equations retain equal axle means");
    }
    std::printf("PASS center differential: %d meaningful checks\n",Checks);
}
