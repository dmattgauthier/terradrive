#include "../Source/TerraDrive/TerraSpray.h"
#include <iostream>
#include <limits>
int main(){int count=0,failed=0;auto check=[&](bool b){++count;if(!b){++failed;std::cerr<<"FAIL spray "<<count<<"\n";}};
using TerraSpray::Evaluate;
for(int s=0;s<7;++s){
check(Evaluate(s,false,false,0,0,2,10,0,true).Rate==0);
check(Evaluate(s,false,false,0,5000,0,0,0,true).Rate==0);
const auto spin=Evaluate(s,true,false,0,5000,2,12,0,true),passive=Evaluate(s,true,false,0,5000,2,12,0,false);
check(s==1?spin.Rate==0:spin.Rate>passive.Rate);
for(int load=100;load<=12000;load+=1700)for(int speed=-20;speed<=20;speed+=4){auto r=Evaluate(s,false,false,0,float(load),1.5f,float(speed),float(speed)*.5f,true);check(std::isfinite(r.Rate)&&r.Rate>=0&&r.Rate<=95&&r.Kind>=0&&r.Kind<6);}
}
check(Evaluate(2,false,false,.1f,5000,2,10,0,true).Kind==1);
check(Evaluate(6,false,false,0,5000,2,10,0,true).Kind==2);
check(Evaluate(5,false,false,0,5000,2,10,0,true).Kind==3);
check(Evaluate(4,false,false,0,5000,2,10,0,true).Kind==4);
check(Evaluate(0,false,true,0,5000,2,10,0,true).Kind==5);
check(Evaluate(0,true,false,0,5000,2,10,0,true).Kind==0);
check(Evaluate(2,true,false,0,5000,2,-10,0,true).Rate==Evaluate(2,true,false,0,5000,2,10,0,true).Rate);
check(Evaluate(2,true,false,0,1000,2,10,0,true).Rate<Evaluate(2,true,false,0,6000,2,10,0,true).Rate);
check(Evaluate(2,true,false,0,5000,2,std::numeric_limits<float>::quiet_NaN(),0,true).Rate==0);
check(Evaluate(0,false,false,0,5000,2,10,0,true).Kind==0);
check(Evaluate(0,true,true,0,5000,2,10,0,true).Kind==5);
std::cout<<(failed?"FAIL ":"PASS ")<<count<<" spray response checks\n";return failed?1:0;}
