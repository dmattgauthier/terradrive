#include "TerraVehicle.h"
#include "TerraTireCarcass.h"
#include "Components/StaticMeshComponent.h"

float ATerraVehicle::TireSectionWidth(int Wheel) const {
  return Wheel<2?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth;
}

void ATerraVehicle::SetTireCarcassVisual(int Wheel,const FVector& Normal,float PlaneDistanceCM,float DeflectionM) {
  auto* Tire=Wheels[Wheel].Get();
  float Data[12]={};
  if(!Tracks&&DeflectionM>.0001f){
    const auto& Transform=Tire->GetComponentTransform();
    const FVector Scale=Transform.GetScale3D();
    const FVector N=Transform.InverseTransformVectorNoScale(Normal);
    const FVector Radial(N.X,0,N.Z);
    const double Projection=Radial.SizeSquared();
    if(Projection>.20){
      // Flatten radially in the wheel plane so the contact normal does not
      // push rubber into the wheelhouse on a bank. Only the bounded bulge
      // may extend the axial envelope of the unloaded tire.
      const FVector Plane=N*Scale,Push=(Radial/Projection)/Scale;
      Data[0]=Plane.X;Data[1]=Plane.Y;Data[2]=Plane.Z;Data[3]=PlaneDistanceCM;
      Data[4]=Push.X;Data[5]=0;Data[6]=Push.Z;Data[7]=TerraSim::TireCarcassBulge(DeflectionM)*100/Scale.Y;
      Data[8]=TireBeadM*100;Data[9]=Radius*100;
      Data[10]=FMath::Min((Radius-TireBeadM)*30.f,3+DeflectionM*150);
      Data[11]=DeflectionM*100;
    }
  }
  Tire->SetCustomPrimitiveDataFloatArray(0,TArrayView<const float>(Data,UE_ARRAY_COUNT(Data)));
}

void ATerraVehicle::RefreshGarageTirePose(){
  if(!Garage||!Terrain||!Terrain->Spawns.IsValidIndex(Zone))return;
  const float Raised=Tuning.Lift+(Radius-Number(TEXT("tireRadius"),.42f));
  const double Floor=Terrain->Routes.IsValidIndex(RouteIndex)?RouteSpawnPosition(Terrain->Routes[RouteIndex]).Z:Terrain->Spawns[Zone].Z;
  float Drops[MaxWheels]={},AverageDrop=0;
  for(int I=0;I<WheelCount();++I)if(TireCarcassEnabled&&!Tracks){
    const float Load=Mass*9.81f*AxleLoadFraction(I/2)*.5f;
    Drops[I]=TerraSim::MakeTireCarcass(WheelPressure(I),Radius,TireBeadM,TireSectionWidth(I)).Deflection(Load);
    AverageDrop+=Drops[I]/WheelCount();
  }
  const FVector P=GetActorLocation();
  SetActorLocation(FVector(P.X,P.Y,Floor+(CG+Raised-AverageDrop)*100),false,nullptr,ETeleportType::TeleportPhysics);
  const FVector Up=GetActorUpVector();
  for(int I=0;I<WheelCount();++I){
    const FVector Local(AxleOffsetM(I/2)*100,(I%2?1:-1)*Track*50,(Radius-CG-Raised+AverageDrop-Drops[I])*100);
    Wheels[I]->SetWorldLocationAndRotation(GetActorTransform().TransformPosition(Local),GetActorQuat());
    SetTireCarcassVisual(I,Up,(Radius-Drops[I])*100,Drops[I]);
  }
}
