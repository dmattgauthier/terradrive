#include "TerraVehicle.h"
#include "Components/StaticMeshComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/BoxComponent.h"
#include "Math/RotationMatrix.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Components/RectLightComponent.h"

void ATerraVehicle::UpdateWheelVisuals(){
  const FVector Up=GetActorUpVector();
  for(int I=0;I<WheelCount();++I){
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
  // These nine groups share geometry/material and never cast individual
  // shadows. Links can articulate without adding hundreds of draw calls.
  const TCHAR* GearMeshes[]={TEXT("/Engine/BasicShapes/Cylinder.Cylinder"),TEXT("/Engine/BasicShapes/Cylinder.Cylinder"),
    TEXT("/Engine/BasicShapes/Sphere.Sphere"),TEXT("/Engine/BasicShapes/Sphere.Sphere"),
    TEXT("/Engine/BasicShapes/Cube.Cube"),TEXT("/Engine/BasicShapes/Cylinder.Cylinder"),
    TEXT("/Game/Meshes/detail_brake_rotor"),TEXT("/Game/Meshes/detail_brake_rotor_ceramic"),TEXT("/Game/Meshes/detail_brake_rotor_solid")};
  for(int I=0;I<9;++I){
    auto *C=NewObject<UInstancedStaticMeshComponent>(this);C->SetupAttachment(Chassis);
    C->SetAbsolute(false,false,false);C->SetRelativeTransform(FTransform::Identity);
    C->SetCollisionEnabled(ECollisionEnabled::NoCollision);C->SetCanEverAffectNavigation(false);
    C->SetMobility(EComponentMobility::Movable);C->SetCastShadow(false);
    C->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,GearMeshes[I]));
    if(I<6)C->SetMaterial(0,LoadObject<UMaterialInterface>(nullptr,I==1?TEXT("/Game/Materials/Native_Chrome"):
      I==3||I==5?TEXT("/Game/Materials/Native_RunningGearRubber"):TEXT("/Game/Materials/Native_SuspensionSteel")));
    C->RegisterComponent();RunningGearMeshes.Add(C);
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
  if(!Spec.IsValid()||SuspensionParts.Num()!=WheelCount()*4+AxleCount()*2)return;
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
    if(D.ContainsNaN()||D.SizeSquared()<.0001f)return;
    C->SetWorldLocationAndRotation((A+B)*.5,FRotationMatrix::MakeFromZ(D).ToQuat());
    C->SetWorldScale3D(FVector(RadiusCM/50,RadiusCM/50,D.Size()/100));
  };
  const auto Transform=GetActorTransform();
  const FVector Up=GetActorUpVector();
  const auto Suspension=Spec->GetObjectField(TEXT("suspension"));
  const float PortalCM=PortalLift()*100.f;
  const FString BodyStyle=Spec->GetStringField(TEXT("bodyStyle"));
  const bool Expedition=BodyStyle==TEXT("earthcruiser");
  const bool ModernG=BodyStyle==TEXT("g580")||BodyStyle==TEXT("g63")||BodyStyle==TEXT("g63six");
  const float AxleRestZ=(Radius-CG)*100.f;
  const auto MotorLayout=ElectricLayout();
  const bool Electric=MotorLayout!=TerraSim::MotorLayout::None;
  // The tire-size label, rather than tire diameter or upgrade lift, fixes
  // rim and rotor dimensions. Explicit roster metadata covers the EXP's
  // 17-inch wheels and the G-Class's 20-inch wheels; old cars retain their fit.
  const float LegacyRimRadius=VehicleIndex==5?27.94f:VehicleIndex==3?20.32f:VehicleIndex<2?21.59f:22.86f;
  const float RimRadius=Number(TEXT("rimDiameterInches"),LegacyRimRadius/1.27f)*1.27f;
  TArray<FTransform> GearTransforms[9];
  auto Instance=[&](int Group,const FVector &P,const FQuat &Q,const FVector &Scale){
    if(!P.ContainsNaN()&&!Q.ContainsNaN()&&!Scale.ContainsNaN()&&Scale.GetMin()>0.f)
      GearTransforms[Group].Emplace(Q,P,Scale);
  };
  auto Rod=[&](int Group,const FVector &A,const FVector &B,float R){
    const FVector D=B-A;const float L=D.Size();
    if(L>.01f)Instance(Group,(A+B)*.5f,FRotationMatrix::MakeFromZ(D).ToQuat(),FVector(R/50.f,R/50.f,L/100.f));
  };
  auto Ball=[&](int Group,const FVector &P,const FVector &Size){Instance(Group,P,GetActorQuat(),Size/100.f);};
  auto Box=[&](const FVector &P,const FQuat &Q,const FVector &Size){Instance(4,P,Q,Size/100.f);};
  auto At=[&](float X,float Y,float Z){return Transform.TransformPosition(FVector(X,Y,Z));};
  // A bellows is a succession of short ribs along the actual shaft. Its
  // endpoints track suspension travel instead of being painted onto a wheel.
  auto Boot=[&](const FVector &A,const FVector &B,float R){
    const FVector D=B-A;const float L=D.Size();if(L<.1f)return;
    for(int K=0;K<5;++K){const float T=(K+.5f)/5.f;const FVector P=FMath::Lerp(A,B,T);
      Rod(5,P-D.GetSafeNormal()*L*.07f,P+D.GetSafeNormal()*L*.07f,R*(.76f+.24f*FMath::Sin(T*PI)));}
  };
  // Bounded e-drive cans, ribs, end plates and flexible power/cooling
  // conduits use the same instanced groups. All motor cases attach to the
  // frame: the G 580's four motors are not unsprung hub motors.
  auto MotorCan=[&](const FVector &Center,float R){
    const FVector Axis=GetActorRightVector(),Forward=GetActorForwardVector();
    Rod(0,Center-Axis*12.f,Center+Axis*12.f,R);
    for(float Offset:{-8.f,-2.f,4.f,10.f})Rod(0,Center+Axis*(Offset-.45f),Center+Axis*(Offset+.45f),R+.7f);
    for(float Side:{-1.f,1.f})Rod(1,Center+Axis*(Side*12.1f),Center+Axis*(Side*12.9f),R*.96f);
    for(int K=0;K<6;++K){const float Angle=K*PI/3.f;
      const FVector P=Center+Forward*(FMath::Cos(Angle)*R*.78f)+Up*(FMath::Sin(Angle)*R*.78f);
      Rod(1,P+Axis*12.9f,P+Axis*14.f,.65f);}
    Box(Center-Up*(R+1.5f),GetActorQuat(),FVector(22,18,3));
    Box(Center+Forward*(R+1.5f)+Up*3.f,GetActorQuat(),FVector(5,9,6));
    const FVector CableA=Center+Forward*(R+4.f)+Up*4.f,CableB=CableA+Forward*14.f+Up*3.f;
    Rod(5,CableA,CableB,1.45f);Boot(CableA,CableB,1.8f);
  };
  const float DriveUnitZ=AxleRestZ+12.f;
  if(!Tracks&&MotorLayout==TerraSim::MotorLayout::Single){
    MotorCan(At(-12.f,0,DriveUnitZ+5.f),12.f);
    // The single motor drives a conventional rear differential and may feed
    // the optional transfer case/forward prop shaft when 4H is fitted.
    Box(At(12.f,0,DriveUnitZ),GetActorQuat(),FVector(30,24,23));
  }
  if(!Tracks&&Electric&&UpgradeStage(TerraSim::EVSwap)>0){
    const float PackZ=(Number(TEXT("clearance"),.22f)+.09f-CG)*100.f;
    Box(At(-Wheelbase*4.f,0,PackZ),GetActorQuat(),FVector(Wheelbase*58.f,Track*66.f,16));
  }
  FVector AxleJoints[MaxWheels];
  for(int I=0;I<WheelCount();++I){
    const bool Front=I<2;const float Side=I%2?1.f:-1.f,X=AxleOffsetM(I/2)*100;
    const float RotorRadius=VehicleIndex==5?(Front?22.f:18.5f):VehicleIndex==2?(Front?14.097f:12.954f):RimRadius*(VehicleIndex==3?.71f:.735f);
    const FString Type=Suspension->GetStringField(Front?TEXT("frontType"):TEXT("rearType"));
    const bool Solid=Type.Contains(TEXT("solid"))||Type.Contains(TEXT("live axle"))||Type.Contains(TEXT("live rear axle"));
    const bool DeDion=Type.Contains(TEXT("de-dion"),ESearchCase::IgnoreCase)||Type.Contains(TEXT("de dion"),ESearchCase::IgnoreCase);
    const bool Beam=Solid||DeDion,Wishbone=Type.Contains(TEXT("wishbone")),Leaf=Type.Contains(TEXT("leaf"));
    const FVector Hub=Wheels[I]->GetComponentLocation(),AxleHub=Hub+Up*PortalCM;
    const FQuat Steering=FQuat(Up,Overturned?0.f:WheelState[I].Angle)*GetActorQuat();
    const FVector Joint=AxleHub+Steering.RotateVector(FVector(0,-Side*Width*22.f,0));
    AxleJoints[I]=Joint;
    const float ShockTopZ=Expedition?AxleRestZ+50.f:ModernG?AxleRestZ+47.f:VehicleIndex==2?20.f:18.f;
    const FVector Top=At(X,Side*Track*(VehicleIndex==2?.36f:.34f)*100,ShockTopZ);
    const FVector Lower=Joint+Up*5.f;
    Link(I*4,Lower,FMath::Lerp(Lower,Top,.68f),3.2f);
    Link(I*4+1,FMath::Lerp(Lower,Top,.45f),Top,1.4f);
    auto *Coil=SuspensionParts[I*4+2].Get();
    const TCHAR* SpringMesh=VehicleIndex==4?TEXT("/Game/Meshes/detail_airstrut"):TEXT("/Game/Meshes/detail_coil");
    const FString SpringName=VehicleIndex==4?TEXT("detail_airstrut"):TEXT("detail_coil");
    if(!Coil->GetStaticMesh()||Coil->GetStaticMesh()->GetName()!=SpringName)Coil->SetStaticMesh(LoadObject<UStaticMesh>(nullptr,SpringMesh));
    // Live-axle coils sit beside the shock; the Sprinter retains its real
    // transverse front and longitudinal rear leaf-spring architecture.
    const FVector SpringOffset=Beam?Transform.TransformVectorNoScale(FVector(Front?-10.f:10.f,-Side*7.f,0)):FVector::ZeroVector;
    const FVector SpringTop=Top+SpringOffset,SpringLow=Lower+SpringOffset,D=SpringTop-SpringLow;
    Coil->SetVisibility(!Tracks&&!Leaf);
    Coil->SetWorldLocationAndRotation((SpringTop+SpringLow)*.5f,FRotationMatrix::MakeFromZ(D).ToQuat());
    const float CoilWidth=VehicleIndex==2?.78f:VehicleIndex==4?1.10f:1.f;
    Coil->SetWorldScale3D(FVector(CoilWidth,CoilWidth,FMath::Max(.12f,D.Size()/100.f)));
    // The fourth legacy link is a lower arm or a live-axle trailing arm.
    const FVector ArmA=At(X+(Beam?(Front?-43.f:43.f):-17.f),Side*Track*24.f,ModernG?AxleRestZ+(Beam?10.f:-4.f):-15.f);
    const FVector ArmB=Joint-Up*7.f;
    Link(I*4+3,ArmA,ArmB,VehicleIndex==4?2.4f:1.9f);
    for(int K=0;K<2;++K)SuspensionParts[I*4+K]->SetVisibility(!Tracks);
    SuspensionParts[I*4+3]->SetVisibility(!Tracks&&!(Expedition&&Leaf));
    if(HubDetails.Num()!=WheelCount()*4)continue;
    for(int Branch=0;Branch<2;++Branch){
      auto *Part=HubDetails[I*4+Branch].Get();Part->SetVisibility(!Tracks&&Wishbone);
      const FVector A=At(X+(Branch?17.f:-17.f),Side*Track*27.f,ModernG?AxleRestZ+15.f:3.f);
      const FVector Upper=Joint+Up*11.f,UD=Upper-A;Part->SetWorldLocationAndRotation((A+Upper)*.5f,FRotationMatrix::MakeFromZ(UD).ToQuat());
      Part->SetWorldScale3D(FVector(.038,.038,UD.Size()/100.f));
    }
    auto *Caliper=HubDetails[I*4+2].Get();Caliper->SetVisibility(!Tracks);
    const float BrakeY=Side*Width*17.f;
    const FVector BrakeCenter=Hub+Steering.RotateVector(FVector(0,BrakeY,0));
    Caliper->SetWorldLocationAndRotation(Hub+Steering.RotateVector(FVector(-RotorRadius*.87f,BrakeY,0)),Steering);
    // Caliper is a stationary knuckle attachment; the friction ring alone
    // spins with the hub. No caliper or rotor is baked into the factory rim.
    const float CaliperScale=VehicleIndex==5?(Front?1.30f:.96f):VehicleIndex==2?.78f:1.f;
    Caliper->SetWorldScale3D(FVector(CaliperScale));
    if(!Tracks)Instance(VehicleIndex==5?7:VehicleIndex==2&&!Front?8:6,BrakeCenter,Wheels[I]->GetComponentQuat(),FVector(RotorRadius/100.f));
    auto *Knuckle=HubDetails[I*4+3].Get();Knuckle->SetVisibility(!Tracks&&!Beam);
    Knuckle->SetWorldLocationAndRotation(Joint,Steering);Knuckle->SetWorldScale3D(FVector(.11,.10,.22));
    if(Tracks)continue;
    // Lower wishbone fork, separate rear links and ball-joint ends.
    if(!Beam){
      const FVector LowerBall=Joint-Up*7.f;
      Rod(0,At(X+19.f,Side*Track*25.f,ModernG?AxleRestZ-1.f:-15.f),LowerBall,VehicleIndex==4?2.4f:1.8f);
      Ball(2,LowerBall,FVector(7));
      if(Wishbone)Ball(2,Joint+Up*11.f,FVector(6));
      if(!Front){
        Rod(0,At(X-27.f,Side*Track*31.f,-3.f),Joint+Steering.RotateVector(FVector(9,0,6)),1.65f);
        Rod(0,At(X+32.f,Side*Track*30.f,-11.f),Joint+Steering.RotateVector(FVector(-9,0,-1)),1.7f);
      }
    }else if(!(Expedition&&Leaf)){
      Rod(0,At(X+(Front?-38.f:38.f),Side*Track*24.f,ModernG?AxleRestZ+10.f:0.f),Joint+Up*8.f,1.9f);
      for(const FVector &P:{ArmA,ArmB})Ball(3,P,FVector(6,7,6));
    }
    // MacPherson struts have no upper wishbone. A real steering arm and
    // rack tie rod follows the upright angle and vertical wheel travel.
    if(Front||FMath::Abs(WheelState[I].Angle)>.001f){
      const FVector Rack=At(X-20.f,Side*Track*22.f,ModernG?AxleRestZ+9.f:-7.f);
      const FVector SteeringArm=Joint+Steering.RotateVector(FVector(-12,-Side*1.5f,3));
      if(!Expedition){Rod(1,Rack,SteeringArm,1.10f);Ball(2,SteeringArm,FVector(4.2f));
        const FVector BootEnd=FMath::Lerp(Rack,SteeringArm,.34f);Boot(Rack,BootEnd,2.2f);}
      Rod(0,Joint-Up*7.f,Joint+Up*10.f,2.3f);
    }
    // Configured driven axles retain their hardware when a transfer case is
    // shifted into 2H. A factory FWD Civic has no decorative rear halfshafts.
    // CV boots follow the shaft direction through the actual wheel travel.
    if((!Solid||IndependentWheel(I))&&(DrivenWheel(I)||HasFourDrive())){
      const float RestZ=(Radius-CG)*100.f;
      const FVector Inner=At(X,Side*(IndependentWheel(I)?36.f:18.f),RestZ+3.f),Outer=Joint;
      Rod(0,Inner,Outer,VehicleIndex==4?2.4f:1.65f);
      const FVector A=FMath::Lerp(Inner,Outer,.18f),B=FMath::Lerp(Inner,Outer,.79f);
      Boot(Inner,A,4.1f);Boot(B,Outer,4.5f);Ball(2,Inner,FVector(7));
    }
    if(PortalCM>.1f){
      const FVector Case=Hub+Up*(PortalCM*.5f)+Steering.RotateVector(FVector(0,-Side*Width*28.f,0));
      Box(Case,Steering,FVector(14,10,PortalCM+11));
      for(float Z:{0.f,PortalCM}){
        const FVector C=Hub+Up*Z+Steering.RotateVector(FVector(0,-Side*Width*28.f,0));
        const FVector Axis=Steering.RotateVector(FVector(0,Side*7.f,0));
        Rod(0,C-Axis*.65f,C+Axis*.65f,6.8f);
        Rod(1,C+Axis*.74f,C+Axis*.85f,5.2f);
      }
      // Six fasteners on the outboard cover make the drop housing readable.
      for(int K=0;K<6;++K){const float A=K*PI/3.f;
        const FVector C=Case+Steering.RotateVector(FVector(FMath::Cos(A)*5.4f,Side*5.8f,FMath::Sin(A)*(PortalCM*.5f+3.f)));
        const FVector Axis=Steering.RotateVector(FVector(0,1.3f,0));Rod(1,C-Axis*.5f,C+Axis*.5f,.75f);}
    }
  }
  for(int Axle=0;Axle<AxleCount();++Axle){
    const FString Type=Suspension->GetStringField(Axle?TEXT("rearType"):TEXT("frontType"));
    const bool Solid=Type.Contains(TEXT("solid"))||Type.Contains(TEXT("live axle"))||Type.Contains(TEXT("live rear axle"));
    const bool DeDion=Type.Contains(TEXT("de-dion"),ESearchCase::IgnoreCase)||Type.Contains(TEXT("de dion"),ESearchCase::IgnoreCase);
    const bool Leaf=Type.Contains(TEXT("leaf"));
    const bool IndependentPair=IndependentWheel(Axle*2)&&IndependentWheel(Axle*2+1);
    SuspensionParts[WheelCount()*4+Axle*2]->SetVisibility(!Tracks&&Solid);
    SuspensionParts[WheelCount()*4+1+Axle*2]->SetVisibility(!Tracks&&Solid&&!IndependentPair);
    const FVector A=AxleJoints[Axle*2],B=AxleJoints[Axle*2+1];
    Link(WheelCount()*4+Axle*2,A,B,5.5f);
    const FVector Center=(A+B)*.5f;
    const FVector AxleDir=(B-A).GetSafeNormal(),Forward=FVector::CrossProduct(AxleDir,Up).GetSafeNormal();
    const FQuat AxleRotation=FRotationMatrix::MakeFromXY(Forward,AxleDir).ToQuat();
    SuspensionParts[WheelCount()*4+1+Axle*2]->SetWorldLocationAndRotation(Center,AxleRotation);
    SuspensionParts[WheelCount()*4+1+Axle*2]->SetWorldScale3D(FVector(.27,.34,.31));
    if(Tracks)continue;
    const float X=AxleOffsetM(Axle)*100.f;
    const FVector DiffCenter=Solid?Center:At(X,0,(Radius-CG)*100.f+3.f);
    if((DrivenWheel(Axle*2)||HasFourDrive())&&!IndependentPair){
      if(!Solid)Ball(2,DiffCenter,FVector(VehicleIndex==4?37.f:28.f,30.f,23.f));
      const FVector Nose=DiffCenter+GetActorForwardVector()*(Axle?20.f:-20.f);
      Rod(0,DiffCenter,Nose,7.f);
      // Transaxle on Civic stays transverse until a rear-drive conversion.
      if((!Electric||MotorLayout==TerraSim::MotorLayout::Single)&&(VehicleIndex!=2||Axle==1))Rod(0,Nose,At(Axle?-20.f:20.f,0,-12.f),3.3f);
      if(Solid){
        const FVector Cover=Center-Forward*12.f;
        for(int K=0;K<10;++K){const float Angle=K*PI/5.f;
          const FVector P=Cover+AxleDir*FMath::Cos(Angle)*12.f+Up*FMath::Sin(Angle)*11.f;
          Rod(1,P-Forward*.6f,P+Forward*.6f,.8f);}
        // Panhard rod across the live axle, and differential cover flange.
        if(!Leaf)Rod(0,At(X-11.f,-Track*32.f,ModernG?AxleRestZ+7.f:4.f),B+Up*7.f,1.65f);
        Rod(0,Center-Forward*12.f,Center-Forward*14.f,12.5f);
      }
    }
    if((MotorLayout==TerraSim::MotorLayout::Dual&&Axle<2)||(MotorLayout==TerraSim::MotorLayout::Triple&&Axle==0))MotorCan(At(X+12.f,0,DriveUnitZ),12.f);
    if(IndependentPair)for(float Side:{-1.f,1.f}){
      MotorCan(At(X,Side*24.f,DriveUnitZ),9.5f);
      Box(At(X,Side*36.f,(Radius-CG)*100.f+3.f),GetActorQuat(),FVector(18,12,19));
    }
    if(DeDion){
      // A shallow dogleg beam ties the hubs while clearing the frame-mounted
      // paired motors. There is no mechanical differential in this tube.
      const FVector RearA=A-GetActorForwardVector()*12.f,RearB=B-GetActorForwardVector()*12.f;
      Rod(0,A,RearA,4.2f);Rod(0,RearA,RearB,4.2f);Rod(0,RearB,B,4.2f);
      Rod(0,At(X+52.f,-Track*31.f,AxleRestZ+17.f),A+Up*5.f,2.2f);
      Rod(0,At(X+52.f,Track*31.f,AxleRestZ+17.f),B+Up*5.f,2.2f);
      Rod(0,At(X-9.f,-Track*32.f,AxleRestZ+7.f),B+Up*6.f,1.65f);
    }
    if(Axle==0){
      if(Expedition){
        const FVector SteeringBox=At(X-28.f,-Track*30.f,AxleRestZ+25.f);
        const FVector Pitman=SteeringBox+GetActorForwardVector()*7.f-Up*10.f;
        const FVector DragEnd=B-GetActorForwardVector()*12.f+Up*3.f;
        Box(SteeringBox,GetActorQuat(),FVector(16,13,20));Rod(0,SteeringBox,Pitman,2.2f);
        Rod(1,Pitman,DragEnd,1.7f);Ball(2,DragEnd,FVector(5));
      }else{
        const float RackZ=ModernG?AxleRestZ+9.f:-7.f;
        Rod(0,At(X-20.f,-Track*22.f,RackZ),At(X-20.f,Track*22.f,RackZ),2.8f);
      }
      if(Solid)Rod(0,A+GetActorForwardVector()*-12.f+Up*3.f,B+GetActorForwardVector()*-12.f+Up*3.f,1.7f);
    }
    if(VehicleIndex==3){
      if(Axle==0){
        // Bowed transverse composite spring: ends follow the lower arms.
        for(int K=0;K<8;++K){const float T0=K/8.f,T1=(K+1)/8.f;
          const FVector P0=FMath::Lerp(A,B,T0)+Up*(2.f+13.f*FMath::Sin(T0*PI));
          const FVector P1=FMath::Lerp(A,B,T1)+Up*(2.f+13.f*FMath::Sin(T1*PI));
          const FVector D=P1-P0;Instance(4,(P0+P1)*.5f,FRotationMatrix::MakeFromY(D).ToQuat(),FVector(.08f,D.Size()/100.f,.016f));}
      }else for(int SideIndex=0;SideIndex<2;++SideIndex){
        const float Side=SideIndex?1.f:-1.f;const FVector Hub=AxleJoints[2+SideIndex];
        const FVector Middle=Hub+Transform.TransformVectorNoScale(FVector(0,-Side*7.f,6.f));
        const FVector EndA=At(X-61.f,Side*Track*38.f,-1.f),EndB=At(X+61.f,Side*Track*38.f,-1.f);
        for(int Layer=0;Layer<3;++Layer)for(int K=0;K<8;++K){
          auto LeafPoint=[&](float T){const FVector Chord=FMath::Lerp(EndA,EndB,T);
            return Chord+(Middle-(EndA+EndB)*.5f)*FMath::Sin(T*PI)-Up*(Layer*1.05f);};
          const float Trim=Layer*.10f,T0=FMath::Lerp(Trim,1-Trim,K/8.f),T1=FMath::Lerp(Trim,1-Trim,(K+1)/8.f);
          const FVector P0=LeafPoint(T0),P1=LeafPoint(T1),D=P1-P0;
          Instance(4,(P0+P1)*.5f,FRotationMatrix::MakeFromX(D).ToQuat(),FVector(D.Size()/100.f,.075f,.009f));}
        for(const FVector &P:{EndA,EndB}){Ball(3,P,FVector(6.5f));
          Rod(0,P-Up*3.f,P+Up*3.f,2.4f);}
        for(float DX:{-6.f,6.f}){
          const FVector P=Middle+GetActorForwardVector()*DX;
          Rod(1,P-Up*8.f,P+Up*6.f,.8f);Box(P-Up*8.f,GetActorQuat(),FVector(3,12,2));}
      }
    }
    if(Expedition&&Leaf)for(int SideIndex=0;SideIndex<2;++SideIndex){
      const float Side=SideIndex?1.f:-1.f,Span=Axle?68.f:58.f;
      const FVector Hub=AxleJoints[Axle*2+SideIndex];
      const FVector SpringLine=At(X,Side*Track*31.f,0);
      const FVector Middle=SpringLine+Up*(FVector::DotProduct(Hub-SpringLine,Up)+6.f);
      const float HangerZ=(Radius-CG)*100.f+16.f;
      const FVector EndA=At(X-Span,Side*Track*31.f,HangerZ),EndB=At(X+Span,Side*Track*31.f,HangerZ);
      for(int Layer=0;Layer<3;++Layer)for(int K=0;K<8;++K){
        auto LeafPoint=[&](float T){return FMath::Lerp(EndA,EndB,T)+(Middle-(EndA+EndB)*.5f)*FMath::Sin(T*PI)-Up*(Layer*.90f);};
        const float Trim=Layer*.10f,T0=FMath::Lerp(Trim,1-Trim,K/8.f),T1=FMath::Lerp(Trim,1-Trim,(K+1)/8.f);
        const FVector P0=LeafPoint(T0),P1=LeafPoint(T1),D=P1-P0;
        Instance(4,(P0+P1)*.5f,FRotationMatrix::MakeFromX(D).ToQuat(),FVector(D.Size()/100.f,.085f,.008f));
      }
      for(const FVector& P:{EndA,EndB}){Ball(3,P,FVector(7));Rod(0,P-Up*3.f,P+Up*6.f,2.5f);}
      for(float DX:{-6.f,6.f}){
        const FVector P=Middle+GetActorForwardVector()*DX;
        Rod(1,P-Up*7.f,P+Up*6.f,.9f);Box(P-Up*7.f,GetActorQuat(),FVector(3,13,2));
      }
    }
  }
  // Existing instances are updated in place; capacity changes only when a
  // vehicle/upgrade changes topology. World inputs convert into chassis-local
  // instances, so the final physics movement carries them with the attached
  // wheels in the same frame instead of leaving absolute instances one step behind.
  for(int G=0;G<RunningGearMeshes.Num()&&G<9;++G){
    auto *C=RunningGearMeshes[G].Get();const int Wanted=GearTransforms[G].Num();
    while(C->GetInstanceCount()>Wanted)C->RemoveInstance(C->GetInstanceCount()-1);
    while(C->GetInstanceCount()<Wanted)C->AddInstance(FTransform::Identity,true);
    if(Wanted)C->BatchUpdateInstancesTransforms(0,GearTransforms[G],true,true,true);
    C->SetVisibility(!Tracks&&Wanted>0);
  }
}
