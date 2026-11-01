#include "TerraFieldValidation.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
#include "Camera/CameraActor.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInterface.h"
#include "PhysicsEngine/BodySetup.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"

namespace TerraFieldValidation {
namespace {
struct FState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;TWeakObjectPtr<ACameraActor> Camera;
  int Stage=0,Trial=0,Photo=0,JumpTrial=0,RockTrial=0;float Time=0,PeakHeight=0,ApexTime=-1,PriorVZ=0,PriorTime=0;
  FVector Start=FVector::ZeroVector,Last=FVector::ZeroVector,ExpectedPlacement=FVector::ZeroVector;double Started=0,ApexWall=-1,PreviousWall=0;
  TArray<FVector2D> FlightSamples;TArray<TSharedPtr<FJsonValue>> Flights,Rests;
  float MaximumSpeed=0,MaximumRut=0,MaximumSink=0;bool Finite=true,Air=true,SavedBuildSupplied=false,SavedBuildLoaded=false;
} S;
void Save(){
  FString Report;FParse::Value(FCommandLine::Get(),TEXT("TerraReport="),Report);
  auto Root=MakeShared<FJsonObject>();Root->SetArrayField(TEXT("flights"),S.Flights);Root->SetArrayField(TEXT("restTrials"),S.Rests);
  Root->SetBoolField(TEXT("fixedClock"),FApp::UseFixedTimeStep());
  Root->SetBoolField(TEXT("savedSnowBuildSupplied"),S.SavedBuildSupplied);Root->SetBoolField(TEXT("savedSnowBuildLoaded"),S.SavedBuildLoaded);
  FString Json;FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Json));
  FFileHelper::SaveStringToFile(Json,*(FPaths::GetPath(Report)/TEXT("field-measurements.json")));
}
void Place(ATerraVehicle* V,FVector P,float Yaw){
  V->SetActorLocationAndRotation(P,FRotator(0,Yaw,0),false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  V->ResetContactTelemetry();
}
FVector RestPoint(ATerraVehicle* V,int Zone,float& Yaw){
  const FVector Center=V->Terrain->Spawns[Zone];FVector Best=Center;float Score=FLT_MAX;
  // Choose a naturally clear, gentle cross-slope. No replacement test floor.
  for(int X=-4;X<=4;X++)for(int Y=-4;Y<=4;Y++){
    FVector P=Center+FVector(X*350,Y*350,0);const auto Ground=V->Terrain->Sample(P);
    if(Ground.Surface!=(Zone==7?6:Zone==1?1:0)||Ground.Normal.Z<.985f)continue;
    bool Clear=true;FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraRestSite),true,V);
    for(int A:{-1,1})for(int B:{-1,1}){
      const FVector Q=P+FVector(A*220,B*125,0);FHitResult Hit;
      if(V->GetWorld()->LineTraceSingleByChannel(Hit,Q+FVector(0,0,5000),Q-FVector(0,0,5000),ECC_Visibility,Query)&&
        FMath::Abs(Hit.ImpactPoint.Z-V->Terrain->Height(Q.X,Q.Y))>12)Clear=false;
    }
    const float Error=FMath::Abs(Ground.Normal.Z-(Zone==1?1.f:.998f));
    if(Clear&&Error<Score){Best=P;Score=Error;}
  }
  const auto Ground=V->Terrain->Sample(Best);const FVector Along(-Ground.Normal.Y,Ground.Normal.X,0);
  Yaw=Along.IsNearlyZero()?0:Along.Rotation().Yaw;
  Best.Z=V->Terrain->Height(Best.X,Best.Y)+V->ExpectedRideHeight()*100+10;return Best;
}
bool BoulderFocus(ATerraVehicle* V,bool Snow,FVector Near,FVector& Target,float& Radius){
  TArray<UInstancedStaticMeshComponent*> Components;V->Terrain->GetComponents(Components);
  double Distance=DBL_MAX;bool Found=false;
  for(auto* C:Components){
    if(!C->ComponentHasTag(TEXT("TerraNativeBoulder"))||!C->GetStaticMesh()||C->GetStaticMesh()->GetName().Contains(TEXT("snowrock"))!=Snow)continue;
    const auto Bounds=C->GetStaticMesh()->GetBoundingBox();
    for(int I=0;I<C->GetInstanceCount();++I){FTransform T;C->GetInstanceTransform(I,T,true);
      const FVector P=T.TransformPosition(Bounds.GetCenter());const double D=FVector::DistSquared2D(P,Near);
      if(D<Distance&&T.GetScale3D().GetMax()>.50f){Distance=D;Target=P;Radius=(Bounds.GetSize()*T.GetScale3D()).Size()*.5f;Found=true;}
    }
  }
  return Found;
}
void Photo(ATerraVehicle* V,FVector Target,FVector Offset){
  if(!S.Camera.IsValid())S.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
  S.Camera->SetActorLocation(Target+Offset);S.Camera->SetActorRotation((-Offset).Rotation());
  Cast<APlayerController>(V->GetController())->SetViewTarget(S.Camera.Get());
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  if(S.Vehicle.Get()!=V){S=FState();S.Vehicle=V;
    Check(TEXT("field verification measures real-time physics"),!FApp::UseFixedTimeStep(),FApp::GetDeltaTime());
    Check(TEXT("world uses normal Earth gravity"),FMath::Abs(V->GetWorld()->GetGravityZ()+981.f)<5,V->GetWorld()->GetGravityZ());
  }
  S.Time+=Dt;
  if(S.Stage==0){
    const int Vehicle[]={0,2,6};V->SetGarage(true);V->SelectVehicle(Vehicle[S.Trial]);V->SetGarage(false);V->TeleportZone(1);V->RouteIndex=-1;
    V->TestThrottle=V->TestSteer=0;V->TestBrake=0;V->TestDriverInput=false;
    S.Stage=1;S.Time=0;return false;
  }
  if(S.Stage==1&&S.Time>1){
    FVector P=V->Terrain->Spawns[1]+FVector(500,0,3000);Place(V,P,0);
    V->Chassis->SetPhysicsLinearVelocity(FVector(1400,0,600));S.Start=P;S.Started=FPlatformTime::Seconds();
    S.Time=0;S.PeakHeight=0;S.ApexTime=-1;S.ApexWall=-1;S.PreviousWall=0;S.PriorVZ=600;S.PriorTime=0;S.Air=S.Finite=true;S.FlightSamples.Reset();S.Stage=2;return false;
  }
  if(S.Stage==2){
    const auto Velocity=V->Chassis->GetPhysicsLinearVelocity();const auto P=V->GetActorLocation();
    S.Air&=V->ContactCount==0;S.Finite&=!P.ContainsNaN()&&!Velocity.ContainsNaN();
    S.PeakHeight=FMath::Max(S.PeakHeight,float(P.Z-S.Start.Z));
    const double Wall=FPlatformTime::Seconds()-S.Started;
    if(S.ApexTime<0&&Velocity.Z<=0){
      const float Blend=S.PriorVZ/FMath::Max(.001f,S.PriorVZ-float(Velocity.Z));
      S.ApexTime=FMath::Lerp(S.PriorTime,S.Time,Blend);S.ApexWall=FMath::Lerp(S.PreviousWall,Wall,double(Blend));
    }
    S.PreviousWall=Wall;
    S.PriorVZ=Velocity.Z;S.PriorTime=S.Time;
    if(S.Time>.15f)S.FlightSamples.Add(FVector2D(S.Time,Velocity.Z));
    if(S.Time<1.35f)return false;
    double T=0,Y=0,TT=0,TY=0;for(auto A:S.FlightSamples){T+=A.X;Y+=A.Y;TT+=A.X*A.X;TY+=A.X*A.Y;}
    const int N=S.FlightSamples.Num();const double Acceleration=(N*TY-T*Y)/FMath::Max(.00001,N*TT-T*T);
    const auto Label=FString::Printf(TEXT("flight vehicle %d"),V->VehicleIndex);
    Check(Label+TEXT(" stays fully airborne and finite"),S.Air&&S.Finite,S.FlightSamples.Num());
    Check(Label+TEXT(" measured acceleration matches Earth gravity"),Acceleration< -930&&Acceleration> -1035,Acceleration);
    Check(Label+TEXT(" apex occurs at the ballistic time"),S.ApexTime>.51f&&S.ApexTime<.73f,S.ApexTime);
    Check(Label+TEXT(" wall-clock apex timing has no slow-motion stretch"),S.ApexWall>.48&&S.ApexWall<.78,S.ApexWall);
    Check(Label+TEXT(" apex height matches a 19.7 ft/s vertical launch"),S.PeakHeight>150&&S.PeakHeight<210,S.PeakHeight/2.54f);
    Check(Label+TEXT(" retains forward momentum in flight"),Velocity.X>1250,Velocity.X/44.704f);
    auto Row=MakeShared<FJsonObject>();Row->SetNumberField(TEXT("vehicle"),V->VehicleIndex);Row->SetNumberField(TEXT("accelerationCmPerSecondSquared"),Acceleration);
    Row->SetNumberField(TEXT("apexSeconds"),S.ApexTime);Row->SetNumberField(TEXT("apexHeightIn"),S.PeakHeight/2.54f);Row->SetNumberField(TEXT("wallSeconds"),FPlatformTime::Seconds()-S.Started);Row->SetNumberField(TEXT("gameSeconds"),S.Time);
    Row->SetNumberField(TEXT("wallApexSeconds"),S.ApexWall);
    S.Flights.Add(MakeShared<FJsonValueObject>(Row));Save();Capture(*FString::Printf(TEXT("field-flight-%d.png"),V->VehicleIndex));
    if(++S.Trial<3){S.Stage=0;S.Time=0;return false;}S.Trial=0;S.Stage=3;S.Time=0;return false;
  }
  if(S.Stage==3){
    const bool SnowTrial=S.Trial>=ATerraVehicle::VehicleCount*4;
    const int Vehicle=SnowTrial?6:S.Trial/4,Zone=SnowTrial?7:(S.Trial/2)%2;V->SetGarage(true);
    if(SnowTrial){FString Build;FParse::Value(FCommandLine::Get(),TEXT("TerraPerfBuild="),Build);
      S.SavedBuildSupplied=!Build.IsEmpty();S.SavedBuildLoaded=S.SavedBuildSupplied&&V->LoadGarage(Build);}
    V->SelectVehicle(Vehicle);if(!SnowTrial||!S.SavedBuildLoaded)V->ResetUpgrades(false);
    V->SetGarage(false);V->TeleportZone(Zone);V->RouteIndex=-1;
    V->TestThrottle=V->TestSteer=0;V->TestBrake=1;S.Stage=15;S.Time=0;return false;
  }
  if(S.Stage==15&&S.Time>.8f){
    // Let physics recreation finish before relocating the new model. Moving
    // it in the recreation frame can retain the old rigid body's transform.
    const int Zone=S.Trial>=ATerraVehicle::VehicleCount*4?7:(S.Trial/2)%2;
    float Yaw;S.ExpectedPlacement=RestPoint(V,Zone,Yaw);Place(V,S.ExpectedPlacement,Yaw);
    S.Stage=4;S.Time=0;return false;
  }
  if(S.Stage==4&&S.Time>3){
    S.Start=V->GetActorLocation();S.MaximumSpeed=0;
    S.Finite=FVector::Dist2D(S.Start,S.ExpectedPlacement)<100&&!(S.Trial>=ATerraVehicle::VehicleCount*4&&S.SavedBuildSupplied&&!S.SavedBuildLoaded);
    V->TestBrake=S.Trial%2?1:0;S.Time=0;S.Stage=5;return false;
  }
  if(S.Stage==5){
    S.Finite&=!V->GetActorLocation().ContainsNaN();S.MaximumSpeed=FMath::Max(S.MaximumSpeed,float(V->Chassis->GetPhysicsLinearVelocity().Size2D()));
    if(S.Time<(V->VehicleIndex==6?15.f:3.f))return false;
    const float Drift=FVector::Dist2D(V->GetActorLocation(),S.Start);const int Zone=S.Trial>=ATerraVehicle::VehicleCount*4?7:(S.Trial/2)%2;const bool Braked=(S.Trial%2)!=0;
    const auto Label=FString::Printf(TEXT("rest vehicle %d zone %d brake %d"),V->VehicleIndex,Zone,Braked);
    Check(Label+TEXT(" remains finite on physical tire support"),S.Finite&&V->ContactCount>=2,V->ContactCount);
    Check(Label+TEXT(" holds its cross-slope position within ten inches"),Drift<25.4f,Drift/2.54f);
    auto Row=MakeShared<FJsonObject>();Row->SetNumberField(TEXT("vehicle"),V->VehicleIndex);Row->SetNumberField(TEXT("zone"),Zone);Row->SetBoolField(TEXT("braked"),Braked);
    Row->SetNumberField(TEXT("driftIn"),Drift/2.54f);Row->SetNumberField(TEXT("maximumSpeedMph"),S.MaximumSpeed/44.704f);Row->SetNumberField(TEXT("groundNormalZ"),V->Terrain->Sample(S.Start).Normal.Z);
    Row->SetNumberField(TEXT("seconds"),S.Time);Row->SetNumberField(TEXT("evSwapStage"),V->UpgradeStage(TerraSim::EVSwap));
    Row->SetNumberField(TEXT("portalStage"),V->UpgradeStage(TerraSim::Portals));Row->SetNumberField(TEXT("pressurePsi"),V->WheelPressure(0));
    Row->SetNumberField(TEXT("placementErrorIn"),FVector::Dist2D(S.Start,S.ExpectedPlacement)/2.54);
    S.Rests.Add(MakeShared<FJsonValueObject>(Row));Save();
    if(Braked&&V->VehicleIndex==6)Capture(*FString::Printf(TEXT("field-rest-exp-%d.png"),Zone));
    if(++S.Trial<ATerraVehicle::VehicleCount*4+2){S.Stage=3;S.Time=0;return false;}
    if(FParse::Param(FCommandLine::Get(),TEXT("TerraFieldPhysicsOnly")))return true;
    S.Stage=6;S.Time=0;return false;
  }
  if(S.Stage==6){
    Check(TEXT("new park and bog routes preserve the original nine challenges"),V->Terrain->Routes.Num()==13&&V->Terrain->Routes[8].Name.Contains(TEXT("Slate Rim")),V->Terrain->Routes.Num());
    const FVector Center(-10700,-5100,0);const auto Mud=V->Terrain->Sample(Center);
    Check(TEXT("deep mud has a finite two-foot soft layer"),Mud.Surface==2&&Mud.MaxSink>.55f&&Mud.MaxSink<.65f,Mud.MaxSink*39.3701f);
    Check(TEXT("deep mud is wet with lower grip and greater rolling resistance"),Mud.Water>6&&Mud.Softness>.95f&&Mud.Mu<.41f&&Mud.Rolling>.12f,Mud.Water/2.54f);
    TArray<UInstancedStaticMeshComponent*> Components;V->Terrain->GetComponents(Components);int Variants=0,Instances=0;bool Opaque=true,Solid=true;
    for(auto* C:Components)if(C->ComponentHasTag(TEXT("TerraNativeBoulder"))){++Variants;Instances+=C->GetInstanceCount();
      const auto* Body=C->GetStaticMesh()?C->GetStaticMesh()->GetBodySetup():nullptr;
      Solid&=C->GetCollisionEnabled()==ECollisionEnabled::QueryAndPhysics&&Body&&Body->CollisionTraceFlag==CTF_UseSimpleAndComplex&&Body->AggGeom.ConvexElems.Num()>0;
      for(int I=0;I<C->GetNumMaterials();++I)Opaque&=C->GetMaterial(I)&&C->GetMaterial(I)->GetBlendMode()==BLEND_Opaque;}
    Check(TEXT("all 24 boulder variants are instantiated"),Variants==24&&Instances>1000,Instances);
    Check(TEXT("all live boulder materials are opaque"),Opaque,Variants);
    Check(TEXT("all live boulders have dedicated solid physical hulls"),Solid,Variants);
    V->SetGarage(true);V->SelectVehicle(0);V->ResetUpgrades(false);V->SetUpgrade(TerraSim::Tires,3,false);V->SetUpgrade(TerraSim::Suspension,2,false);V->SetGarage(false);V->TeleportZone(3);
    V->FourDrive=true;V->LowRange=true;V->FrontLocked=V->RearLocked=true;V->RouteIndex=-1;
    V->TestThrottle=0;V->TestBrake=1;V->TestSteer=0;S.Stage=16;S.Time=0;return false;
  }
  if(S.Stage==16&&S.Time>.8f){
    FVector P(-14800,-5100,0);P.Z=V->Terrain->Height(P.X,P.Y)+V->ExpectedRideHeight()*100+8;S.ExpectedPlacement=P;Place(V,P,0);
    S.Stage=7;S.Time=0;return false;
  }
  if(S.Stage==7&&S.Time>2){S.Start=V->GetActorLocation();S.MaximumRut=S.MaximumSink=0;S.Finite=FVector::Dist2D(S.Start,S.ExpectedPlacement)<100;V->TestBrake=0;V->TestThrottle=.65f;S.Time=0;S.Stage=8;return false;}
  if(S.Stage==8){
    S.Finite&=!V->GetActorLocation().ContainsNaN();
    for(int I=0;I<V->WheelCount();++I){const auto& W=V->WheelState[I];const auto Ground=V->Terrain->Sample(W.Contact);S.MaximumRut=FMath::Max(S.MaximumRut,Ground.RutDepth);S.MaximumSink=FMath::Max(S.MaximumSink,Ground.Water/100);}
    if(S.Time<60&&V->GetActorLocation().X< -6700)return false;
    Check(TEXT("equipped 4WD traverses the entire deep-mud basin"),S.Start.X< -14600&&V->GetActorLocation().X> -6700&&V->GetActorLocation().X-S.Start.X>7900,(V->GetActorLocation().X-S.Start.X)/30.48f);
    Check(TEXT("deep mud crossing leaves actual tire excavation"),S.MaximumRut>.025f,S.MaximumRut*39.3701f);
    Check(TEXT("deep mud remains finite and has a firm substrate"),S.Finite&&S.MaximumRut<.66f,S.MaximumRut*39.3701f);
    UE_LOG(LogTemp,Display,TEXT("TERRA_MUD_CROSSING seconds=%.2f distanceFt=%.2f startX=%.2f startY=%.2f finalX=%.2f finalY=%.2f maximumRutIn=%.2f"),S.Time,(V->GetActorLocation().X-S.Start.X)/30.48f,S.Start.X,S.Start.Y,V->GetActorLocation().X,V->GetActorLocation().Y,S.MaximumRut*39.3701f);
    Capture(TEXT("field-deep-mud-driven.png"));V->TestThrottle=0;V->TestBrake=1;S.Stage=11;S.Time=0;return false;
  }
  if(S.Stage==9){
    if(S.Time<.6f)return false;
    if(S.Photo>=18){Save();S.Stage=18;S.Time=0;return false;}
    FVector Target;float Radius=200;
    if(S.Photo<12){const bool Snow=S.Photo<4;const FVector Near=Snow?FVector(27000,24500,0):S.Photo<8?FVector(27500,-26500,0):FVector(5900,-9100,0);
      const bool Found=BoulderFocus(V,Snow,Near,Target,Radius);Check(FString::Printf(TEXT("rock view %d finds an actual placed scanned boulder"),S.Photo),Found,Radius/2.54f);
      const float Angle=(S.Photo%4)*PI*.5f;Photo(V,Target,FVector(FMath::Cos(Angle),FMath::Sin(Angle),.36f)*FMath::Max(350.f,Radius*2.8f));
    }else{
      if(S.Photo==12){Target=FVector(-10700,-5100,330);Photo(V,Target,FVector(-2100,-2100,1800));}
      if(S.Photo==13){Target=FVector(-4000,20200,560);Photo(V,Target,FVector(-9000,-4500,4200));}
      if(S.Photo==14){Target=FVector(-11800,20200,600);Photo(V,Target,FVector(200,1500,650));}
      if(S.Photo==15){Target=FVector(500,20200,600);Photo(V,Target,FVector(-1000,-1600,800));}
      if(S.Photo==16){Target=FVector(-600,17000,490);Photo(V,Target,FVector(-2500,-1700,1400));}
      if(S.Photo==17){Target=FVector(14700,18500,550);Photo(V,Target,FVector(1000,-4000,2700));}
    }
    S.Stage=10;S.Time=0;return false;
  }
  if(S.Stage==10&&S.Time>.7f){Capture(*FString::Printf(TEXT("field-scenery-%02d.png"),S.Photo));++S.Photo;S.Stage=9;S.Time=0;return false;}
  if(S.Stage==11){
    V->SetGarage(true);V->SelectVehicle(S.JumpTrial<3?0:6);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(6);V->RouteIndex=-1;
    V->TestBrake=1;V->TestThrottle=0;V->TestSteer=0;S.Time=0;S.Stage=17;return false;
  }
  if(S.Stage==17&&S.Time>.8f){
    // All three airtime trials cross real gaps. A compliant heavy truck can
    // correctly keep its tires planted over the continuous old tabletop.
    const int Style=S.JumpTrial%3;FVector P=Style==0?FVector(-15400,20200,0):Style==1?FVector(-3100,20200,0):FVector(-5300,18300,0);
    P.Z=V->Terrain->Height(P.X,P.Y)+V->ExpectedRideHeight()*100+8;S.ExpectedPlacement=P;Place(V,P,0);
    V->TestBrake=1;V->TestThrottle=0;V->TestSteer=0;S.Time=0;S.Stage=12;return false;
  }
  if(S.Stage==12&&S.Time>2){
    const float Speed=S.JumpTrial%3==0&&V->VehicleIndex==0?1400.f:1800.f;S.Finite=FVector::Dist2D(V->GetActorLocation(),S.ExpectedPlacement)<100;
    V->Chassis->SetPhysicsLinearVelocity(FVector(Speed,0,0));for(auto& W:V->WheelState)W.Omega=Speed*.01f/(V->TireDiameter()*.0127f);
    V->TestBrake=0;V->TestThrottle=.3f;V->LowRange=false;
    S.Stage=13;S.Time=0;return false;
  }
  if(S.Stage==13){
    const int Style=S.JumpTrial%3;const float LaunchMin=Style==0?-13600.f:Style==1?-1500.f:-1800.f;
    if(V->ContactCount==0&&V->GetActorLocation().X>LaunchMin){
      S.Start=V->GetActorLocation();S.Started=FPlatformTime::Seconds();S.PriorVZ=V->Chassis->GetPhysicsLinearVelocity().Z;V->ResetContactTelemetry();S.Time=0;S.Stage=14;return false;
    }
    if(S.Time>10){
      const FString Label=FString::Printf(TEXT("driven jump %d vehicle %d"),Style,V->VehicleIndex);
      Check(Label+TEXT(" creates a real unsupported jump"),false,V->GetActorLocation().X);
      Check(Label+TEXT(" has a measurable ballistic trajectory"),false,0);Check(Label+TEXT(" reaches a physical landing"),false,0);Check(Label+TEXT(" real elapsed airtime agrees with physics time"),false,0);
      Capture(*FString::Printf(TEXT("field-jump-%d-v%d.png"),Style,V->VehicleIndex));
      V->TestThrottle=0;V->TestBrake=1;
      S.Stage=++S.JumpTrial<6?11:9;S.Time=0;
    }
    return false;
  }
  if(S.Stage==14){
    int ConstructedContacts=0;for(const auto& W:V->WheelState)if(W.ContactValid&&W.Constructed)++ConstructedContacts;
    // First real landing contact ends free flight, including a body contact.
    // Integrating through a bumper impact until two tires land misdiagnoses
    // the collision response as an airborne gravity error.
    const bool Landed=ConstructedContacts>=2||V->ObjectBodyHits>0;
    if(!Landed&&S.Time<3)return false;
    const float Residual=V->GetActorLocation().Z-S.Start.Z-S.PriorVZ*S.Time-0.5f*V->GetWorld()->GetGravityZ()*S.Time*S.Time;
    const int Style=S.JumpTrial%3;const FString Label=FString::Printf(TEXT("driven jump %d vehicle %d"),Style,V->VehicleIndex);
    Check(Label+TEXT(" has real airborne travel and a physical landing"),S.Finite&&Landed&&S.Time>.12f&&S.Time<1.7f,S.Time);
    Check(Label+TEXT(" follows its measured ballistic trajectory"),FMath::Abs(Residual)<25.4f,Residual/2.54f);
    const double WallAir=FPlatformTime::Seconds()-S.Started;
    Check(Label+TEXT(" real elapsed airtime agrees with physics time"),FMath::Abs(WallAir-S.Time)<.15&&WallAir<1.85,WallAir);
    Check(Label+TEXT(" preserves forward momentum on landing"),V->Chassis->GetPhysicsLinearVelocity().X>700,V->Chassis->GetPhysicsLinearVelocity().X/44.704f);
    UE_LOG(LogTemp,Display,TEXT("TERRA_DRIVEN_JUMP style=%d vehicle=%d airSeconds=%.3f wallAirSeconds=%.3f launchVZ=%.2f residualIn=%.3f landingVX=%.2f startX=%.2f startY=%.2f landingX=%.2f landingY=%.2f"),Style,V->VehicleIndex,S.Time,WallAir,S.PriorVZ,Residual/2.54f,V->Chassis->GetPhysicsLinearVelocity().X,S.Start.X,S.Start.Y,V->GetActorLocation().X,V->GetActorLocation().Y);
    Capture(*FString::Printf(TEXT("field-jump-%d-v%d.png"),Style,V->VehicleIndex));V->TestThrottle=0;V->TestBrake=1;S.Stage=++S.JumpTrial<6?11:9;S.Time=0;return false;
  }
  if(S.Stage==18){
    V->SetGarage(true);V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarage(false);V->TeleportZone(S.RockTrial?7:8);V->RouteIndex=-1;
    Cast<APlayerController>(V->GetController())->SetViewTarget(V);
    V->TestThrottle=V->TestSteer=0;V->TestBrake=1;S.Stage=19;S.Time=0;return false;
  }
  if(S.Stage==19&&S.Time>.8f){
    FVector Target=V->Terrain->Spawns[V->Zone];float Radius=200;S.Finite=BoulderFocus(V,S.RockTrial!=0,S.RockTrial?FVector(27000,24500,0):FVector(27500,-26500,0),Target,Radius);
    FVector P=Target-FVector(Radius+600,0,0);P.Z=V->Terrain->Height(P.X,P.Y)+V->ExpectedRideHeight()*100+8;
    S.ExpectedPlacement=P;Place(V,P,0);S.Stage=20;S.Time=0;return false;
  }
  if(S.Stage==20&&S.Time>2){
    S.Finite&=FVector::Dist2D(V->GetActorLocation(),S.ExpectedPlacement)<100;V->ResetContactTelemetry();
    V->Chassis->SetPhysicsLinearVelocity(FVector(800,0,0));for(auto& W:V->WheelState)W.Omega=8/(V->TireDiameter()*.0127f);
    V->TestBrake=0;V->TestThrottle=.12f;S.Stage=21;S.Time=0;return false;
  }
  if(S.Stage==21){
    S.Finite&=!V->GetActorLocation().ContainsNaN();if(S.Time<5)return false;
    const FString Label=S.RockTrial?TEXT("snow boulder impact"):TEXT("quarry boulder impact");
    Check(Label+TEXT(" produces a real solid-object collision"),V->ObjectBodyHits>0&&V->ObjectImpactMPS>.05f,V->ObjectBodyHits);
    Check(Label+TEXT(" remains finite at the intended physical site"),S.Finite,V->ObjectImpactMPS);
    Capture(*FString::Printf(TEXT("field-rock-impact-%d.png"),S.RockTrial));V->TestThrottle=0;V->TestBrake=1;
    if(++S.RockTrial>=2){Save();S.Stage=22;S.Time=0;return false;}S.Stage=18;S.Time=0;return false;
  }
  if(S.Stage==22&&S.Time>.6f)return true;
  return false;
}
}
