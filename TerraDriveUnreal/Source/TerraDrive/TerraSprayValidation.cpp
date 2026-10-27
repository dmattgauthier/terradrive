#include "TerraSprayValidation.h"
#include "TerraVehicle.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"

namespace TerraSprayValidation {
namespace {
struct FState {
 TWeakObjectPtr<ATerraVehicle> Vehicle;
 TWeakObjectPtr<ACameraActor> Camera;
 int Trial=0,Phase=0,Before=0,PrimaryBefore=0;
 float Time=0,TravelBefore=0;
 FVector Origin=FVector::ZeroVector;
} State;
const int Zones[]={0,3,7,5,2,4};
const int Surfaces[]={0,2,6,5,4,3};
const int Kinds[]={5,0,2,3,4,1};
const TCHAR* Names[]={TEXT("grass"),TEXT("mud"),TEXT("snow"),TEXT("sand"),TEXT("gravel"),TEXT("water")};
void DisableContacts(ATerraVehicle* V){for(auto& W:V->WheelState)W.ContactValid=false;}
void Drain(ATerraVehicle* V){DisableContacts(V);for(int I=0;I<80;I++)V->AdvanceSprayForValidation(.05f);}
int Rendered(ATerraVehicle* V){int Count=0;for(auto M:V->SprayMeshes)Count+=M->GetInstanceCount();return Count;}
void Contact(ATerraVehicle* V,int Surface,bool Loaded=true,bool Constructed=false){
 DisableContacts(V);
 for(int I=2;I<4;I++){
  auto& W=V->WheelState[I];W.ContactValid=true;W.Load=Loaded?5500:0;W.Slip=1.6f;
  W.LongSpeed=W.LateralSpeed=0;W.Omega=28;W.Footprint=.34f;W.Constructed=Constructed;
  W.ForceForward=FVector::ForwardVector;W.PointVelocity=FVector::ZeroVector;
  W.Contact=State.Origin+FVector(0,I==2?-80:80,0);
  if(State.Trial==0&&Surface==0){
   W.Contact=V->Terrain->NearestCrushable(W.Contact);
   const FVector Plant=W.Contact;
   for(int X=-150;X<=150&&V->Terrain->VegetationCoverage(W.Contact)<.5f;X+=25)
    for(int Y=-150;Y<=150;Y+=25){const FVector P=Plant+FVector(X,Y,0);if(V->Terrain->VegetationCoverage(P)>.5f){W.Contact=P;break;}}
  }
  W.Contact.Z=V->Terrain->Height(W.Contact.X,W.Contact.Y);
  W.Ground=V->Terrain->Sample(W.Contact);W.Ground.Surface=Surface;W.Ground.Normal=FVector::UpVector;W.Ground.Water=State.Trial==5?12:0;
 }
}
void Frame(ATerraVehicle* V){
 if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
 FVector Focus=State.Origin+FVector(-90,0,55);
 Focus.Z=FMath::Max(Focus.Z,V->Terrain->Height(Focus.X,Focus.Y)+55);
 const FVector N=V->Terrain->Sample(State.Origin).Normal;
 const FVector Downhill=FVector(N.X,N.Y,0).GetSafeNormal();
 const FVector Offset=N.X*N.X+N.Y*N.Y>.02f?Downhill*330+FVector(-Downhill.Y,Downhill.X,0)*100:FVector(-300,-240,0);
 FVector Eye=Focus+Offset+FVector(0,0,180);
 Eye.Z=FMath::Max(Eye.Z,V->Terrain->Height(Eye.X,Eye.Y)+120);
 // Terrain can rise behind the tire on snow drifts. Keep the complete view
 // ray above that surface rather than accepting an underground capture.
 for(int Lift=0;Lift<16;Lift++){
  bool Clear=true;for(int I=1;I<12;I++){const FVector P=FMath::Lerp(Eye,Focus,I/12.f);Clear&=P.Z>V->Terrain->Height(P.X,P.Y)+20;}
  if(Clear)break;Eye.Z+=60;
 }
 State.Camera->SetActorLocationAndRotation(Eye,(Focus-Eye).Rotation());State.Camera->GetCameraComponent()->SetFieldOfView(57);
 if(auto* PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(State.Camera.Get());if(auto* H=PC->GetHUD())H->bShowHUD=false;}
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
 if(State.Vehicle.Get()!=V){State=FState();State.Vehicle=V;}
 State.Time+=Dt;
 if(State.Phase==0){
  V->SetGarage(true);V->SelectVehicle(0);V->ResetUpgrades(false);V->TeleportZone(Zones[State.Trial]);V->SetGarage(false);
  State.Time=0;State.Phase=1;return false;
 }
 if(State.Phase==1){
  if(State.Time<1.1f)return false;
  // Controlled emitter fixtures intentionally hold the chassis still and
  // supply measured-style wheel contact inputs. Actual tire/soil coupling is
  // covered independently by the driven rut and full native validation.
  V->SetActorTickEnabled(false);V->Chassis->SetSimulatePhysics(false);V->FourDrive=true;V->Overturned=false;
  State.Origin=V->GetActorLocation()+FVector(-260,0,0);State.Origin.Z=V->Terrain->Height(State.Origin.X,State.Origin.Y);
  if(State.Trial==0){
   State.Origin=V->Terrain->NearestCrushable(State.Origin);
   bool Assets=V->SprayMeshes.Num()==6;for(auto M:V->SprayMeshes)Assets&=M->GetStaticMesh()!=nullptr&&M->GetMaterial(0)!=nullptr;
   Check(TEXT("six surface-specific debris meshes and materials load in the cooked game"),Assets,V->SprayMeshes.Num());
   Check(TEXT("mud and stones use a faceted clod while grass uses a flattened blade"),Assets&&V->SprayMeshes[0]->GetStaticMesh()->GetName()==TEXT("detail_soil_clod")&&V->SprayMeshes[4]->GetStaticMesh()==V->SprayMeshes[0]->GetStaticMesh()&&V->SprayMeshes[5]->GetStaticMesh()!=V->SprayMeshes[0]->GetStaticMesh(),Assets?1:0);
  }
  Drain(V);State.Before=V->SprayEmitted;State.PrimaryBefore=V->SprayKindEmitted[Kinds[State.Trial]];State.TravelBefore=V->SprayTravelCM;
  Contact(V,Surfaces[State.Trial]);Frame(V);State.Phase=2;State.Time=0;return false;
 }
 if(State.Phase==2){
  V->AdvanceSprayForValidation(FMath::Min(Dt,.05f));
  if(State.Time<1.4f)return false;
  const FString Label=FString(Names[State.Trial])+TEXT(" emitter ");
  const int Primary=V->SprayKindEmitted[Kinds[State.Trial]]-State.PrimaryBefore;
  Check(Label+TEXT("loaded driven wheelspin ejects its surface material while the vehicle is stationary"),Primary>10,Primary);
  Check(Label+TEXT("particles move through world space"),V->SprayTravelCM-State.TravelBefore>300,V->SprayTravelCM-State.TravelBefore);
  Check(Label+TEXT("live debris remains bounded and renders"),V->SprayCount()>0&&V->SprayCount()<900&&Rendered(V)>0,Rendered(V));
  bool Finite=true;float MinScale=FLT_MAX,MaxScale=0;int Oriented=0;
  for(auto M:V->SprayMeshes)for(int I=0;I<M->GetInstanceCount();I++){
   FTransform T;M->GetInstanceTransform(I,T,true);Finite&=!T.ContainsNaN()&&FVector::Dist(T.GetLocation(),State.Origin)<1800;
   const float Scale=T.GetScale3D().GetAbsMax();MinScale=FMath::Min(MinScale,Scale);MaxScale=FMath::Max(MaxScale,Scale);Oriented+=!T.GetRotation().IsIdentity(.001f);
  }
  Check(Label+TEXT("all rendered transforms are finite and local to the tire plume"),Finite,MaxScale);
  Check(Label+TEXT("tumbling fragments have diverse sizes and orientation"),MaxScale>MinScale*1.5f&&Oriented>2,MaxScale/FMath::Max(.00001f,MinScale));
  Capture(*FString::Printf(TEXT("native-ejection-%s.png"),Names[State.Trial]));
  DisableContacts(V);State.Time=0;State.Phase=3;return false;
 }
 if(State.Phase==3){
  V->AdvanceSprayForValidation(FMath::Min(Dt,.05f));if(State.Time<3)return false;
  Check(FString(Names[State.Trial])+TEXT(" debris expires completely after tread work stops"),V->SprayCount()==0&&Rendered(V)==0,Rendered(V));
  if(++State.Trial<6){V->SetActorTickEnabled(true);V->Chassis->SetSimulatePhysics(true);State.Phase=0;State.Time=0;return false;}
  // Guard the non-emitting cases in the actual native update path.
  State.Trial=0;
  auto Gate=[&](const TCHAR* Label,int Surface,bool Loaded,bool Constructed,bool Tipped){
   Drain(V);Contact(V,Surface,Loaded,Constructed);V->Overturned=Tipped;const int Before=V->SprayEmitted;
   for(int I=0;I<20;I++)V->AdvanceSprayForValidation(.05f);
   Check(Label,V->SprayEmitted==Before,V->SprayEmitted-Before);V->Overturned=false;
  };
  Gate(TEXT("pavement never emits terrain debris"),1,true,false,false);
  Gate(TEXT("unloaded airborne tires never emit ground debris"),2,false,false,false);
  Gate(TEXT("an overturned chassis never emits driven tire debris"),2,true,false,true);
  Gate(TEXT("solid constructed rocks do not erode into spray"),4,true,true,false);
  Drain(V);State.Origin=V->Terrain->Spawns[1];Contact(V,2);bool Bare=true;
  for(auto& W:V->WheelState)if(W.ContactValid){W.Ground.Surface=0;Bare&=V->Terrain->VegetationCoverage(W.Contact)<.2f;}
  const int GrassBefore=V->SprayKindEmitted[5];for(int I=0;I<20;I++)V->AdvanceSprayForValidation(.05f);
  Check(TEXT("bare hard dirt does not eject green grass fragments"),Bare&&V->SprayKindEmitted[5]==GrassBefore,V->SprayKindEmitted[5]-GrassBefore);
  Drain(V);Contact(V,2);for(auto& W:V->WheelState)W.Omega=W.Slip=0;const int Before=V->SprayEmitted;
  for(int I=0;I<20;I++)V->AdvanceSprayForValidation(.05f);
  Check(TEXT("stationary tires leave no static debris stream"),V->SprayEmitted==Before,V->SprayEmitted-Before);
  Drain(V);V->SetActorTickEnabled(true);V->Chassis->SetSimulatePhysics(true);V->TeleportZone(0);return true;
 }
 return false;
}
}
