#include "../Source/TerraDrive/TerraTandem.h"
#include "../Source/TerraDrive/TerraSimCore.h"
#include "../Source/TerraDrive/TerraContact.h"
#include <cstdlib>
#include <iostream>
#include <limits>
int main(){
  int checks=0;auto check=[&](bool ok,const char* name){++checks;if(!ok){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}};
  using namespace TerraSim;
  for(float dt:{1.f/20,1.f/60,1.f/120})for(int direction:{-1,1}){
    const float omega[]={18.f*direction,9.f*direction,3.f*direction},inertia[]={8.f,5.f,11.f};
    auto evaluate=[&](float c,float t){const float a=omega[0]+c*dt/inertia[0],b=omega[1]+(-c*.5f+t)*dt/inertia[1],d=omega[2]+(-c*.5f-t)*dt/inertia[2];return TandemResidual{a-(b+d)*.5f,b-d};};
    const auto q=SolveTandemCoupling(100000,true,true,evaluate);const auto r=evaluate(q.Center,q.Tandem);
    check(std::abs(r.Center)<.002f&&std::abs(r.Tandem)<.002f,"two shaft constraints converge in forward/reverse at multiple tick rates");
    const float a=omega[0]+q.Center*dt/inertia[0],b=omega[1]+(-q.Center*.5f+q.Tandem)*dt/inertia[1],d=omega[2]+(-q.Center*.5f-q.Tandem)*dt/inertia[2];
    check(std::abs(inertia[0]*(a-omega[0])+inertia[1]*(b-omega[1])+inertia[2]*(d-omega[2]))<.002f,"shaft reaction torques preserve total angular momentum");
    const auto limited=SolveTandemCoupling(10,true,true,evaluate);
    check(std::abs(limited.Center)<=10&&std::abs(limited.Tandem)<=10,"overloaded shaft locks stay within their physical torque rating");
    const auto rear=SolveTandemCoupling(100000,false,true,evaluate);const auto rearR=evaluate(rear.Center,rear.Tandem);
    check(rear.Center==0&&std::abs(rearR.Tandem)<.002f,"geared tandem can couple rear axles without inventing a front motor shaft");
    const auto open=SolveTandemCoupling(100000,false,false,evaluate);
    check(open.Center==0&&open.Tandem==0,"open longitudinal differentials impose no constraint torque");
  }
  auto zero=[](float,float){return TandemResidual{0,0};};
  check(SolveTandemCoupling(0,true,true,zero).Center==0,"zero shaft rating returns no torque");
  check(SolveTandemCoupling(std::numeric_limits<float>::quiet_NaN(),true,true,zero).Center==0,"invalid shaft rating cannot poison simulation");
  for(int a=0;a<3;++a){const float fractions[]={.4277929f,.28610355f,.28610355f};check(fractions[a]>0&&fractions[a]<.5f,"three axle loads stay positive and bounded");}
  const float offsets[]={2.10f,-1.02f,-2.12f},fractions[]={.4277929f,.28610355f,.28610355f};
  check(std::abs(offsets[0]*fractions[0]+offsets[1]*fractions[1]+offsets[2]*fractions[2])<.001f,"three axle static shares balance the chassis center");
  const float open=TandemInputCapacity(100,1000,false),locked=TandemInputCapacity(100,1000,true);
  check(open<220&&locked==1100,"open tandem input is limited by its low-capacity axle before the outer center");
  const auto center=OpenCenterTorque(10000,1000,open,.3f);
  check(center.Front+center.Rear<400,"open inner rear differential limits the complete three-axle driveline");
  const auto rear=OpenCenterTorque(center.Rear,100,1000,4.f/7.f);
  check(rear.Front<=124.01f&&rear.Rear<=1024.01f,"nested open split cannot conceal low rear axle capacity");
  const float lifted=TandemInputCapacity(0,10000,false),liftedLocked=TandemInputCapacity(0,10000,true);
  check(lifted<43&&liftedLocked==10000,"locking the tandem releases its lifted axle bottleneck without inventing extra power");
  int nonlinearCases=0,totalEvaluations=0,maximumEvaluations=0;
  // Actual contact equations, including their zero-speed brake holding band.
  // The old Newton solve returned zero coupling in case0 because its tandem
  // finite-difference column was flat while the center shaft was still moving.
  for(float dt:{1.f/20,1.f/60,1.f/120})for(int direction:{-1,1})for(int scenario=0;scenario<6;++scenario){
    float omega[3]={4.25f,0,0},speed[3]={2,0,0},drag[3]={200,200,200},stiffness[3]={10000,10000,10000},force[3]={4000,4000,4000};
    if(scenario==1){omega[0]=0;speed[0]=0;omega[1]=4.25f;speed[1]=2;}
    if(scenario==2){omega[0]=0;speed[0]=0;omega[2]=4.25f;speed[2]=2;}
    if(scenario==3){omega[0]=9;omega[1]=2;omega[2]=-.7f;speed[0]=3;speed[1]=1;speed[2]=-.4f;drag[1]=500;drag[2]=100;}
    if(scenario==4){omega[0]=10;omega[1]=2;omega[2]=1;speed[0]=3;speed[1]=2;stiffness[2]=force[2]=0;}
    if(scenario==5){omega[0]=.3f;omega[1]=0;omega[2]=-.3f;speed[0]=1;speed[1]=0;speed[2]=-1;drag[0]=drag[2]=800;}
    for(int a=0;a<3;++a){omega[a]*=direction;speed[a]*=direction;}
    for(int mode=0;mode<3;++mode){
      const bool centerLocked=mode!=1,tandemLocked=mode!=2;
      int evaluations=0;
      auto evaluate=[&](float c,float t){
        ++evaluations;float solved[3]={};
        for(int axle=0;axle<3;++axle){const float coupling=axle==0?c:-c*.5f+(axle==1?t:-t);
          solved[axle]=CombinedWheelOmega(omega[axle]+coupling*.5f*dt/5.f,stiffness[axle],speed[axle],.4699f,dt,5.f,force[axle],0,drag[axle]);}
        return TandemResidual{solved[0]-(solved[1]+solved[2])*.5f,solved[1]-solved[2]};
      };
      const auto solution=SolveTandemCoupling(106482,centerLocked,tandemLocked,evaluate);
      const int solverEvaluations=evaluations;const auto residual=evaluate(solution.Center,solution.Tandem);
      if(!solution.Converged||(centerLocked&&std::abs(residual.Center)>=.002f)||(tandemLocked&&std::abs(residual.Tandem)>=.002f)){
        std::cerr<<"scenario="<<scenario<<" dt="<<dt<<" direction="<<direction<<" mode="<<mode<<" evaluations="<<solverEvaluations<<" residual="<<residual.Center<<','<<residual.Tandem<<'\n';}
      check((!centerLocked||std::abs(residual.Center)<.002f)&&(!tandemLocked||std::abs(residual.Tandem)<.002f),"nonlinear braked contacts converge without wheel-speed projection");
      check(solution.Converged,"nonlinear convergence is reported rather than silently returning an open shaft");
      check(solverEvaluations==solution.Evaluations&&solverEvaluations<=TandemSolveMaxEvaluations,"every tire evaluation is counted within a fixed solve budget");
      check(std::abs(solution.Center)<=106482&&std::abs(solution.Tandem)<=106482,"nonlinear shaft reactions remain inside their rated torque");
      check((centerLocked||solution.Center==0)&&(tandemLocked||solution.Tandem==0),"open shafts stay open during nonlinear fallback");
      ++nonlinearCases;totalEvaluations+=solverEvaluations;maximumEvaluations=std::max(maximumEvaluations,solverEvaluations);
    }
  }
  for(float dt:{1.f/20,1.f/60,1.f/120})for(int direction:{-1,1})for(int scenario=0;scenario<12;++scenario){
    const float omega[]={4.25f,3.1f,0,.5f,1,0},speed[]={2,1.4f,0,.6f,0,0},drag[]={200,220,300,100,250,200};
    float stiffness[]={10000,8000,3000,10000,5000,10000},force[]={4000,3000,700,4000,2000,4000};
    // First six runs lift each tire in turn. Others mix open and genuinely
    // locked left/right axles, retaining their two wheel inertias and brakes.
    if(scenario<6)stiffness[scenario]=force[scenario]=0;
    const int locks=scenario<6?0:scenario-5;
    int evaluations=0;
    auto evaluate=[&](float c,float t){
      ++evaluations;float solved[6]={};
      for(int axle=0;axle<3;++axle){const int a=axle*2,b=a+1;
        const float coupling=axle==0?c:-c*.5f+(axle==1?t:-t);
        if(locks&(1<<axle)){
          const float free=(omega[a]+omega[b])*.5f*direction+coupling*dt/10.f;
          solved[a]=solved[b]=CombinedAxleOmega(free,stiffness[a],stiffness[b],speed[a]*direction,speed[b]*direction,
            force[a],force[b],.2f,.4f,.4699f,dt,10.f,drag[a]+drag[b]);
        }else for(int wheel=a;wheel<=b;++wheel)
          solved[wheel]=CombinedWheelOmega(omega[wheel]*direction+coupling*.5f*dt/5.f,stiffness[wheel],speed[wheel]*direction,.4699f,dt,5.f,force[wheel],.2f,drag[wheel]);
      }
      return TandemResidual{(solved[0]+solved[1])*.5f-(solved[2]+solved[3]+solved[4]+solved[5])*.25f,
        (solved[2]+solved[3]-solved[4]-solved[5])*.5f};
    };
    const auto solution=SolveTandemCoupling(106482,true,true,evaluate);
    const int solverEvaluations=evaluations;const auto residual=evaluate(solution.Center,solution.Tandem);
    if(!solution.Converged)std::cerr<<"asymmetric scenario="<<scenario<<" dt="<<dt<<" direction="<<direction<<" evaluations="<<solverEvaluations<<" residual="<<residual.Center<<','<<residual.Tandem<<'\n';
    check(solution.Converged&&std::abs(residual.Center)<.002f&&std::abs(residual.Tandem)<.002f,"six asymmetric tire contacts and mixed axle locks converge");
    check(solverEvaluations==solution.Evaluations&&solverEvaluations<=TandemSolveMaxEvaluations,"asymmetric contacts retain the measured evaluation budget");
    check(std::abs(solution.Center)<=106482&&std::abs(solution.Tandem)<=106482,"asymmetric contacts respect both shaft torque limits");
    ++nonlinearCases;totalEvaluations+=solverEvaluations;maximumEvaluations=std::max(maximumEvaluations,solverEvaluations);
  }
  int saturatedCalls=0;auto impossible=[&](float c,float t){++saturatedCalls;return TandemResidual{20+c*.01f,10+t*.01f};};
  const auto saturated=SolveTandemCoupling(10,true,true,impossible);
  check(!saturated.Converged&&std::abs(saturated.Center)<=10&&std::abs(saturated.Tandem)<=10,"over-rating mismatch is explicit and cannot exceed shaft strength");
  check(saturatedCalls==saturated.Evaluations&&saturatedCalls<=TandemSolveMaxEvaluations,"saturated locks also retain their fixed evaluation budget");
  std::cout<<nonlinearCases<<" nonlinear contact cases, maximum "<<maximumEvaluations<<" / "<<TandemSolveMaxEvaluations<<" evaluations, mean "<<float(totalEvaluations)/nonlinearCases<<'\n';
  std::cout<<checks<<" tandem drivetrain checks passed\n";
}
