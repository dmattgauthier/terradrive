#pragma once
#include <algorithm>
#include <cmath>
namespace TerraSpray {
struct Response {float Rate=0,Launch=0,Up=0,Fan=0,Radius=0,Drag=0,Life=0;int Kind=0;};
// Rates are particles/s; velocities m/s and radii cm. Loaded tread speed,
// rather than vehicle speed alone, makes a bogged driven wheel throw soil.
inline Response Evaluate(int surface,bool loose,bool grass,float water,float load,float slip,float tread,float road,bool driven){
 Response r;if(surface==1||load<100||!std::isfinite(load)||!std::isfinite(tread)||!std::isfinite(road)||!std::isfinite(slip))return r;
 const float spin=driven?std::clamp(std::abs(tread-road),0.f,16.f):0.f;
 const float roll=std::abs(road),work=spin+std::min(roll,18.f)*(driven?.28f:.045f);
 if(work<.22f)return r;
 if(surface==4){if(!driven||spin<.8f)return r;r.Kind=4;r.Rate=std::min(12.f,spin*1.4f);r.Radius=.7f;r.Launch=2.7f;r.Up=.48f;r.Fan=.6f;r.Drag=.12f;r.Life=1.35f;}
 else if(water>.02f){r.Kind=1;r.Rate=std::min(72.f,work*9);r.Radius=.8f;r.Launch=2.2f;r.Up=.85f;r.Fan=1.05f;r.Drag=1.5f;r.Life=.9f;}
 else {r.Kind=surface==6?2:surface==5?3:grass&&std::abs(slip)>.7f?5:0;r.Rate=std::min(76.f,work*(surface==6?10.f:8.f));r.Radius=surface==6?1.7f:surface==5?.65f:r.Kind==5?.9f:1.4f;r.Launch=surface==5?2.8f:2.1f;r.Up=surface==6?1.05f:.7f;r.Fan=surface==5?1.3f:.75f;r.Drag=surface==6?2.f:surface==5?1.4f:r.Kind==5?1.8f:.65f;r.Life=surface==6?1.6f:1.3f;}
 if(surface==0&&!loose&&!grass){r.Radius=.45f;r.Rate*=.35f;r.Up=.35f;r.Drag=1.7f;}
 r.Rate*=std::clamp(std::sqrt(load/5000.f),.22f,1.25f);
 r.Launch*=std::clamp(.4f+work*.2f,.45f,2.8f);return r;
}
}
