#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace TerraSim {
// Collision follows the same height samples as the rendered soil. Planar
// regions need far fewer triangles; curved ruts refine back to the fine grid.
// Every leaf retains EVERY fine-grid boundary vertex, including where leaf
// sizes differ. Thus neighbouring leaves/tiles share edges without T-junctions.
struct SoilCollisionCell { int X,Y,Size; };
constexpr double SoilCollisionErrorCM=.5; // 0.197 inch maximum vertical error.
// Reserve half the error budget for small live edits. Replacing the Chaos
// geometry for every fractional-millimetre edit deep-copies the triangle mesh
// and discards its resting contacts, even when its topology is unchanged.
constexpr double SoilCollisionBuildErrorCM=SoilCollisionErrorCM*.5;

template<class Uploaded,class Current>
double SoilCollisionUploadedErrorBound(int Div,double UploadedTopologyError,Uploaded Before,Current After) {
  double Movement=0;
  for(int Y=0;Y<=Div;++Y)for(int X=0;X<=Div;++X)
    Movement=std::max(Movement,std::abs(Before(X,Y)-After(X,Y)));
  // Both fine surfaces share the original diagonals. Their difference is a
  // linear interpolation of vertex differences, so this bound holds between
  // vertices too. Add the existing sparse-to-uploaded interpolation bound.
  return UploadedTopologyError+Movement;
}

template<class Height>
double SoilCollisionPlaneError(const SoilCollisionCell& C,Height H) {
  const int X=C.X,Y=C.Y,S=C.Size;
  const double A=H(X,Y),B=H(X+S,Y),D=H(X,Y+S),E=H(X+S,Y+S);
  const double DX=(B-A+E-D)/(2*S),DY=(D-A+E-B)/(2*S);
  const double Z=(A+B+D+E)*.25-(DX+DY)*S*.5;
  double Error=0;
  for(int J=0;J<=S;++J)for(int I=0;I<=S;++I)
    Error=std::max(Error,std::abs(H(X+I,Y+J)-(Z+DX*I+DY*J)));
  return Error;
}
template<class Height>
void AppendSoilCollisionCells(std::vector<SoilCollisionCell>& Out,SoilCollisionCell C,Height H,double Limit) {
  // Both triangulations are within e of one plane at every vertex. Linear
  // interpolation therefore bounds their difference EVERYWHERE by 2e,
  // including crossings between old and new triangle edges. Fine leaves keep
  // the original diagonal exactly; checking only sampled interpolation would
  // miss saddle/diagonal errors.
  if(C.Size==1||2*SoilCollisionPlaneError(C,H)<=Limit){Out.push_back(C);return;}
  const int S=C.Size/2;
  AppendSoilCollisionCells(Out,{C.X,C.Y,S},H,Limit);
  AppendSoilCollisionCells(Out,{C.X+S,C.Y,S},H,Limit);
  AppendSoilCollisionCells(Out,{C.X,C.Y+S,S},H,Limit);
  AppendSoilCollisionCells(Out,{C.X+S,C.Y+S,S},H,Limit);
}
template<class Height>
std::vector<SoilCollisionCell> BuildSoilCollisionCells(int Div,Height H,double Limit=SoilCollisionErrorCM) {
  std::vector<SoilCollisionCell> Out;
  if(Div>0&&(Div&(Div-1))==0&&Limit>=0)AppendSoilCollisionCells(Out,{0,0,Div},H,Limit);
  return Out;
}
template<class Height>
bool RefineSoilCollisionCells(std::vector<SoilCollisionCell>& Cells,Height H,double Limit=SoilCollisionErrorCM) {
  std::vector<SoilCollisionCell> Next;Next.reserve(Cells.size());
  for(const auto& C:Cells)AppendSoilCollisionCells(Next,C,H,Limit);
  const bool Changed=Next.size()!=Cells.size();
  if(Changed)Cells=std::move(Next);
  return Changed;
}
template<class Height>
double SoilCollisionErrorBound(const std::vector<SoilCollisionCell>& Cells,Height H) {
  double Bound=0;for(const auto& C:Cells)if(C.Size>1)Bound=std::max(Bound,2*SoilCollisionPlaneError(C,H));
  return Bound;
}
inline std::vector<std::array<int,3>> SoilCollisionTriangles(const std::vector<SoilCollisionCell>& Cells,int Width) {
  std::vector<std::array<int,3>> Out;
  auto Index=[&](int X,int Y){return Y*Width+X;};
  for(const auto& C:Cells){
    const int X=C.X,Y=C.Y,S=C.Size;
    if(S==1){const int A=Index(X,Y);Out.push_back({A,A+Width,A+1});Out.push_back({A+1,A+Width,A+Width+1});continue;}
    const int Center=Index(X+S/2,Y+S/2);
    for(int I=0;I<S;++I){
      Out.push_back({Center,Index(X,Y+I),Index(X,Y+I+1)});
      Out.push_back({Center,Index(X+I,Y+S),Index(X+I+1,Y+S)});
      Out.push_back({Center,Index(X+S,Y+S-I),Index(X+S,Y+S-I-1)});
      Out.push_back({Center,Index(X+S-I,Y),Index(X+S-I-1,Y)});
    }
  }
  return Out;
}
}
