#include "TerraVehicle.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Math/RotationMatrix.h"
#include "Materials/MaterialInterface.h"

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
}
void ATerraVehicle::UpdateVisualDetails(){
  if(!Spec.IsValid()||SuspensionParts.Num()!=20)return;
  Protection->SetVisibility(UpgradeStage(TerraSim::Body)>0||UpgradeStage(TerraSim::Frame)>0);
  // Recovery kit is visible on off-road vehicles; the sedan gets its sport trim.
  TrailEquipment->SetVisibility(VehicleIndex==2||UpgradeStage(TerraSim::Electrical)>0);
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
    const FVector Top=Transform.TransformPosition(FVector(X,(I%2?1:-1)*Track*37,18+Tuning.Lift*100));
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
  for(int Axle=0;Axle<2;++Axle){
    const bool Solid=Suspension->GetStringField(Axle?TEXT("rearType"):TEXT("frontType")).Contains(TEXT("solid"));
    SuspensionParts[16+Axle*2]->SetVisibility(Solid);SuspensionParts[17+Axle*2]->SetVisibility(Solid);
    const FVector A=Wheels[Axle*2]->GetComponentLocation(),B=Wheels[Axle*2+1]->GetComponentLocation();
    Link(16+Axle*2,A,B,5.5f);
    SuspensionParts[17+Axle*2]->SetWorldLocation((A+B)*.5);
    SuspensionParts[17+Axle*2]->SetWorldScale3D(FVector(.33,.27,.29));
  }
}
