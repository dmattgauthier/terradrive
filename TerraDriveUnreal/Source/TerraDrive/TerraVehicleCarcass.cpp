#include "TerraVehicle.h"
#include "TerraTireCarcass.h"
#include "TerraTreadContact.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"

void ATerraVehicle::RegisterActorTickFunctions(bool bRegister){
  Super::RegisterActorTickFunctions(bRegister);
  if(bRegister&&!IsTemplate()){
    WheelPresentationTick.SetTickFunctionEnable(true);
    WheelPresentationTick.RegisterTickFunction(GetLevel());
  }else if(WheelPresentationTick.IsTickFunctionRegistered()){
    WheelPresentationTick.UnRegisterTickFunction();
  }
}

void ATerraVehicle::FWheelPresentationTick::ExecuteTick(float,ELevelTick,ENamedThreads::Type,const FGraphEventRef&){
  Vehicle->PresentWheels();
}

FString ATerraVehicle::FWheelPresentationTick::DiagnosticMessage(){
  return TEXT("TerraDrive wheel presentation");
}

void ATerraVehicle::PresentWheels(){
  if(!WheelPresentationPending)return;
  WheelPresentationPending=false;
  if(!Terrain||Garage)return;

  // Chaos advances the chassis after the force solve. Bind the tire and its
  // fixed rim to the current surface using the new chassis transform.
  const FVector Up=GetActorUpVector();
  if(TireCarcassEnabled&&!Tracks&&!Overturned&&Up.Z>.55f&&Radius>=.50f){
    const FTransform Pose=GetActorTransform();
    const float RadiusCM=Radius*100,MaxTravelCM=(Rest+Droop)*100;
    for(int I=0;I<WheelCount();++I){
      const auto& W=WheelState[I];
      if(W.Constructed)continue;
      const FVector Mount=Pose.TransformPosition(W.MountLocal);
      const FVector Forward=FQuat(Up,W.Angle).RotateVector(GetActorForwardVector());
      const float WidthCM=TireSectionWidth(I)*100;
      bool NearBedrock=false;
      auto Surface=Terrain->CastBedrockTread(Mount,Up,Forward,RadiusCM,WidthCM,
          -30.f,MaxTravelCM,W.Contact,W.Ground.Normal,&NearBedrock);
      if(!NearBedrock){
        if(W.Ground.Surface==1||W.Ground.Surface==4)continue;
        // During a landing the old physics pass can leave a wheel at full
        // droop even though the current pose has already reached the soil.
        const FVector Hub=Wheels[I]->GetComponentLocation();
        const float VerticalExtent=RadiusCM+.53f*WidthCM*FMath::Abs(FVector::CrossProduct(Up,Forward).Z);
        if(!W.ContactValid&&Hub.Z-VerticalExtent>Terrain->Height(Hub.X,Hub.Y)+12.f)continue;
        Surface=Terrain->CastNaturalTread(Mount,Up,Forward,RadiusCM,WidthCM,-30.f,MaxTravelCM);
        if(!Surface.Hit)continue;
      }
      const FVector Normal=Surface.Hit?Surface.Normal:W.Ground.Normal;
      const FVector Contact=Surface.Hit?Surface.Point:W.Contact;
      const float Alignment=Normal|Up;
      const float TireFlex=Alignment>.35f?W.TireDeflection:0.f;
      if(Surface.Hit){
        const float Travel=Surface.Distance*.01f+(TireFlex>0?TireFlex/Alignment:0);
        const float Preload=Mass*9.81f*AxleLoadFraction(I/2)*.5f/Spring;
        Wheels[I]->SetWorldLocation(Mount-Up*FMath::Clamp(Travel,Rest-Preload-BumpTravel(I<2),Rest+Droop)*100);
      }
      const FVector Hub=Wheels[I]->GetComponentLocation();
      SetTireCarcassVisual(I,Normal,FVector::DotProduct(Hub-Contact,Normal),TireFlex,true);
    }
  }
  UpdateVisualDetails();
}

float ATerraVehicle::TireSectionWidth(int Wheel) const {
  return Wheel<2?Width:Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f))*Tuning.TireWidth;
}

void ATerraVehicle::SetTireCarcassVisual(int Wheel,const FVector& Normal,float PlaneDistanceCM,float DeflectionM,bool ConformToTerrain) {
  auto* Tire=Wheels[Wheel].Get();
  using TerraSim::TreadHeightPatch;
  float Data[36]={};
  static_assert(TreadHeightPatch::DataEnd<=UE_ARRAY_COUNT(Data));
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
  if(ConformToTerrain){
    Data[8]=TireBeadM*100;
    Data[9]=Radius*100;
    Data[14]=(Radius-TireBeadM)*52.f;
    Terrain->BuildTreadHeightPatch(Tire->GetComponentLocation(),Data);
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
