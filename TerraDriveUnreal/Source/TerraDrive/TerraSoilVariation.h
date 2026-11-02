#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>

// Coordinates are stable world centimetres. This field varies the material
// beside the footprint; it never introduces a frame/stamp random displacement.
// All banks still receive only volume actually removed by the loaded tire.
namespace TerraSoil {
struct Form {
    float Strength=1,Wall=1,BankWidth=1,Height=1,Weight=1,Scatter=0,Lobe=0;
};
inline float GrainHash(int x,int y,uint32_t seed) {
    uint32_t v=uint32_t(x)*0x9e3779b1u^uint32_t(y)*0x85ebca77u^seed;
    v^=v>>16;v*=0x7feb352du;v^=v>>15;v*=0x846ca68bu;v^=v>>16;
    return float(v&0x00ffffffu)/16777215.f;
}
inline float GroundNoise(float x,float y,uint32_t seed) {
    const int ix=int(std::floor(x)),iy=int(std::floor(y));
    float u=x-ix,v=y-iy;
    u=u*u*u*(u*(u*6.f-15.f)+10.f);v=v*v*v*(v*(v*6.f-15.f)+10.f);
    const float a=GrainHash(ix,iy,seed),b=GrainHash(ix+1,iy,seed),c=GrainHash(ix,iy+1,seed),d=GrainHash(ix+1,iy+1,seed);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
inline Form Variation(float x,float y,int surface,float canonicalSide,float slip,float churn) {
    // One continuous world field crosses material IDs. A material boundary
    // must not introduce a new floor/shoulder phase underneath the same tire.
    // Surface-specific displacement still comes from the blended bank budget.
    const float broad=GroundNoise(x/175.f,y/175.f,17)*2-1;
    const float grain=GroundNoise((x+broad*35.f)/65.f,y/65.f,43)*2-1;
    const float flow=GroundNoise(x/115.f,(y+grain*24.f)/115.f,91)*2-1;
    const float side=canonicalSide<0?-1.f:1.f;
    const float working=std::clamp(std::abs(slip)*.45f+std::clamp(churn,0.f,1.f)*.55f,0.f,1.f);
    // Smooth aperiodic fields vary the broad collapse and smaller clod groups.
    // Their one-foot minimum scale stays well above the physical grid; no
    // random height is injected per stamp or frame, including on reversal.
    const float clump=GroundNoise((x+broad*22.f)/36.f+side*2.7f,y/36.f,137);
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
