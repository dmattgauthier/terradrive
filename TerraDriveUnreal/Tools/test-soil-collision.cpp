#include "../Source/TerraDrive/TerraSoilCollision.h"
#include <iostream>
#include <map>
#include <random>
#include <stdexcept>
using namespace TerraSim;
int Checks=0;
void Check(bool Value,const char* Message){++Checks;if(!Value)throw std::runtime_error(Message);}
using Tri=std::array<int,3>;
double Area(const Tri& T,int W){double X[3],Y[3];for(int I=0;I<3;++I){X[I]=T[I]%W;Y[I]=T[I]/W;}return ((X[1]-X[0])*(Y[2]-Y[0])-(Y[1]-Y[0])*(X[2]-X[0]))*.5;}
void Topology(const std::vector<Tri>& Ts,int Div){
 std::map<std::pair<int,int>,std::pair<int,int>> Edges;double A=0;bool Valid=true;
 for(const auto& T:Ts){A-=Area(T,Div+1);Valid&=Area(T,Div+1)<0;for(int I=0;I<3;++I){const int U=T[I],V=T[(I+1)%3];auto& E=Edges[{std::min(U,V),std::max(U,V)}];++E.first;E.second+=U<V?1:-1;}}
 Check(Valid,"all triangles retain the original winding and nonzero area");Check(A==Div*Div,"triangles cover the exact tile area");
 int Boundary=0;for(const auto& Pair:Edges){const auto [U,V]=Pair.first;const auto [N,Direction]=Pair.second;
  const int UX=U%(Div+1),UY=U/(Div+1),VX=V%(Div+1),VY=V/(Div+1);
  if(N==1){++Boundary;Valid&=((UX==VX&&(UX==0||UX==Div)&&std::abs(UY-VY)==1)||(UY==VY&&(UY==0||UY==Div)&&std::abs(UX-VX)==1));}
  else Valid&=N==2&&Direction==0;
 }
 Check(Valid,"interior edges pair exactly; boundary has no cracks or T-junctions");Check(Boundary==4*Div,"every original tile boundary segment is preserved");
 Check(Ts.size()<=size_t(2*Div*Div),"collision never exceeds the original triangle count");
}
template<class H>double Fine(double X,double Y,int Div,H Height){
 int I=std::min(Div-1,int(X)),J=std::min(Div-1,int(Y));double U=X-I,V=Y-J;
 return U+V<=1?Height(I,J)+(Height(I+1,J)-Height(I,J))*U+(Height(I,J+1)-Height(I,J))*V:
  Height(I+1,J+1)+(Height(I,J+1)-Height(I+1,J+1))*(1-U)+(Height(I+1,J)-Height(I+1,J+1))*(1-V);
}
template<class H>double Sparse(double X,double Y,const std::vector<Tri>& Ts,int W,H Height){
 for(const auto& T:Ts){const double AX=T[0]%W,AY=T[0]/W,BX=T[1]%W,BY=T[1]/W,CX=T[2]%W,CY=T[2]/W;
  if(X<std::min({AX,BX,CX})-1e-9||X>std::max({AX,BX,CX})+1e-9||Y<std::min({AY,BY,CY})-1e-9||Y>std::max({AY,BY,CY})+1e-9)continue;
  const double D=(BY-CY)*(AX-CX)+(CX-BX)*(AY-CY);
  const double U=((BY-CY)*(X-CX)+(CX-BX)*(Y-CY))/D,V=((CY-AY)*(X-CX)+(AX-CX)*(Y-CY))/D;
  if(U>=-1e-9&&V>=-1e-9&&U+V<=1+1e-9)return U*Height(int(AX),int(AY))+V*Height(int(BX),int(BY))+(1-U-V)*Height(int(CX),int(CY));
 }
 throw std::runtime_error("uncovered collision sample");
}
int main(){try{
 constexpr int D=64;
 auto Plane=[](int X,int Y){return 100000.+.37*X-.21*Y;};auto Cells=BuildSoilCollisionCells(D,Plane);auto Ts=SoilCollisionTriangles(Cells,D+1);
 Check(Cells.size()==1,"a planar tile requires one leaf");Check(Ts.size()==256,"planar collider reduces8192triangles to256");Topology(Ts,D);
 Check(BuildSoilCollisionCells(0,Plane).empty()&&BuildSoilCollisionCells(3,Plane).empty(),"invalid grid sizes rejected");
 std::mt19937 Random(20261031);std::uniform_real_distribution<double> Q(.001,D-.001);
 for(int Shape=0;Shape<16;++Shape){
  auto H=[&](int X,int Y){const double DX=X-31.3,DY=Y-29.7;switch(Shape%4){
   case 0:return .1*X-.2*Y+(.05+Shape*.1)*std::sin(X*.29)*std::cos(Y*.19);
   case 1:return .02*X*Y+3*std::exp(-(DX*DX+DY*DY)/(.8+Shape*3));
   case 2:return -(2+Shape)*std::exp(-DY*DY/(12+Shape))*std::pow(std::sin(X*.04),2)+.2*std::sin(Y*.7);
   default:return ((X*71+Y*113+Shape*37)%23)*(.01+Shape*.03);
  }};
  auto C=BuildSoilCollisionCells(D,H);const auto T=SoilCollisionTriangles(C,D+1);Topology(T,D);
  Check(SoilCollisionErrorBound(C,H)<=SoilCollisionErrorCM+1e-8,"conservative plane bound holds");
  double Error=0;for(int N=0;N<512;++N){double X=Q(Random),Y=Q(Random);Error=std::max(Error,std::abs(Fine(X,Y,D,H)-Sparse(X,Y,T,D+1,H)));}
  Check(Error<=SoilCollisionErrorCM+1e-7,"actual interpolated surface stays within the bound, not merely grid vertices");
 }
 bool Rut=false;auto H=[&](int X,int Y){return Plane(X,Y)+(Rut&&X==32&&Y==32?20.:0.);};auto C=BuildSoilCollisionCells(D,H);
 Rut=true;Check(RefineSoilCollisionCells(C,H),"a new rut refines the collider");Check(SoilCollisionErrorBound(C,H)<=SoilCollisionErrorCM+1e-8,"refinement restores the height bound");Topology(SoilCollisionTriangles(C,D+1),D);
 Check(!RefineSoilCollisionCells(C,H),"unchanged geometry preserves topology");const auto Count=C.size();Rut=false;Check(!RefineSoilCollisionCells(C,H)&&C.size()==Count,"refinement is monotonic; compaction cannot cause recook churn");
 auto Saddle=[](int X,int Y){return 50.*X*Y;};auto S=BuildSoilCollisionCells(2,Saddle);auto ST=SoilCollisionTriangles(S,3);Topology(ST,2);
 Check(S.size()==4,"saddle requires original fine diagonals");Check(std::abs(Fine(.25,.25,2,Saddle)-Sparse(.25,.25,ST,3,Saddle))<1e-9,"saddle diagonal does not silently change");
 auto Uploaded=[](int X,int Y){return 300.+.17*X-.08*Y+.9*std::sin(X*.19)*std::cos(Y*.23);};
 auto ProxyCells=BuildSoilCollisionCells(D,Uploaded,SoilCollisionBuildErrorCM);
 const auto Proxy=SoilCollisionTriangles(ProxyCells,D+1);
 const double UploadedError=SoilCollisionErrorBound(ProxyCells,Uploaded);
 for(int Dose=1;Dose<=6;++Dose){
  auto Live=[&](int X,int Y){return Uploaded(X,Y)+Dose*.03*std::sin(X*.37+Y*.13);};
  const double Bound=SoilCollisionUploadedErrorBound(D,UploadedError,Uploaded,Live);
  Check(Bound<=SoilCollisionErrorCM,"small live impressions can retain the actual uploaded collider within the original accuracy budget");
  double Error=0;for(int N=0;N<512;++N){const double X=Q(Random),Y=Q(Random);Error=std::max(Error,std::abs(Fine(X,Y,D,Live)-Sparse(X,Y,Proxy,D+1,Uploaded)));}
  Check(Error<=Bound+1e-7,"retained geometry is bounded against the live surface between vertices, not a newly imagined collider");
 }
 auto LargeEdit=[&](int X,int Y){return Uploaded(X,Y)+1.2*std::sin(X*.37+Y*.13);};
 Check(SoilCollisionUploadedErrorBound(D,UploadedError,Uploaded,LargeEdit)>SoilCollisionErrorCM,"larger excavation requires a physical collider refresh");
 RefineSoilCollisionCells(ProxyCells,LargeEdit,SoilCollisionBuildErrorCM);
 const double RefreshedError=SoilCollisionErrorBound(ProxyCells,LargeEdit);
 Check(RefreshedError<=SoilCollisionBuildErrorCM+1e-8,"refresh restores the reserved accuracy margin without changing the public error limit");
 Check(std::abs(SoilCollisionUploadedErrorBound(D,RefreshedError,LargeEdit,LargeEdit)-RefreshedError)<1e-9,"unchanged height and packing-only edits do not require geometry replacement");
 auto HiddenNode=[&](int X,int Y){return Uploaded(X,Y)+(X==17&&Y==29?1.:0.);};
 Check(SoilCollisionUploadedErrorBound(D,UploadedError,Uploaded,HiddenNode)>SoilCollisionErrorCM,"a live fine-grid change is detected even when it is not a sparse collider vertex");
 std::cout<<"PASS "<<Checks<<" soil collision checks\n";return 0;
 }catch(const std::exception& E){std::cerr<<"FAIL after "<<Checks<<": "<<E.what()<<'\n';return 1;}}
