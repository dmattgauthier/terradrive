#include "../Source/TerraDrive/TerraBodyGround.h"
#include <cstdio>
#include <limits>
int main(){
  int checks=0,failures=0;
  auto check=[&](bool ok,const char* name){++checks;if(!ok){++failures;std::printf("FAIL %s\n",name);}};
  for(int surface=0;surface<7;++surface)for(bool wet:{false,true}){
    const auto upright=TerraSim::BodyGrip(1,surface,wet),side=TerraSim::BodyGrip(0,surface,wet),roof=TerraSim::BodyGrip(-1,surface,wet);
    check(upright.Sliding==.10f&&upright.Static==.12f,"upright undertray retains its low friction");
    check(side.Sliding>.20f&&side.Sliding<.8f&&side.Static>side.Sliding,"rolled panel supports bounded sliding and static friction");
    check(side.Sliding==roof.Sliding,"roof and side have the same ground-material response");
    float previous=upright.Sliding;bool smooth=true;
    for(int step=1;step<=80;++step){const float alignment=1-step*.025f;const auto g=TerraSim::BodyGrip(alignment,surface,wet);
      smooth&=g.Sliding+1e-6f>=previous&&g.Sliding-previous<.06f;previous=g.Sliding;}
    check(smooth,"grip changes continuously as body rolls");
    for(float load:{200.f,2000.f,15000.f,80000.f}){
      const float shallow=TerraSim::BodyImpressionDepth(surface,.04f,load,.9f,1.2f),deep=TerraSim::BodyImpressionDepth(surface,.45f,load,.9f,1.2f);
      check(shallow>=0&&shallow<=.04f&&deep>=shallow&&deep<=.14f,"finite layer and broad-panel depth bounds");
      check(TerraSim::BodyImpressionDepth(surface,.45f,load,.9f,1.2f)>=TerraSim::BodyImpressionDepth(surface,.45f,load,1.8f,2.4f),"spreading the same weight cannot deepen an impression");
      if(surface==1||surface==4)check(deep==0,"pavement and rock cannot be excavated");
    }
    check(TerraSim::BodyImpressionDepth(surface,.4f,0,1,1)==0,"airborne body cannot compact ground");
    check(TerraSim::BodyImpressionDepth(surface,0,10000,1,1)==0,"absent soft layer cannot compact");
    check(TerraSim::BodyGrip(0,surface,true).Sliding<=TerraSim::BodyGrip(0,surface,false).Sliding,"rain never adds dry panel grip");
  }
  check(TerraSim::BodyGrip(0,6).Sliding<TerraSim::BodyGrip(0,1).Sliding,"snow retains more sliding than dry tarmac");
  check(TerraSim::BodyImpressionDepth(2,.4f,5000,0,1)==0,"zero area is rejected");
  check(TerraSim::BodyImpressionDepth(2,.4f,std::numeric_limits<float>::quiet_NaN(),1,1)==0,"nonfinite load is rejected");
  check(TerraSim::BodyImpressionDepth(2,.4f,5000,1,std::numeric_limits<float>::infinity())==0,"nonfinite patch dimensions are rejected");
  std::printf("%s %d body ground checks; %d failures\n",failures?"FAIL":"PASS",checks,failures);
  return failures?1:0;
}
