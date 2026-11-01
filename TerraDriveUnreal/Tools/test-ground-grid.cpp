#include "../Source/TerraDrive/TerraGroundGrid.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <set>
#include <vector>
#include <utility>

namespace {
int checks=0;
void Check(bool ok,const char* name){++checks;if(!ok){std::cerr<<"FAIL "<<name<<'\n';std::exit(1);}}
float Height(float x,float y){return 170.f+31.f*std::sin(x*.0017f)+17.f*std::cos(y*.0013f)+9.f*std::sin(x*.005f+y*.003f);}
bool Near(float a,float b,float eps=.0001f){return std::abs(a-b)<=eps;}
}
int main(int argc,char** argv){
    using namespace TerraSim;
    int dense=0,quarter=0;long extraVertices=0,extraTriangles=0;bool domains=true,finite=true,interiors=true,extent=true;
    for(int ky=-13;ky<=12;++ky)for(int kx=-13;kx<=12;++kx){
        const auto p=GroundLayout(kx,ky);const bool garden=kx>=1&&kx<=6&&ky>=-6&&ky<=-2;
        domains&=(p.Divisions>=64)==garden&&p.CellCM==(p.Divisions==128?25.f:garden?50.f:100.f);
        domains&=(p.Divisions==128)==(kx>=2&&kx<=5&&ky>=-5&&ky<=-3);
        extent&=Near(p.CellCM*p.Divisions,3200)&&Near(p.OriginX,kx*3200.f)&&Near(p.OriginY,ky*3200.f);
        if(!garden)continue;
        if(p.Divisions==128)++quarter;
        ++dense;extraVertices+=(p.Divisions+1)*(p.Divisions+1)-33*33;extraTriangles+=p.Divisions*p.Divisions*2-32*32*2;
        for(int j=1;j<p.Divisions;++j)for(int i=1;i<p.Divisions;++i){
            const float x=p.OriginX+i*p.CellCM,y=p.OriginY+j*p.CellCM,h=GroundVertexHeight(p,i,j,Height);
            finite&=std::isfinite(h);interiors&=h==Height(x,y);
        }
    }
    Check(domains,"half metre geometry is confined to the authored garden bounds");
    Check(extent,"all resolutions retain exact existing 32 metre chunk extents");
    Check(dense==30,"bounded detail adds only thirty dense world chunks");
    Check(quarter==12&&extraVertices==243072&&extraTriangles==479232,"whole-world added vertex and triangle budget is fixed including twelve quarter-metre chunks");
    Check(finite&&interiors,"every interior dense sample preserves the authoritative contact height");

    int boundaries=0,samples=0;bool seams=true,nativeIntervals=true;
    for(int ky=-6;ky<=-2;++ky)for(int kx=1;kx<=6;++kx){
        const auto p=GroundLayout(kx,ky);
        for(int side=0;side<4;++side){
            const bool xEdge=side<2,negative=side%2==0;
            const auto q=GroundLayout(kx+(xEdge?(negative?-1:1):0),ky+(!xEdge?(negative?-1:1):0));
            if(q.Divisions>=p.Divisions)continue;
            ++boundaries;
            for(int step=0;step<=p.Divisions;++step){
                const int i=xEdge?(negative?0:p.Divisions):step,j=xEdge?step:(negative?0:p.Divisions);
                const float x=p.OriginX+i*p.CellCM,y=p.OriginY+j*p.CellCM;
                const float got=GroundVertexHeight(p,i,j,Height);
                // Evaluate the adjacent coarse edge by linear interpolation
                // between its actual one-metre sample endpoints.
                const float along=xEdge?y:x,start=std::floor(along/q.CellCM)*q.CellCM,t=(along-start)/q.CellCM;
                const float a=xEdge?Height(x,start):Height(start,y),b=xEdge?Height(x,start+q.CellCM):Height(start+q.CellCM,y);
                seams&=Near(got,a+(b-a)*t,.00005f);++samples;
                if(std::fmod(step*p.CellCM,q.CellCM)==0)nativeIntervals&=got==Height(x,y);
            }
        }
    }
    Check(boundaries==36&&samples==3236,"every mixed-resolution seam sample is covered on inner and outer garden edges");
    Check(seams,"dense edges are exactly collinear with each neighbouring coarse segment");
    Check(nativeIntervals,"one-metre anchors and all corners retain their original physical height");

    bool masks=true,winding=true;int maskedLayouts=0;
    for(const auto key:{std::pair<int,int>{2,-4},{1,-4},{-3,-4}}){
        const auto p=GroundLayout(key.first,key.second);double area=0;int omitted=0;
        // A real four-metre fine tile occupies one of eight children in each
        // direction. Withholding it must remove the same area at either density.
        const int fineX=key.first*8+3,fineY=key.second*8+4;
        for(int j=0;j<p.Divisions;++j)for(int i=0;i<p.Divisions;++i){
            const float x=p.OriginX+(i+.5f)*p.CellCM,y=p.OriginY+(j+.5f)*p.CellCM;
            const bool hidden=int(std::floor(x/400))==fineX&&int(std::floor(y/400))==fineY;
            if(hidden){++omitted;continue;}
            area+=p.CellCM*p.CellCM;
            const int a=j*(p.Divisions+1)+i,b=a+1,c=a+p.Divisions+1,d=c+1;
            winding&=a>=0&&d<(p.Divisions+1)*(p.Divisions+1)&&b<c;
        }
        masks&=std::abs(area-(3200.*3200.-400.*400.))<.01&&omitted==(p.Divisions==128?256:p.Divisions==64?64:16);++maskedLayouts;
    }
    Check(masks&&maskedLayouts==3,"soil handoff removes exactly sixteen square metres at all three resolutions including negative coordinates");
    Check(winding,"all ground cell triangles stay within their resolution-specific vertex buffer");
    if(argc>1){
        std::ifstream input(argv[1],std::ios::binary);Check(bool(input),"existing authored terrain stream is available for shape verification");
        std::vector<char> bytes((std::istreambuf_iterator<char>(input)),std::istreambuf_iterator<char>());
        auto integer=[&](int at){unsigned value;std::memcpy(&value,bytes.data()+at,4);return value;};
        auto number=[&](int at){float value;std::memcpy(&value,bytes.data()+at,4);return value;};
        Check(bytes.size()==16+1601*1601*9&&integer(0)==0x54445256&&integer(4)==1601&&number(8)==.5f,"field is the existing half-metre 1601-square authored height stream");
        auto raw=[&](float x,float y){const int row=std::clamp(int(std::lround((x/100+400)*2)),0,1600),col=std::clamp(int(std::lround((y/100+400)*2)),0,1600);return number(16+(row*1601+col)*9)*100;};
        auto legacy=[&](float x,float y){
            const float gx=std::clamp((x/100+400)*2,0.f,1599.9999f),gy=std::clamp((y/100+400)*2,0.f,1599.9999f);
            const int ix=std::min(int(std::floor(gx/2))*2,1598),iy=std::min(int(std::floor(gy/2))*2,1598);
            const float u=(gx-ix)*.5f,v=(gy-iy)*.5f;
            auto node=[&](int i,int j){return number(16+(i*1601+j)*9)*100;};
            const float a=node(ix,iy),b=node(ix+2,iy),c=node(ix,iy+2),d=node(ix+2,iy+2);
            return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
        };
        Check(argc>3,"quarter-metre analytical source field is supplied");
        std::ifstream sourceInput(argv[3],std::ios::binary);std::vector<char> source((std::istreambuf_iterator<char>(sourceInput)),std::istreambuf_iterator<char>());
        auto sourceNumber=[&](int at){float value;std::memcpy(&value,source.data()+at,4);return value;};
        auto sourceInteger=[&](int at){unsigned value;std::memcpy(&value,source.data()+at,4);return value;};
        Check(source.size()==24+GardenRows*GardenColumns*4&&sourceInteger(0)==0x54444733&&sourceInteger(4)==GardenRows&&sourceInteger(8)==GardenColumns&&
          sourceNumber(12)==GardenCellCM&&sourceNumber(16)==GardenOriginX&&sourceNumber(20)==GardenOriginY,"analytical source field has the complete quarter-metre schema");
        auto scanned=[&](float x,float y){return sourceNumber(24+GardenVertexIndex(x,y)*4);};
        auto weathered=[&](float x,float y){return RoundedRockVertex(x,y,raw,scanned);};
        std::vector<float> cache(GardenRows*GardenColumns);std::set<int> cacheIndices;bool cacheMatches=true;
        for(int row=0;row<GardenRows;++row)for(int col=0;col<GardenColumns;++col){
            const float x=GardenOriginX+row*GardenCellCM,y=GardenOriginY+col*GardenCellCM;
            const int index=GardenVertexIndex(x,y);cacheIndices.insert(index);cache[index]=weathered(x,y);
            cacheMatches&=index==row*GardenColumns+col;
        }
        Check(cache.size()*sizeof(float)==1971716,"immutable garden cache has a fixed sub-two-MiB memory budget");
        Check(cacheMatches&&cacheIndices.size()==cache.size()&&*cacheIndices.begin()==0&&*cacheIndices.rbegin()==int(cache.size()-1),"every cached source coordinate has one unique in-range row-major slot");
        auto cached=[&](float x,float y){const int index=GardenVertexIndex(x,y);if(index<0||index>=int(cache.size())){std::cerr<<"cache query outside garden\n";std::exit(1);}return cache[index];};
        for(int row=0;row<GardenRows;++row)for(int col=0;col<GardenColumns;++col){const float x=GardenOriginX+row*GardenCellCM,y=GardenOriginY+col*GardenCellCM;cacheMatches&=cached(x,y)==weathered(x,y);}
        Check(cacheMatches,"all cached samples exactly match the direct filtered field before the hot path uses them");
        auto world=[&](float x,float y){const auto plan=GroundLayout(int(std::floor(x/3200)),int(std::floor(y/3200)));return plan.Divisions>=64?GroundMeshHeight(plan,x,y,cached):legacy(x,y);};
        double oldMaximum=0,newMaximum=0,oldSquared=0,newSquared=0,changeMaximum=0,correctionGradient=0,seamMaximum=0,rayMaximum=0,maximumFill=0,maximumCut=0;
        double candidateFill=0,candidateCut=0,protectedCut=0,oldGrade=0,newGrade=0;int profileSamples=0,raySamples=0;bool anchors=true;
        for(int ky=-6;ky<=-2;++ky)for(int kx=1;kx<=6;++kx){
            const auto plan=GroundLayout(kx,ky);
            for(int j=2;j<plan.Divisions-1;++j)for(int i=2;i<plan.Divisions-1;++i){
                const float x=plan.OriginX+i*plan.CellCM,y=plan.OriginY+j*plan.CellCM,reference=scanned(x,y),before=legacy(x,y),after=world(x,y);
                oldMaximum=std::max(oldMaximum,double(std::abs(before-reference)));newMaximum=std::max(newMaximum,double(std::abs(after-reference)));
                oldSquared+=(before-reference)*(before-reference);newSquared+=(after-reference)*(after-reference);changeMaximum=std::max(changeMaximum,double(std::abs(after-before)));++profileSamples;
                if(std::fmod(x,100.f)==0&&std::fmod(y,100.f)==0&&GardenRockWeight(x,y)==0)anchors&=after==raw(x,y);
                maximumFill=std::max(maximumFill,double(after-before));maximumCut=std::max(maximumCut,double(before-after));
                const auto previousPlan=GardenBaseLayout(kx,ky);
                const float previous=GroundMeshHeight(previousPlan,x,y,[&](float sx,float sy){return WeatheredRockVertex(sx,sy,raw);});
                candidateFill=std::max(candidateFill,double(after-previous));candidateCut=std::max(candidateCut,double(previous-after));
                if(GardenRockWeight(x,y)==1)protectedCut=std::max(protectedCut,double(before-after));
                const float correction=after-before;
                const float dx=(world(x+plan.CellCM,y)-legacy(x+plan.CellCM,y)-correction)/plan.CellCM,dy=(world(x,y+plan.CellCM)-legacy(x,y+plan.CellCM)-correction)/plan.CellCM;
                correctionGradient=std::max(correctionGradient,double(std::hypot(dx,dy)));
                oldGrade=std::max(oldGrade,double(std::hypot((legacy(x+plan.CellCM,y)-before)/plan.CellCM,(legacy(x,y+plan.CellCM)-before)/plan.CellCM)));
                newGrade=std::max(newGrade,double(std::hypot((world(x+plan.CellCM,y)-after)/plan.CellCM,(world(x,y+plan.CellCM)-after)/plan.CellCM)));
            }
            // Independent XY barycentrics intersect the two rendered triangle
            // planes. Include interior points and both sides of every outer
            // stitched edge, rather than only comparing sample vertices.
            for(int seed=0;seed<500;++seed){
                int i=(seed*23+7)%plan.Divisions,j=(seed*37+11)%plan.Divisions;
                if(seed<128)i=seed%2?0:plan.Divisions-1;else if(seed<256)j=seed%2?0:plan.Divisions-1;
                const float x=plan.OriginX+(i+.17f+float(seed%5)*.14f)*plan.CellCM,y=plan.OriginY+(j+.19f+float(seed%3)*.24f)*plan.CellCM;
                struct V{double x,y,z;};V vertices[4];
                for(int corner=0;corner<4;++corner){const int vi=i+(corner&1),vj=j+(corner>>1);vertices[corner]={plan.OriginX+vi*double(plan.CellCM),plan.OriginY+vj*double(plan.CellCM),GroundVertexHeight(plan,vi,vj,world)};}
                bool hit=false;double rendered=0;
                for(const auto triangle:{std::vector<int>{0,2,1},std::vector<int>{1,2,3}}){
                    const auto a=vertices[triangle[0]],b=vertices[triangle[1]],c=vertices[triangle[2]];
                    const double det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
                    const double u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/det,v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/det,w=1-u-v;
                    if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7){rendered=u*a.z+v*b.z+w*c.z;hit=true;break;}
                }
                Check(hit,"render triangle contains the arbitrary field-query point");
                rayMaximum=std::max(rayMaximum,std::abs(rendered-world(x,y)));++raySamples;
            }
            for(int step=0;step<=128;++step)for(int side=0;side<4;++side){
                const float x=side<2?plan.OriginX+(side?3200:0):plan.OriginX+step*25.f;
                const float y=side>=2?plan.OriginY+(side==3?3200:0):plan.OriginY+step*25.f;
                const auto adjacent=GroundLayout(kx+(side==0?-1:side==1?1:0),ky+(side==2?-1:side==3?1:0));
                if(adjacent.Divisions>=plan.Divisions)continue;
                seamMaximum=std::max(seamMaximum,double(std::abs(GroundMeshHeight(plan,x,y,cached)-world(x,y))));
            }
        }
        Check(anchors,"original metre anchors remain exact outside the six reshaped rock clusters");
        std::cout<<"Measured fill/cut="<<maximumFill<<'/'<<maximumCut<<" cm, correction slope="<<correctionGradient<<", RMS before/after="<<std::sqrt(oldSquared/profileSamples)<<'/'<<std::sqrt(newSquared/profileSamples)<<", ray/seam="<<rayMaximum<<'/'<<seamMaximum<<'\n';
        Check(maximumFill<=45.001&&maximumCut<=15.001,"new shoulders add at most45cm and existing15cm floor protection is retained everywhere");
        Check(correctionGradient<=.85,"bounded source correction has a finite adjacent-cell slope budget");
        Check(protectedCut<=10.001,"fully restored formations cannot deepen their original floor by more than ten centimetres");
        Check(newSquared<oldSquared,"bounded restoration reduces RMS error against original scan profiles");
        Check(oldMaximum>10,"measurement detects the old metre mesh actually losing rock silhouette detail");
        Check(rayMaximum<.002,"physics BaseHeight agrees with rendered triangles at random and stitched-edge interior points");
        Check(seamMaximum<.002,"continuous stitched edges match neighbouring coarse fields at quarter-metre intervals");
        if(argc>2){std::ofstream report(argv[2]);report<<"{\"denseChunks\":"<<dense<<",\"quarterMetreChunks\":"<<quarter<<",\"additionalVertices\":"<<extraVertices<<",\"additionalTriangles\":"<<extraTriangles<<",\"profileSamples\":"<<profileSamples<<",\"oldMaximumErrorCM\":"<<oldMaximum<<",\"oldRMSErrorCM\":"<<std::sqrt(oldSquared/profileSamples)<<",\"newMaximumErrorCM\":"<<newMaximum<<",\"newRMSErrorCM\":"<<std::sqrt(newSquared/profileSamples)<<",\"maximumRecoveredReliefCM\":"<<changeMaximum<<",\"maximumFillCM\":"<<maximumFill<<",\"maximumCutCM\":"<<maximumCut<<",\"maximumCandidate2FillCM\":"<<candidateFill<<",\"maximumCandidate2CutCM\":"<<candidateCut<<",\"maximumProtectedFloorCutCM\":"<<protectedCut<<",\"maximumOriginalGrade\":"<<oldGrade<<",\"maximumNewGrade\":"<<newGrade<<",\"maximumCorrectionSlope\":"<<correctionGradient<<",\"triangleQuerySamples\":"<<raySamples<<",\"maximumTriangleQueryErrorCM\":"<<rayMaximum<<",\"maximumSeamErrorCM\":"<<seamMaximum<<"}\n";}
        std::cout<<"Authored field samples="<<profileSamples<<" old/new RMS="<<std::sqrt(oldSquared/profileSamples)<<"/"<<std::sqrt(newSquared/profileSamples)<<" cm; max fill/cut="<<maximumFill<<'/'<<maximumCut<<" cm; correction slope="<<correctionGradient<<"; triangle error="<<rayMaximum<<" cm; seam error="<<seamMaximum<<" cm\n";
    }
    std::cout<<checks<<" ground-grid checks passed; "<<dense<<" dense chunks, "<<samples<<" seam samples, "<<extraTriangles<<" bounded additional triangles\n";
}
