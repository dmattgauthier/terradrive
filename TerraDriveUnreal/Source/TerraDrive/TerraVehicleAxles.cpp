#include "TerraVehicle.h"
#include "Components/StaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Materials/MaterialInterface.h"

int ATerraVehicle::WheelCount()const{return Number(TEXT("wheelCount"),4)==6?6:4;}
float ATerraVehicle::AxleOffsetM(int Axle)const{
  const TArray<TSharedPtr<FJsonValue>>* Offsets=nullptr;
  if(Spec.IsValid()&&Spec->TryGetArrayField(TEXT("axleOffsetsM"),Offsets)&&Offsets->IsValidIndex(Axle)){
    double X;if((*Offsets)[Axle]->TryGetNumber(X)&&FMath::IsFinite(X))return X;
  }
  return Wheelbase*(Axle==0?1-FrontWeight:-FrontWeight);
}
float ATerraVehicle::AxleLoadFraction(int Axle)const{
  return Axle==0?FrontWeight:(1-FrontWeight)/(AxleCount()-1);
}
bool ATerraVehicle::TandemLockActive()const{
  // EV donor kits retain a geared tandem rear distribution. The independent
  // front drive in multi-motor kits still has no mechanical center shaft.
  return AxleCount()==3&&(CenterLockActive()||IsElectric());
}
float ATerraVehicle::WheelShaftCouplingNm(int Wheel)const{
  if(Wheel<2)return LastCenterCouplingNm*.5f;
  return -LastCenterCouplingNm/(WheelCount()-2)+(WheelCount()==6?(Wheel<4?1.f:-1.f)*LastTandemCouplingNm*.5f:0.f);
}
void ATerraVehicle::ResizeWheelComponents(){
  const int Count=WheelCount(),Axles=AxleCount();
  while(Wheels.Num()>Count){Wheels.Last()->DestroyComponent();Wheels.Pop();Rims.Last()->DestroyComponent();Rims.Pop();}
  while(Wheels.Num()<Count){
    auto* W=NewObject<UStaticMeshComponent>(this);W->SetupAttachment(Chassis);W->SetCollisionEnabled(ECollisionEnabled::NoCollision);W->RegisterComponent();Wheels.Add(W);
    auto* R=NewObject<UStaticMeshComponent>(this);R->SetupAttachment(Chassis);R->SetCollisionEnabled(ECollisionEnabled::NoCollision);R->RegisterComponent();Rims.Add(R);
  }
  if(SuspensionParts.Num()==Count*4+Axles*2&&HubDetails.Num()==Count*4)return;
  for(auto P:SuspensionParts)P->DestroyComponent();SuspensionParts.Reset();
  for(auto P:HubDetails)P->DestroyComponent();HubDetails.Reset();
  for(int I=0;I<Count*4+Axles*2;++I){
    auto* C=NewObject<UStaticMeshComponent>(this);C->SetupAttachment(Chassis);C->SetCollisionEnabled(ECollisionEnabled::NoCollision);C->SetMobility(EComponentMobility::Movable);
    C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,I<Count*4&&I%4==2?TEXT("/Game/Meshes/detail_coil"):I>=Count*4&&I%2==1?TEXT("/Engine/BasicShapes/Sphere.Sphere"):TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
    if(I>=Count*4||I%4!=2)C->SetMaterial(0,LoadObject<UMaterialInterface>(nullptr,I%4==1?TEXT("/Game/Materials/Native_Chrome"):TEXT("/Game/Materials/Native_SuspensionSteel")));
    C->RegisterComponent();SuspensionParts.Add(C);
  }
  for(int I=0;I<Count*4;++I){
    auto* C=NewObject<UStaticMeshComponent>(this);C->SetupAttachment(Chassis);C->SetCollisionEnabled(ECollisionEnabled::NoCollision);C->SetMobility(EComponentMobility::Movable);
    C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,I%4==2?TEXT("/Game/Meshes/detail_brake_caliper"):I%4==3?TEXT("/Engine/BasicShapes/Sphere.Sphere"):TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
    if(I%4!=2)C->SetMaterial(0,LoadObject<UMaterialInterface>(nullptr,I%4==1?TEXT("/Game/Materials/Native_Chrome"):TEXT("/Game/Materials/Native_SuspensionSteel")));
    C->RegisterComponent();HubDetails.Add(C);
  }
}
