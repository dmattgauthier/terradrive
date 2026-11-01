#pragma once
#include <algorithm>
#include <cmath>

namespace TerraSim {
constexpr int GardenRows=769,GardenColumns=641;
constexpr float GardenOriginX=3200.f,GardenOriginY=-19200.f,GardenCellCM=25.f;
inline constexpr float GardenRockCenters[6][2]={{11800,-13500},{14300,-14500},{15600,-8800},{17700,-13900},{9900,-9100},{8200,-14900}};
inline float GardenRockWeight(float x,float y){
    float distance=1e9f;for(const auto& center:GardenRockCenters)distance=std::min(distance,std::hypot(x-center[0],y-center[1]));
    const float t=std::clamp((distance-800.f)/250.f,0.f,1.f);return 1-t*t*(3-2*t);
}
inline int GardenVertexIndex(float x,float y){
    return int(std::lround((x-GardenOriginX)/GardenCellCM))*GardenColumns+int(std::lround((y-GardenOriginY)/GardenCellCM));
}
// Match the authored half-metre contact field only in Granite Steps. The
// rest of the 800 m world retains its existing one-metre chunk mesh budget.
struct GroundMeshLayout {
    int KeyX=0,KeyY=0,Divisions=32;
    float OriginX=0,OriginY=0,CellCM=100;
};
inline GroundMeshLayout GardenBaseLayout(int keyX,int keyY) {
    const float x=keyX*3200.f,y=keyY*3200.f;
    const bool geology=x<20800.f&&x+3200.f>3600.f&&y<-5200.f&&y+3200.f>-19200.f;
    return {keyX,keyY,geology?64:32,x,y,geology?50.f:100.f};
}
inline GroundMeshLayout GroundLayout(int keyX,int keyY) {
    auto plan=GardenBaseLayout(keyX,keyY);if(plan.Divisions!=64)return plan;
    // Exactly these twelve chunks intersect the six 10.5m source clusters.
    // Keep classification arithmetic-only in the repeated tire query path.
    if(keyX>=2&&keyX<=5&&keyY>=-5&&keyY<=-3){plan.Divisions=128;plan.CellCM=25;}
    return plan;
}
template<class HeightSampler>
inline float GroundMetreHeight(float x,float y,HeightSampler rawVertex) {
    const float ix=std::floor(x/100.f)*100.f,iy=std::floor(y/100.f)*100.f,u=(x-ix)/100.f,v=(y-iy)/100.f;
    const float a=rawVertex(ix,iy),b=rawVertex(ix+100.f,iy),c=rawVertex(ix,iy+100.f),d=rawVertex(ix+100.f,iy+100.f);
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
template<class HeightSampler>
inline float WeatheredRockVertex(float x,float y,HeightSampler rawVertex) {
    // Retain all existing one-metre anchors. Some source cracks disappear in
    // the old metre mesh by more than a metre; revealing their full depth in
    // one update would alter the established route and create narrow traps.
    const auto anchor=[](float sx,float sy){return std::fmod(sx,100.f)==0&&std::fmod(sy,100.f)==0;};
    if(anchor(x,y))return rawVertex(x,y);
    auto detail=[&](float sx,float sy){
        if(anchor(sx,sy))return 0.f;
        const float residual=rawVertex(sx,sy)-GroundMetreHeight(sx,sy,rawVertex);
        return 15.f*std::tanh(residual/15.f);
    };
    // Smooth the already bounded correction, rather than averaging the raw
    // deep crack heights. Neither a peak nor a gap can introduce a spike.
    const float correction=detail(x,y)*.5f+(detail(x-50,y)+detail(x+50,y)+detail(x,y-50)+detail(x,y+50))*.125f;
    return GroundMetreHeight(x,y,rawVertex)+correction;
}
template<class HeightSampler>
inline float GroundVertexHeight(const GroundMeshLayout& plan,int i,int j,HeightSampler sample) {
    const float x=plan.OriginX+i*plan.CellCM,y=plan.OriginY+j*plan.CellCM;
    // A dense edge must lie on its coarser neighbour's straight segments.
    // Otherwise the intermediate half-metre vertices open hairline gaps.
    const auto edge=[&](float along,float spacing,bool vertical){
        const float start=std::floor(along/spacing)*spacing,t=(along-start)/spacing;
        if(t==0)return sample(x,y);
        return vertical?sample(x,start)*(1-t)+sample(x,start+spacing)*t:sample(start,y)*(1-t)+sample(start+spacing,y)*t;
    };
    if(i==0){const auto neighbor=GroundLayout(plan.KeyX-1,plan.KeyY);if(neighbor.Divisions<plan.Divisions)return edge(y,neighbor.CellCM,true);}
    if(i==plan.Divisions){const auto neighbor=GroundLayout(plan.KeyX+1,plan.KeyY);if(neighbor.Divisions<plan.Divisions)return edge(y,neighbor.CellCM,true);}
    if(j==0){const auto neighbor=GroundLayout(plan.KeyX,plan.KeyY-1);if(neighbor.Divisions<plan.Divisions)return edge(x,neighbor.CellCM,false);}
    if(j==plan.Divisions){const auto neighbor=GroundLayout(plan.KeyX,plan.KeyY+1);if(neighbor.Divisions<plan.Divisions)return edge(x,neighbor.CellCM,false);}
    return sample(x,y);
}
template<class HeightSampler>
inline float GroundMeshHeight(const GroundMeshLayout& plan,float x,float y,HeightSampler rawVertex) {
    const float gx=std::clamp((x-plan.OriginX)/plan.CellCM,0.f,float(plan.Divisions));
    const float gy=std::clamp((y-plan.OriginY)/plan.CellCM,0.f,float(plan.Divisions));
    const int i=std::min(int(std::floor(gx)),plan.Divisions-1),j=std::min(int(std::floor(gy)),plan.Divisions-1);
    const float u=gx-i,v=gy-j;
    if(u==0&&v==0)return GroundVertexHeight(plan,i,j,rawVertex);
    const float a=GroundVertexHeight(plan,i,j,rawVertex),b=GroundVertexHeight(plan,i+1,j,rawVertex);
    const float c=GroundVertexHeight(plan,i,j+1,rawVertex),d=GroundVertexHeight(plan,i+1,j+1,rawVertex);
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}

template<class HalfMetreSampler,class QuarterMetreSampler>
inline float RoundedRockVertex(float x,float y,HalfMetreSampler original,QuarterMetreSampler scanned){
    const auto previous=GardenBaseLayout(int(std::floor(x/3200)),int(std::floor(y/3200)));
    // Candidate2's source field, including its bounded intermediate detail.
    const float before=GroundMeshHeight(previous,x,y,[&](float sx,float sy){return WeatheredRockVertex(sx,sy,original);});
    const float weight=GardenRockWeight(x,y);if(weight==0)return before;
    // Restore actual scan shoulders, then filter the already bounded recovery.
    // Filtering source heights first could still create sharp clamp branches.
    // This separable kernel has a 25cm deviation and no new narrow cracks.
    const auto capped=[&](float sx,float sy){
        const float base=GroundMetreHeight(sx,sy,original),difference=scanned(sx,sy)-base;
        const float bound=difference<0?10.f:45.f;return bound*std::tanh(difference/bound);
    };
    constexpr int weights[5]={1,4,6,4,1};float target=0;
    for(int j=-2;j<=2;++j)for(int i=-2;i<=2;++i)target+=capped(x+i*25,y+j*25)*float(weights[i+2]*weights[j+2])/256.f;
    const float metre=GroundMetreHeight(x,y,original),shaped=metre+target;
    return before+(shaped-before)*weight;
}
}
