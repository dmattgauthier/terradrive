#pragma once
#include <algorithm>
#include <cmath>

// Coordinates are stable world centimetres. This field varies the material
// beside the footprint; it never introduces a frame/stamp random displacement.
// All banks still receive only volume actually removed by the loaded tire.
namespace TerraSoil {
struct Form {
    float Strength=1,Wall=1,BankWidth=1,Height=1,Weight=1,Scatter=0,Lobe=0;
};
inline Form Variation(float x,float y,int surface,float canonicalSide,float slip,float churn) {
    const float phase=surface*1.713f;
    const float broad=std::sin(x*.0091f+y*.0067f+phase+.7f*std::sin(y*.0031f-x*.0023f));
    const float grain=std::sin(x*.0237f-y*.0181f+phase*.61f+.55f*std::sin(x*.0053f+y*.0071f));
    const float flow=std::sin(x*.0073f-y*.0119f+phase+1.1f);
    const float side=canonicalSide<0?-1.f:1.f;
    const float working=std::clamp(std::abs(slip)*.45f+std::clamp(churn,0.f,1.f)*.55f,0.f,1.f);
    // Long waves alter broad collapse; shorter (~3–7 ft) lobes break up the
    // berm without producing alternating six-centimetre grid teeth.
    const float clump=.5f+.5f*std::sin(x*.043f+y*.031f+phase+side*1.37f+.9f*broad);
    const float lobe=clump*clump*clump;
    const float loose=surface==6?.45f:surface==5?.9f:surface==0?.65f:1.f;
    Form f;
    f.Strength=1+.045f*broad+.025f*grain;
    f.Wall=1+.035f*grain+.025f*side*flow;
    f.BankWidth=1+.16f*broad+.10f*side*flow;
    f.Height=.82f+.10f*grain+.06f*side*flow;
    f.Weight=1+.24f*side*flow+.18f*grain;
    f.Scatter=loose*(.15f+.60f*working);
    f.Lobe=lobe;
    return f;
}
}
