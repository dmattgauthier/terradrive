#pragma once
#include <algorithm>
#include <cmath>
#include <limits>
#include "TerraCenter.h"

namespace TerraSim {
// The open through-drive limits the entire rear input before the front/rear
// center differential is solved. Adding rear axle capacities instead would
// falsely let a gripped rear axle conceal the other rear axle's wheel lift.
inline float TandemInputCapacity(float middle,float rear,bool locked,float middleShare=4.f/7.f){
    if(locked)return std::max(0.f,middle)+std::max(0.f,rear);
    const auto split=OpenCenterTorque(std::numeric_limits<float>::max(),middle,rear,middleShare);
    return split.Front+split.Rear;
}
struct TandemResidual {float Center=0,Tandem=0;};
struct TandemCoupling {float Center=0,Tandem=0;int Evaluations=0;bool Converged=false;};
inline constexpr int TandemSolveMaxEvaluations=80;
// Two longitudinal shaft constraints on a three-axle driveline. Each residual
// evaluation re-solves the actual tire equations. The bounded Newton solve
// applies equal/opposite shaft torques; it never projects wheel/chassis speed.
template<class Evaluate> TandemCoupling SolveTandemCoupling(float limit,bool center,bool tandem,Evaluate evaluate){
    TandemCoupling q;
    if(!std::isfinite(limit)||limit<=0||(!center&&!tandem))return q;
    int evaluations=0;
    const auto sample=[&](float c,float t){++evaluations;return evaluate(c,t);};
    const auto finite=[](TandemResidual f){return std::isfinite(f.Center)&&std::isfinite(f.Tandem);};
    const auto error=[&](TandemResidual f){return std::hypot(center?f.Center:0.f,tandem?f.Tandem:0.f);};
    const auto converged=[&](TandemResidual f){return (!center||std::abs(f.Center)<.0001f)&&(!tandem||std::abs(f.Tandem)<.0001f);};
    auto f=sample(0,0);
    if(!finite(f)){q.Evaluations=evaluations;return q;}
    for(int iteration=0;iteration<16&&evaluations<TandemSolveMaxEvaluations;++iteration){
        if(converged(f)){q.Converged=true;break;}
        const auto blocked=[&](bool active,float torque,float residual){return !active||std::abs(residual)<.0001f||
            (torque<=-limit&&residual>0)||(torque>=limit&&residual<0);};
        if(blocked(center,q.Center,f.Center)&&blocked(tandem,q.Tandem,f.Tandem))break;
        float dc=0,dt=0,h=std::min(limit,std::max(.05f,limit*.001f*std::min(1.f,error(f))));
        bool direction=false;
        // Brake holding creates flat regions in the residual. Widen probes
        // through that band rather than treating a singular local Jacobian as
        // an open differential. Ordinary rolling contacts need one probe pair.
        for(int probe=0;probe<3&&evaluations+2<=TandemSolveMaxEvaluations;++probe){
            const float hc=q.Center+h<=limit?h:-h,ht=q.Tandem+h<=limit?h:-h;
            const auto a=center?sample(q.Center+hc,q.Tandem):f,b=tandem?sample(q.Center,q.Tandem+ht):f;
            if(!finite(a)||!finite(b))break;
            const float aa=center?(a.Center-f.Center)/hc:1,ab=tandem?(b.Center-f.Center)/ht:0;
            const float ba=center?(a.Tandem-f.Tandem)/hc:0,bb=tandem?(b.Tandem-f.Tandem)/ht:1;
            const float determinant=aa*bb-ab*ba;
            if(center&&tandem&&std::abs(determinant)>1e-14f){
                dc=(-f.Center*bb+ab*f.Tandem)/determinant;dt=(-aa*f.Tandem+ba*f.Center)/determinant;direction=true;
            }else if(center&&(!tandem||std::abs(f.Tandem)<.0001f)&&aa>1e-10f){dc=-f.Center/aa;dt=0;direction=true;}
            else if(tandem&&(!center||std::abs(f.Center)<.0001f)&&bb>1e-10f){dc=0;dt=-f.Tandem/bb;direction=true;}
            if(direction||h>=limit)break;
            h=std::min(limit,h*4);
        }
        bool accepted=false;
        if(direction&&std::isfinite(dc)&&std::isfinite(dt)){
            const float nc=center?std::clamp(q.Center+dc,-limit,limit):0,nt=tandem?std::clamp(q.Tandem+dt,-limit,limit):0;
            // Safeguard Newton against crossing several tire/brake branches.
            for(float step=1;step>=.125f&&evaluations<TandemSolveMaxEvaluations;step*=.5f){
                const float c=q.Center+(nc-q.Center)*step,t=q.Tandem+(nt-q.Tandem)*step;
                const auto candidate=sample(c,t);
                if(finite(candidate)&&error(candidate)<error(f)){q.Center=c;q.Tandem=t;f=candidate;accepted=true;break;}
            }
        }
        if(accepted)continue;
        if(evaluations+3>TandemSolveMaxEvaluations)break;
        // Each shaft residual is monotone in its own torque even when brake
        // plateaus make Newton singular. A bracketed coordinate solve escapes
        // that plateau; the next iteration resumes the coupled Newton solve.
        const bool solveCenter=center&&(!tandem||std::abs(f.Center)>=std::abs(f.Tandem));
        const auto component=[&](TandemResidual value){return solveCenter?value.Center:value.Tandem;};
        const auto at=[&](float value){return solveCenter?sample(value,q.Tandem):sample(q.Center,value);};
        float lo=-limit,hi=limit;
        auto low=at(lo),high=at(hi);
        if(!finite(low)||!finite(high))break;
        float fl=component(low),fh=component(high),value=0;
        TandemResidual result;
        if(fl>=0){value=lo;result=low;}
        else if(fh<=0){value=hi;result=high;}
        else{
            // Illinois false position avoids spending a full bisection tree on
            // the largely linear free-wheel regions outside a holding band.
            float wl=fl,wh=fh;int previousSide=0;
            result=f;value=solveCenter?q.Center:q.Tandem;
            for(int bracket=0;bracket<16&&evaluations<TandemSolveMaxEvaluations;++bracket){
                value=std::clamp((lo*wh-hi*wl)/(wh-wl),lo+(hi-lo)*.01f,hi-(hi-lo)*.01f);
                result=at(value);if(!finite(result))break;
                const float v=component(result);if(std::abs(v)<.0001f)break;
                if(v>0){hi=value;wh=v;if(previousSide==1)wl*=.5f;else wl=fl;fh=v;previousSide=1;}
                else{lo=value;wl=v;if(previousSide==-1)wh*=.5f;else wh=fh;fl=v;previousSide=-1;}
            }
        }
        if(!finite(result))break;
        if(solveCenter)q.Center=value;else q.Tandem=value;
        f=result;
    }
    q.Converged=converged(f);q.Evaluations=evaluations;
    return q;
}
}
