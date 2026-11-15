#pragma once

#include <algorithm>
#include <cmath>
#include <limits>

namespace TerraSim {

// Coordinates in the rolling tire's frame, relative to the suspension mount.
struct TreadPoint {
  float X, Y, Z;
};

struct TreadContact {
  TreadPoint Point{};
  float Travel=std::numeric_limits<float>::max();
  float RadialX=0,RadialZ=0,Radius=0;
};

inline TreadPoint InterpolateTreadPoint(const TreadPoint& A,const TreadPoint& B,float T){
  return {A.X+(B.X-A.X)*T,A.Y+(B.Y-A.Y)*T,A.Z+(B.Z-A.Z)*T};
}

inline void ContactAlongTreadEdge(const TreadPoint& A,const TreadPoint& B,float Radius,TreadContact& Contact){
  const float DX=B.X-A.X,DZ=B.Z-A.Z;
  const float Limit=Radius*.988f; // Keep at least 15% upward support near the front and back of the tire.
  float T;
  if(std::abs(DX)<.0001f){
    if(std::abs(A.X)>Limit)return;
    T=DZ>0?1.f:0.f;
  }else{
    const float T0=(-Limit-A.X)/DX,T1=(Limit-A.X)/DX;
    const float Low=std::max(0.f,std::min(T0,T1)),High=std::min(1.f,std::max(T0,T1));
    if(Low>High)return;
    // Maximize terrain height plus the depth of the circular tread along
    // this edge. The tangent and the clipped endpoints cover the maximum.
    const float TangentX=std::copysign(Radius,DX)*DZ/std::sqrt(DX*DX+DZ*DZ);
    T=std::clamp((TangentX-A.X)/DX,Low,High);
  }
  const auto P=InterpolateTreadPoint(A,B,T);
  const float Arc=std::sqrt(std::max(0.f,Radius*Radius-P.X*P.X));
  const float Travel=-P.Z-Arc;
  if(Travel<Contact.Travel)Contact={P,Travel,-P.X/Radius,Arc/Radius,Radius};
}

inline int ClipTreadWidth(const TreadPoint* Input,int Count,float Side,float HalfWidth,TreadPoint* Output){
  int Kept=0;
  for(int I=0;I<Count;++I){
    const auto& A=Input[I];
    const auto& B=Input[(I+1)%Count];
    const float DA=A.Y*Side-HalfWidth,DB=B.Y*Side-HalfWidth;
    if(DA<=0)Output[Kept++]=A;
    if((DA<0&&DB>0)||(DA>0&&DB<0))
      Output[Kept++]=InterpolateTreadPoint(A,B,DA/(DA-DB));
  }
  return Kept;
}

inline void ContactAgainstTreadTriangle(const TreadPoint (&Triangle)[3],float Radius,float HalfWidth,TreadContact& Contact){
  TreadPoint Left[5],Inside[6];
  const int LeftCount=ClipTreadWidth(Triangle,3,-1.f,HalfWidth,Left);
  const int Count=ClipTreadWidth(Left,LeftCount,1.f,HalfWidth,Inside);
  // The clipped triangle projects to a polygon in the rolling plane. At a
  // given longitudinal coordinate the highest terrain is on its boundary.
  for(int I=0;I<Count;++I)ContactAlongTreadEdge(Inside[I],Inside[(I+1)%Count],Radius,Contact);
}

// Pack the 6x6 height samples as exact 24-bit integers in float custom data.
// Heights are relative to the hub and resolved to an eighth of a centimetre.
struct TreadHeightPatch {
  static constexpr int Size=6, Offset=12, Heights=16, DataEnd=34;
  static unsigned Quantize(float Height){
    return unsigned(std::clamp(std::ceil(Height*8.f)+2048.f,0.f,4095.f));
  }
  static float Pack(float A,float B){
    return float(Quantize(A)|(Quantize(B)<<12));
  }
  static float Height(const float* Data,float X,float Y){
    const float U=(X-Data[Offset])*Data[Offset+3],V=(Y-Data[Offset+1])*Data[Offset+3];
    if(U<0||U>Size-1||V<0||V>Size-1)return -10000.f;
    const int I=std::min(int(U),Size-2),J=std::min(int(V),Size-2);
    const auto Read=[&](int Index){
      const unsigned Packed=unsigned(Data[Heights+Index/2]);
      return (float((Packed>>(12*(Index&1)))&4095u)-2048.f)*.125f;
    };
    const int A=J*Size+I;
    const float H0=Read(A),H1=Read(A+1),H2=Read(A+Size),H3=Read(A+Size+1);
    return U-I+V-J<=1?H0+(H1-H0)*(U-I)+(H2-H0)*(V-J):
      H3+(H2-H3)*(I+1-U)+(H1-H3)*(J+1-V);
  }
};
}
