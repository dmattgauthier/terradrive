#include "../Source/TerraDrive/TerraSimCore.h"
#include <cstdlib>
#include <iostream>
#include <limits>

static int count=0;
void check(bool value,const char* name){++count;if(!value){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}}
int main(){
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
