#pragma once
#include <algorithm>
#include <cmath>

namespace TerraSim {
// Effective radial compliance for a loaded belted tire. The uninflated
// carcass still carries some load, and the sidewall stiffens near its limit.
struct TireCarcass {
    float StiffnessNPerM, DeflectionLimitM;

    float Deflection(float normalLoadN) const {
        const float linear=std::max(0.f,normalLoadN)/StiffnessNPerM;
        const float knee=DeflectionLimitM*.65f;
        if(linear<=knee)return linear;
        const float extra=linear-knee, remaining=DeflectionLimitM-knee;
        return knee+extra/(1+extra/remaining);
    }
};

inline TireCarcass MakeTireCarcass(float psi,float radiusM,float beadM,float widthM) {
    const float pressurePa=std::clamp(psi,8.f,90.f)*6894.757f;
    const float width=std::clamp(widthM,.12f,1.20f);
    const float sidewall=std::clamp(radiusM-beadM,.045f,.55f);
    const float casing=42000.f*(width/.285f)*std::clamp(.155f/sidewall,.55f,1.7f);
    const float pressureContribution=2.8f*pressurePa*width;
    return {casing+pressureContribution,std::min(.115f,sidewall*.24f)};
}

inline float TireCarcassBulge(float deflectionM) {
    return std::clamp(deflectionM*.20f,0.f,.009f);
}

// Solve the existing nonlinear suspension and the tire in series. Evaluating
// the load at the shortened radius once from nominal force would underload
// a tire whenever the stiff bump stop engages. The bracket stays compressive.
template<typename SuspensionForce>
float CompliantTireLoad(const TireCarcass& tire,float travelAlignment,float maximumLoadN,
    SuspensionForce&& forceAtTravelLoss) {
    const float high=std::clamp(forceAtTravelLoss(0.f),0.f,maximumLoadN);
    if(high<=0)return 0;
    float lo=0,hi=high,errLo=high;
    auto residual=[&](float load){
        return std::clamp(forceAtTravelLoss(tire.Deflection(load)/travelAlignment),0.f,maximumLoadN)-load;
    };
    float errHi=residual(hi);
    for(int i=0;i<8;++i){
        const float mid=(lo+hi)*.5f, err=residual(mid);
        if(err>0){lo=mid;errLo=err;}
        else {hi=mid;errHi=err;}
    }
    const float slope=errLo-errHi;
    return slope>0?lo+(hi-lo)*(errLo/slope):hi;
}
}
