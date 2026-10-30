#pragma once
#include <algorithm>
#include <cmath>

namespace TerraSim {
struct BodyGroundGrip { float Sliding=.10f,Static=.12f; };
// Painted panels/plastic on ground, not tire grip. These are authored game
// coefficients. A body's grip becomes relevant only when it rolls away from
// the supporting surface normal; the undertray retains its crest clearance.
inline BodyGroundGrip BodyGrip(float alignment,int surface,bool wet=false){
  if(!std::isfinite(alignment))return {};
  static constexpr float sliding[]={.58f,.48f,.55f,.53f,.52f,.66f,.32f};
  const float t=std::clamp((.75f-alignment)/.45f,0.f,1.f),blend=t*t*(3-2*t);
  const float target=sliding[std::clamp(surface,0,6)]*(wet?.82f:1.f);
  return {.10f+(target-.10f)*blend,.12f+(std::min(.92f,target*1.22f+.035f)-.12f)*blend};
}
inline float BodyImpressionDepth(int surface,float available,float load,float width,float length){
  if(surface==1||surface==4||!std::isfinite(available)||!std::isfinite(load)||
      !std::isfinite(width)||!std::isfinite(length)||available<=0||load<50||width<=0||length<=0)return 0;
  const float pressure=load/std::max(.04f,width*length);
  // A broad panel compacts a finite layer. It cannot excavate a tire-depth
  // trench merely by lying still. Firm ground receives a shallow scuff.
  const float ceiling=surface==0?std::min(.025f,available*.42f):std::min(.14f,available*.48f);
  return ceiling*std::clamp(std::pow(pressure/60000.f,.65f),0.f,1.f);
}
}
