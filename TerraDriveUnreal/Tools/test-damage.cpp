#include "../Source/TerraDrive/TerraDamage.h"
#include <cstdlib>
#include <iostream>
#include <limits>

namespace {
int Checks=0;
void Check(bool Pass,const char* Name){++Checks;if(!Pass){std::cerr<<"FAIL "<<Name<<'\n';std::exit(1);}}
bool Near(float A,float B,float E=.0001f){return std::abs(A-B)<E;}
TerraSim::DamageImpact Impact(float DV=8){TerraSim::DamageImpact I;I.DeltaV=DV;I.Time=1;I.X=220;return I;}
}
int main(){
  using namespace TerraSim;
  DamageState S;Check(DamageAmount(S)==0&&DamageDrive(S,false)==1&&DamageDrive(S,true)==1&&DamageBraking(S)==1&&DamageSteering(S)==0,"clean drivetrain and handling");
  Check(DamageRegion(.9f,0,0)==DamageZone::Front,"front impact classification");
  Check(DamageRegion(-.9f,0,0)==DamageZone::Rear,"rear impact classification");
  Check(DamageRegion(0,-.9f,0)==DamageZone::Left,"left impact classification");
  Check(DamageRegion(0,.9f,0)==DamageZone::Right,"right impact classification");
  Check(DamageRegion(0,0,.9f)==DamageZone::Roof,"roof impact classification");
  Check(DamageRegion(0,0,-.9f)==DamageZone::Underbody,"underbody impact classification");
  auto I=Impact(1.8f);Check(!AccumulateDamage(S,I).Accepted&&S.Events==0,"object threshold excludes low energy contact");
  I=Impact(4.5f);I.Ground=true;Check(!AccumulateDamage(S,I).Accepted,"upright terrain threshold excludes normal support");
  I.Upright=false;I.DeltaV=1.65f;Check(!AccumulateDamage(S,I).Accepted,"resting roof contact remains below damage threshold");
  for(int N=0;N<10000;++N){I.Time=N*.02f;I.DeltaV=.08f;AccumulateDamage(S,I);}
  Check(S.Events==0&&DamageAmount(S)==0,"ten thousand resting contacts never farm damage");
  I=Impact();I.Enabled=false;Check(!AccumulateDamage(S,I).Accepted&&S.Events==0,"free run excludes a severe object impact");
  I.Enabled=true;auto R=AccumulateDamage(S,I);
  Check(R.Accepted&&S.Events==1&&R.Severity>0&&R.RadiusCM>42&&R.DepthCM>1.5f,"meaningful object impact produces a local dent response");
  Check(DamageAmount(S)>0&&DamageAmount(S)<1,"impact condition remains bounded");
  Check(DamageDrive(S,false)<1&&DamageDrive(S,true)<1&&DamageBraking(S)<1,"front impact impairs powertrain and service brakes");
  const auto Before=S;I.Time+=.05f;Check(!AccumulateDamage(S,I).Accepted&&S.Events==Before.Events&&S.Zones==Before.Zones,"welded shape duplicate is deduplicated");
  I.X+=200;Check(AccumulateDamage(S,I).Accepted,"independent distant impact in same interval is retained");
  I.Time+=.2f;Check(AccumulateDamage(S,I).Accepted,"later genuine impact is retained");
  I.Enabled=false;const auto Disabled=S;I.Time+=1;I.DeltaV=100;
  Check(!AccumulateDamage(S,I).Accepted&&S.Zones==Disabled.Zones&&S.Events==Disabled.Events,"disabled state does not accumulate prior damage");
  DamageState Normal,Protected;I=Impact();auto A=AccumulateDamage(Normal,I);I.Protection=.35f;auto B=AccumulateDamage(Protected,I);
  Check(B.Accepted&&B.Severity<A.Severity&&B.DepthCM<A.DepthCM&&DamageAmount(Protected)<DamageAmount(Normal),"frame protection lessens damage and visible dent depth");
  DamageState Low,High;I=Impact(5);A=AccumulateDamage(Low,I);I.DeltaV=12;B=AccumulateDamage(High,I);
  Check(B.Severity>A.Severity&&B.RadiusCM>A.RadiusCM&&B.DepthCM>A.DepthCM,"impact speed drives visible severity and affected area");
  DamageState Roof;I=Impact(3);I.Ground=true;I.Upright=false;I.Zone=DamageZone::Roof;
  Check(AccumulateDamage(Roof,I).Accepted&&DamageAmount(Roof)>0,"real rollover threshold accepts a roof landing");
  Check(DamageDrive(Roof,false)==1&&DamageBraking(Roof)==1,"roof-only damage does not invent front drivetrain failure");
  DamageState Left,Right;I=Impact();I.Zone=DamageZone::Left;AccumulateDamage(Left,I);I.Zone=DamageZone::Right;AccumulateDamage(Right,I);
  Check(DamageSteering(Left)>0&&DamageSteering(Right)<0&&Near(DamageSteering(Left),-DamageSteering(Right)),"sided alignment damage produces opposite steering pull");
  Check(DamageDrive(Left,false)==1&&DamageBraking(Left)<1,"side impacts affect braking alignment without arbitrary engine loss");
  DamageState Rear;I=Impact();I.Zone=DamageZone::Rear;AccumulateDamage(Rear,I);
  Check(DamageDrive(Rear,true)<DamageDrive(Rear,false),"rear electric drivetrain can be damaged independently");
  DamageState Floor;I.Zone=DamageZone::Underbody;AccumulateDamage(Floor,I);
  Check(DamageDrive(Floor,false)<1&&DamageDrive(Floor,true)<1,"underbody impacts affect both drivetrains");
  DamageState Saturated;I=Impact(100000);for(int N=0;N<1000;++N){I.Time=N;I.Zone=DamageZone(N%6);R=AccumulateDamage(Saturated,I);}
  Check(DamageAmount(Saturated)<=1&&DamageAmount(Saturated)>.99f&&R.Severity<=.65f,"many severe impacts saturate instead of overflowing");
  Check(DamageDrive(Saturated,false)>=.30f&&DamageDrive(Saturated,true)>=.30f&&DamageBraking(Saturated)>=.55f,"mechanical degradation is safely bounded");
  for(float Z:Saturated.Zones)Check(Z>=0&&Z<=1,"each damage zone remains normalized");
  for(int K=0;K<7;++K){DamageState Invalid;I=Impact();const float NaN=std::numeric_limits<float>::quiet_NaN();
    if(K==0)I.DeltaV=NaN;else if(K==1)I.Time=NaN;else if(K==2)I.X=NaN;else if(K==3)I.Y=NaN;else if(K==4)I.Z=NaN;else if(K==5)I.Protection=NaN;else I.Zone=DamageZone(99);
    Check(!AccumulateDamage(Invalid,I).Accepted&&Invalid.Events==0&&DamageAmount(Invalid)==0,"invalid telemetry cannot corrupt damage state");
  }
  Check(DentWeight(0,100)==1&&DentWeight(100,100)==0&&DentWeight(101,100)==0,"dent has full center weight and finite support");
  Check(Near(DentWeight(50,100),.5f),"dent radial midpoint is smooth and half-depth");
  Check(DentWeight(-1,100)==0&&DentWeight(10,0)==0&&DentWeight(0,std::numeric_limits<float>::infinity())==0,"invalid dent geometry is rejected");
  float Last=1;bool Monotone=true;for(int N=0;N<=1000;++N){float W=DentWeight(N*.1f,100);Monotone&=W>=0&&W<=Last;Last=W;}
  Check(Monotone,"dent falloff is continuous and monotonic through the whole radius");
  Check(std::abs(DentWeight(.01f,100)-1)<.000001f&&DentWeight(99.99f,100)<.000001f,"dent derivative is flat at center and edge");
  std::cout<<"PASS "<<Checks<<" damage checks\n";
}
