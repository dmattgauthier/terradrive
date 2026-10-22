#include "TerraVehicle.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Math/RotationMatrix.h"
#include "Materials/MaterialInterface.h"
#include "Components/RectLightComponent.h"

void ATerraVehicle::UpdateWheelVisuals(){
  const FVector Up=GetActorUpVector();
  for(int I=0;I<4;++I){
    const auto &W=WheelState[I];
    FQuat Q=FQuat(Up,Overturned?0.f:W.Angle)*GetActorQuat();
    if(!Tracks)Q=Q*FQuat(FVector::RightVector,W.Rotation);
    Wheels[I]->SetWorldLocationAndRotation(W.Center,Q);
  }
}

void ATerraVehicle::CreateVisualDetails(){
  if(!SuspensionParts.IsEmpty())return;
  for(int I=0;I<20;++I){
    auto *C=NewObject<UStaticMeshComponent>(this);
    C->SetupAttachment(Chassis);C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    C->SetMobility(EComponentMobility::Movable);
    C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,I<16&&I%4==2?
      TEXT("/Game/Meshes/detail_coil"):I>=16&&I%2==1?
      TEXT("/Engine/BasicShapes/Sphere.Sphere"):TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
    const TCHAR* Mat=I%4==1?TEXT("/Game/Materials/Native_Chrome"):TEXT("/Game/Materials/Native_SuspensionSteel");
    if(I%4!=2||I>=16)C->SetMaterial(0,LoadObject<UMaterialInterface>(nullptr,Mat));
    C->RegisterComponent();SuspensionParts.Add(C);
  }
  for(int I=0;I<16;++I){
    auto *C=NewObject<UStaticMeshComponent>(this);C->SetupAttachment(Chassis);
    C->SetCollisionEnabled(ECollisionEnabled::NoCollision);C->SetMobility(EComponentMobility::Movable);
    C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,I%4==2?TEXT("/Game/Meshes/detail_brake_caliper"):I%4==3?
        TEXT("/Engine/BasicShapes/Sphere.Sphere"):TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
    if(I%4!=2)C->SetMaterial(0,LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Materials/Native_SuspensionSteel")));
    C->RegisterComponent();HubDetails.Add(C);
  }
  for(int I=0;I<2;++I){
    auto *L=NewObject<URectLightComponent>(this);L->SetupAttachment(Chassis);L->SetMobility(EComponentMobility::Movable);
    const FVector P=I==0?FVector(260,-350,390):FVector(-280,330,300);
    L->SetRelativeLocation(P);L->SetRelativeRotation((-P).Rotation());
    L->SetSourceWidth(230);L->SetSourceHeight(330);L->SetAttenuationRadius(900);
    L->SetIntensityUnits(ELightUnits::Lumens);L->SetIntensity(I==0?45:30);
    L->SetLightColor(I==0?FLinearColor(.95,.98,1):FLinearColor(1,.94,.85));
    L->SetCastShadows(false);L->SetVisibility(false);L->RegisterComponent();GarageLights.Add(L);
    L->SetSpecularScale(.20f);
  }
}
void ATerraVehicle::UpdateVisualDetails(){
  if(!Spec.IsValid()||SuspensionParts.Num()!=20)return;
  Protection->SetVisibility(UpgradeStage(TerraSim::Body)>0||UpgradeStage(TerraSim::Frame)>0);
  // Recovery kit is visible on off-road vehicles; the sedan gets its sport trim.
  TrailEquipment->SetVisibility(VehicleIndex==2||UpgradeStage(TerraSim::Electrical)>0);
  for(auto Light:GarageLights)Light->SetVisibility(Garage);
  for(int I=0;I<Rims.Num();++I){
    Rims[I]->SetVisibility(!Tracks);
    Rims[I]->SetWorldLocationAndRotation(Wheels[I]->GetComponentLocation(),Wheels[I]->GetComponentQuat());
    // Tire diameter changes sidewall height. It must not inflate the factory
    // 16/17/18-inch rim or brake rotor along with the rubber.
    const float AxleWidth=I>=2?Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))/Number(TEXT("tireWidth"),.285f):1.f;
    Rims[I]->SetWorldScale3D(FVector(1,Tuning.TireWidth*AxleWidth,1));
  }
  auto Link=[&](int I,FVector A,FVector B,float RadiusCM){
    const FVector D=B-A;
    auto *C=SuspensionParts[I].Get();
    C->SetWorldLocationAndRotation((A+B)*.5,FRotationMatrix::MakeFromZ(D).ToQuat());
    C->SetWorldScale3D(FVector(RadiusCM/50,RadiusCM/50,D.Size()/100));
  };
  const auto Transform=GetActorTransform();
  for(int I=0;I<4;++I){
    const bool Front=I<2;const float X=Wheelbase*(Front?1-FrontWeight:-FrontWeight)*100;
    FVector Hub=Wheels[I]->GetComponentLocation();
    const FVector Top=Transform.TransformPosition(FVector(X,(I%2?1:-1)*Track*37,18));
    const FVector Lower=Hub+GetActorUpVector()*5;
    Link(I*4,Lower,FMath::Lerp(Lower,Top,.68f),3.2f);
    Link(I*4+1,FMath::Lerp(Lower,Top,.45f),Top,1.4f);
    auto *Coil=SuspensionParts[I*4+2].Get();
    const FVector D=Top-Lower;
    Coil->SetWorldLocationAndRotation((Top+Lower)*.5,FRotationMatrix::MakeFromZ(D).ToQuat());
    Coil->SetWorldScale3D(FVector(VehicleIndex==2?.72f:1.f,VehicleIndex==2?.72f:1.f,D.Size()/100));
    Link(I*4+3,Transform.TransformPosition(FVector(X+(Front?-28:28),0,-12)),Hub,1.8f);
  }
  const auto Suspension=Spec->GetObjectField(TEXT("suspension"));
  for(int I=0;I<4&&HubDetails.Num()==16;++I){
    const float Side=I%2?1.f:-1.f,X=Wheelbase*(I<2?1-FrontWeight:-FrontWeight)*100;
    const auto Type=Suspension->GetStringField(I<2?TEXT("frontType"):TEXT("rearType"));
    const FVector Hub=Wheels[I]->GetComponentLocation();
    const FQuat Steering=FQuat(GetActorUpVector(),WheelState[I].Angle)*GetActorQuat();
    const FVector Joint=Hub+Steering.RotateVector(FVector(0,-Side*8,12));
    for(int Branch=0;Branch<2;++Branch){
      auto *Part=HubDetails[I*4+Branch].Get();Part->SetVisibility(!Tracks&&Type.Contains(TEXT("wishbone")));
      const FVector A=Transform.TransformPosition(FVector(X+(Branch?16:-16),Side*Track*27,3));
      const FVector D=Joint-A;Part->SetWorldLocationAndRotation((A+Joint)*.5,FRotationMatrix::MakeFromZ(D).ToQuat());
      Part->SetWorldScale3D(FVector(.040,.040,D.Size()/100));
    }
    const float RimRadius=VehicleIndex==5?27.94f:VehicleIndex==3?20.32f:VehicleIndex<2?21.59f:22.86f;
    auto *Caliper=HubDetails[I*4+2].Get();Caliper->SetVisibility(!Tracks);
    Caliper->SetWorldLocationAndRotation(Hub+Steering.RotateVector(FVector(-RimRadius*.60f,Side*Width*16,0)),Steering);
    auto *Knuckle=HubDetails[I*4+3].Get();Knuckle->SetVisibility(!Tracks&&!Type.Contains(TEXT("solid")));
    Knuckle->SetWorldLocationAndRotation(Joint,Steering);Knuckle->SetWorldScale3D(FVector(.10,.12,.19));
  }
  for(int Axle=0;Axle<2;++Axle){
    const bool Solid=Suspension->GetStringField(Axle?TEXT("rearType"):TEXT("frontType")).Contains(TEXT("solid"));
    SuspensionParts[16+Axle*2]->SetVisibility(Solid);SuspensionParts[17+Axle*2]->SetVisibility(Solid);
    const FVector A=Wheels[Axle*2]->GetComponentLocation(),B=Wheels[Axle*2+1]->GetComponentLocation();
    Link(16+Axle*2,A,B,5.5f);
    SuspensionParts[17+Axle*2]->SetWorldLocation((A+B)*.5);
    SuspensionParts[17+Axle*2]->SetWorldScale3D(FVector(.33,.27,.29));
  }
}
