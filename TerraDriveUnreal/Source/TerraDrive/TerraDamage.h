#pragma once
#include <algorithm>
#include <cmath>
#include <array>

namespace TerraSim {
enum class DamageZone : int {Front,Rear,Left,Right,Roof,Underbody,Count};
struct DamageState {
  std::array<float,6> Zones{};
  float LastTime=-100,LastX=0,LastY=0,LastZ=0;
  unsigned Events=0;
};
struct DamageImpact {
  float DeltaV=0,Protection=1,Time=0,X=0,Y=0,Z=0;
  bool Ground=false,Upright=true,Enabled=true;
  DamageZone Zone=DamageZone::Front;
};
struct DamageResponse {bool Accepted=false;float Severity=0,RadiusCM=0,DepthCM=0;};
inline float DamageClamp(float V,float A,float B){return std::clamp(V,A,B);}
inline DamageZone DamageRegion(float X,float Y,float Z){
  if(Z>.45f)return DamageZone::Roof;
  if(std::abs(X)>.58f)return X>0?DamageZone::Front:DamageZone::Rear;
  if(std::abs(Y)>.58f)return Y<0?DamageZone::Left:DamageZone::Right;
  return DamageZone::Underbody;
}
// Delta-v comes from the normal collision impulse divided by actual rigid-body
// mass. Suspension/contact forces and ordinary resting support never call this
// path. Thresholds and damage curves are game calibration, not crash ratings.
inline DamageResponse AccumulateDamage(DamageState& S,const DamageImpact& I){
  DamageResponse R;
  if(!I.Enabled||!std::isfinite(I.DeltaV)||!std::isfinite(I.Time)||
     !std::isfinite(I.X)||!std::isfinite(I.Y)||!std::isfinite(I.Z)||
     !std::isfinite(I.Protection)||int(I.Zone)<0||int(I.Zone)>=6)return R;
  const float Threshold=I.Ground?(I.Upright?4.5f:1.65f):1.8f;
  if(I.DeltaV<=Threshold)return R;
  // Welded collision shapes can report the same impact several times. A
  // spatial/time debounce also prevents resting roof contacts farming damage.
  const float Distance2=(I.X-S.LastX)*(I.X-S.LastX)+(I.Y-S.LastY)*(I.Y-S.LastY)+(I.Z-S.LastZ)*(I.Z-S.LastZ);
  if(I.Time-S.LastTime<.18f&&Distance2<180.f*180.f)return R;
  R.Severity=DamageClamp(std::pow(I.DeltaV-Threshold,1.18f)*.036f*DamageClamp(I.Protection,.15f,1.5f),.012f,.65f);
  const int Zone=int(I.Zone);S.Zones[Zone]=DamageClamp(S.Zones[Zone]+R.Severity*(1-S.Zones[Zone]*.45f),0.f,1.f);
  S.LastTime=I.Time;S.LastX=I.X;S.LastY=I.Y;S.LastZ=I.Z;++S.Events;
  R.Accepted=true;R.RadiusCM=42+R.Severity*120;R.DepthCM=1.5f+R.Severity*27;
  return R;
}
inline float DamageAmount(const DamageState& S){float Clean=1;for(float Z:S.Zones)Clean*=1-DamageClamp(Z,0,1)*.72f;return DamageClamp(1-Clean,0,1);}
inline float DamageDrive(const DamageState& S,bool Electric){
  const float Powertrain=std::max(S.Zones[0],Electric?S.Zones[1]*.85f:S.Zones[5]*.5f);
  return DamageClamp(1-.62f*Powertrain-.12f*S.Zones[5],.30f,1.f);
}
inline float DamageBraking(const DamageState& S){return DamageClamp(1-.32f*std::max(S.Zones[0],S.Zones[1])-.10f*std::max(S.Zones[2],S.Zones[3]),.55f,1.f);}
inline float DamageSteering(const DamageState& S){return DamageClamp((S.Zones[2]-S.Zones[3])*.065f,-.065f,.065f);}
inline float DentWeight(float Distance,float Radius){if(!std::isfinite(Distance)||!std::isfinite(Radius)||Radius<=0||Distance<0||Distance>=Radius)return 0;const float T=1-Distance/Radius;return T*T*(3-2*T);}
}
