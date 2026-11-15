#include "TerraGraniteFitValidation.h"
#include "TerraTireProbeValidation.h"
#include "TerraVehicle.h"

#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/PlayerController.h"
#include "Math/RotationMatrix.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StaticMeshResources.h"

namespace TerraGraniteFitValidation {
namespace {

constexpr int32 RouteIndex=17;
constexpr float BenchCM=215.f,LedgeStartCM=645.f,LedgeEndCM=1330.f;
constexpr float BodyToleranceCM=1.f,DeepTireSinkCM=9.f,TreadToleranceCM=1.25f;

enum class EPhase { Fit, TurnSettle, RollIn, Left, Right, LedgeSettle, Ledge, CombinedSettle, CombinedRoll, CombinedTurn };

struct FFit {
  int32 Vehicle=0,Stage=0;
};

struct FObservation {
  int32 Size=0,Suspension=0,Gates=0,LeftFrames=0,RightFrames=0,DrivenRockFrames=0,Samples=0,BumpFrames=0;
  float Progress=0,MinUp=1,MaxPitch=0,MaxRoll=0,PeakLeftAngle=0,PeakRightAngle=0,MinimumBodyGap=100,
    MinimumTireGap=100,WorstBumpCM=0,BodyOverlapTime=0,TireSinkTime=0,GroundedTime=0,
    MaxBodyOverlapTime=0,MaxTireSinkTime=0,MaxGroundedTime=0,MinHeight=UE_BIG_NUMBER,MaxHeight=-UE_BIG_NUMBER;
  bool Installed=false,Finite=true,Upright=true,TurnSettled=false,LedgeSettled=false;
};

struct FRun {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TArray<FFit> Schedule;
  TWeakObjectPtr<UStaticMesh> SampledBody;
  TWeakObjectPtr<ACameraActor> LedgeCamera;
  TArray<FVector> BodyPoints;
  TSharedPtr<FJsonObject> BodyWitnesses;
  FString SampledBodyHash;
  FVector Forward=FVector::ForwardVector,Side=FVector::RightVector;
  int32 Index=0,LastVehicle=INDEX_NONE,LastTerrainHits=0;
  float Time=0,SampleTime=0,Spring=0,Rest=0,LastTerrainHitTime=-100,LaneTarget=BenchCM;
  EPhase Phase=EPhase::Fit;
  FObservation Data;
  int32 CombinedSign=0,CombinedFullFrames=0;
  float CombinedPeakTwist=0,CombinedPeakFlex=0,CombinedTireGap=UE_BIG_NUMBER;
  bool Captured=false,UsesCookedMesh=false,Combined=false,CombinedImage=false,Detailed=false;

  void Advance(EPhase Next){Phase=Next;Time=0;SampleTime=0;}
} Run;

void Brake(ATerraVehicle* V) {
  V->TestDriverInput=false;
  V->TestThrottle=0;
  V->TestBrake=1;
  V->TestSteer=0;
}

void SpeedDemand(ATerraVehicle* V,float Target,float Limit) {
  V->TestThrottle=FMath::Clamp(.13f+(Target-V->Speed)*.70f,0.f,Limit);
  V->TestBrake=FMath::Clamp((V->Speed-Target-.20f)*.75f,0.f,1.f);
}

float Along(const ATerraVehicle* V,const FTerraRoute& Route) {
  return FVector::DotProduct(V->GetActorLocation()-Route.Spawn,Run.Forward);
}

float Lateral(const ATerraVehicle* V,const FTerraRoute& Route) {
  return FVector::DotProduct(V->GetActorLocation()-Route.Spawn,Run.Side);
}

void StartAt(ATerraVehicle* V,const FTerraRoute& R,float Station,float LateralCM) {
  V->TeleportRoute(RouteIndex);
  const FVector Point=R.Spawn+Run.Forward*Station+Run.Side*LateralCM;
  const auto Ground=V->Terrain->Sample(Point);
  const FVector Up=Ground.Normal.Z>.72f?Ground.Normal:FVector::UpVector;
  const FQuat Rotation=FRotationMatrix::MakeFromXZ(Run.Forward,Up).ToQuat();
  V->SetActorLocationAndRotation(FVector(Point.X,Point.Y,Ground.Height+V->ExpectedRideHeight()*100+13),
      Rotation,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  V->LowRange=V->HasLowRange();
  V->FourDrive=V->HasFourDrive();
  V->FrontLocked=V->RearLocked=V->CenterLocked=false;
  V->ResetContactTelemetry();
  Run.LastTerrainHits=0;
  Run.LastTerrainHitTime=-100;
  Run.Data.BodyOverlapTime=Run.Data.TireSinkTime=Run.Data.GroundedTime=0;
  Brake(V);
}

bool ReadCookedBody(const ATerraVehicle* V,const UStaticMesh* Mesh) {
  const auto* Render=FApp::CanEverRender()&&Mesh->bAllowCPUAccess?Mesh->GetRenderData():nullptr;
  if(!Render||!Render->LODResources.IsValidIndex(0))return false;
  const auto& LOD=Render->LODResources[0];
  const auto& Positions=LOD.VertexBuffers.PositionVertexBuffer;
  const auto Indices=LOD.IndexBuffer.GetArrayView();
  if(Positions.GetNumVertices()==0||Indices.Num()<3)return false;
  const FTransform BodyToActor=V->Body->GetComponentTransform().GetRelativeTransform(V->GetActorTransform());
  const auto Point=[&](int Index){return BodyToActor.TransformPosition(FVector(Positions.VertexPosition(Indices[Index])));};
  constexpr double SpacingCM=4;
  TSet<FIntVector> Visited;
  const auto Add=[&](const FVector& P){
    if(P.Z>110||P.ContainsNaN())return;
    const FIntVector Cell(FMath::RoundToInt(P.X/SpacingCM),FMath::RoundToInt(P.Y/SpacingCM),FMath::RoundToInt(P.Z/SpacingCM));
    bool AlreadyPresent=false;
    Visited.Add(Cell,&AlreadyPresent);
    if(!AlreadyPresent)Run.BodyPoints.Add(P);
  };
  for(int32 I=0;I+2<Indices.Num();I+=3){
    const FVector A=Point(I),B=Point(I+1),C=Point(I+2);
    if(FMath::Min3(A.Z,B.Z,C.Z)>110)continue;
    const double Edge=FMath::Sqrt(FMath::Max3((B-A).SizeSquared(),(C-A).SizeSquared(),(C-B).SizeSquared()));
    const int32 N=FMath::Clamp(FMath::CeilToInt(Edge/SpacingCM),1,80);
    for(int32 U=0;U<=N;++U)for(int32 W=0;W<=N-U;++W)Add(A+(B-A)*(double(U)/N)+(C-A)*(double(W)/N));
  }
  return Run.BodyPoints.Num()>=100;
}

bool ReadBakedBody(const ATerraVehicle* V,const UStaticMesh* Mesh){
  if(!Run.BodyWitnesses){
    FString File,Json;
    TSharedPtr<FJsonObject> Root;
    const TSharedPtr<FJsonObject>* Profiles=nullptr;
    if(!FParse::Value(FCommandLine::Get(),TEXT("TerraGraniteBodyWitnesses="),File)||
        !FFileHelper::LoadFileToString(Json,*File)||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||
        Root->GetIntegerField(TEXT("version"))!=1||!Root->TryGetObjectField(TEXT("profiles"),Profiles))return false;
    Run.BodyWitnesses=*Profiles;
  }
  const TSharedPtr<FJsonObject>* Entry=nullptr;
  if(!Run.BodyWitnesses->TryGetObjectField(Mesh->GetName(),Entry)||!Entry||!Entry->IsValid())return false;
  const auto& Profile=**Entry;
  const TArray<TSharedPtr<FJsonValue>>* Points=nullptr;
  FString Hash;
  if(!Profile.TryGetStringField(TEXT("sha256"),Hash)||Hash.Len()!=64||Hash!=V->CoachworkCollisionSource||
      !Profile.TryGetArrayField(TEXT("points"),Points)||Points->Num()<100||Points->Num()>100000)return false;
  const FTransform BodyToActor=V->Body->GetComponentTransform().GetRelativeTransform(V->GetActorTransform());
  Run.BodyPoints.Reserve(Points->Num());
  for(const auto& Value:*Points){
    const auto& A=Value->AsArray();
    if(A.Num()!=3)return false;
    const FVector Point(A[0]->AsNumber(),A[1]->AsNumber(),A[2]->AsNumber());
    if(Point.ContainsNaN())return false;
    Run.BodyPoints.Add(BodyToActor.TransformPosition(Point));
  }
  return true;
}

bool BuildBodySamples(const ATerraVehicle* V){
  UStaticMesh* Mesh=V->Body->GetStaticMesh().Get();
  if(!Mesh)return false;
  if(Run.SampledBody.Get()==Mesh&&Run.SampledBodyHash==V->CoachworkCollisionSource&&!Run.BodyPoints.IsEmpty())return true;
  Run.BodyPoints.Reset();
  Run.SampledBody=nullptr;
  Run.UsesCookedMesh=ReadCookedBody(V,Mesh);
  if(!Run.UsesCookedMesh){
    Run.BodyPoints.Reset();
    if(!ReadBakedBody(V,Mesh))return false;
  }
  Run.SampledBody=Mesh;
  Run.SampledBodyHash=V->CoachworkCollisionSource;
  UE_LOG(LogTemp,Display,TEXT("TERRA_GRANITE_BODY_WITNESS asset=%s kind=%s points=%d"),
    *Mesh->GetName(),Run.UsesCookedMesh?TEXT("cooked-lod0"):TEXT("hashed-authoring-samples"),Run.BodyPoints.Num());
  return true;
}

float MinimumBodyGap(const ATerraVehicle* V) {
  const auto Envelope=TerraTireProbeValidation::MeshEnvelope(V);
  if(Envelope.RadiusCM<=0||Envelope.HalfWidthCM<=0||Run.BodyPoints.IsEmpty())return -UE_BIG_NUMBER;
  float Minimum=100;
  for(const auto& Wheel:V->Wheels){
    const FTransform Pose=Wheel->GetComponentTransform().GetRelativeTransform(V->GetActorTransform());
    const FVector Center=Pose.GetLocation();
    const FVector Scale=Pose.GetScale3D().GetAbs();
    const FVector Axle=Pose.GetRotation().GetAxisY();
    const double Radius=Envelope.RadiusCM*FMath::Max(Scale.X,Scale.Z),HalfWidth=Envelope.HalfWidthCM*Scale.Y;
    const double Reach=Radius+HalfWidth+12;
    for(const FVector& P:Run.BodyPoints){
      const FVector Delta=P-Center;
      if(FMath::Abs(Delta.X)>Reach||FMath::Abs(Delta.Y)>Reach||FMath::Abs(Delta.Z)>Reach)continue;
      const double Axial=FVector::DotProduct(Delta,Axle);
      const double RadialSquared=FMath::Max(0.,Delta.SizeSquared()-Axial*Axial);
      const double Gap=FMath::Max(FMath::Sqrt(RadialSquared)-Radius,FMath::Abs(Axial)-HalfWidth);
      Minimum=FMath::Min(Minimum,float(Gap));
    }
  }
  return Minimum;
}

void Observe(ATerraVehicle* V,float Dt,bool Ledge) {
  auto& Data=Run.Data;
  Data.MinUp=FMath::Min(Data.MinUp,float(V->GetActorUpVector().Z));
  Data.Upright&=!V->Overturned&&Data.MinUp>.65f;
  auto Rotation=V->GetActorRotation();
  Data.MaxPitch=FMath::Max(Data.MaxPitch,float(FMath::Abs(Rotation.Pitch)));
  Data.MaxRoll=FMath::Max(Data.MaxRoll,float(FMath::Abs(Rotation.Roll)));
  Data.Finite&=!Rotation.ContainsNaN()&&!V->GetActorLocation().ContainsNaN()&&FMath::IsFinite(V->Speed);
  int32 RockContacts=0;
  bool AtBump=false;
  float MaxAngle=0;
  for(int32 I=0;I<V->WheelCount();++I){
    const auto& W=V->WheelState[I];
    Data.Finite&=FMath::IsFinite(W.Load)&&FMath::IsFinite(W.Distance)&&FMath::IsFinite(W.Omega)&&!W.Center.ContainsNaN();
    if(I<2)MaxAngle=FMath::Max(MaxAngle,float(FMath::Abs(FMath::RadiansToDegrees(W.Angle))));
    if(!W.ContactValid||W.Load<50)continue;
    if(W.Ground.Surface==4)++RockContacts;
    const float Preload=V->Mass*9.81f*V->AxleLoadFraction(I/2)*.5f/Run.Spring;
    const float BumpErrorCM=(Run.Rest-W.Distance-Preload-V->BumpTravel(I<2))*100;
    AtBump|=BumpErrorCM>=-2;
    Data.WorstBumpCM=FMath::Max(Data.WorstBumpCM,BumpErrorCM);
  }
  if(AtBump)++Data.BumpFrames;
  if(Ledge){
    if(RockContacts>=2&&V->Speed>.20f)++Data.DrivenRockFrames;
    const float H=V->Terrain->Height(V->GetActorLocation().X,V->GetActorLocation().Y);
    Data.MinHeight=FMath::Min(Data.MinHeight,H);
    Data.MaxHeight=FMath::Max(Data.MaxHeight,H);
  }else if(V->ContactCount>=2&&V->Speed>.20f&&FMath::Abs(V->Steer)>=.97f){
    if(Run.Phase==EPhase::Left){++Data.LeftFrames;Data.PeakLeftAngle=FMath::Max(Data.PeakLeftAngle,MaxAngle);}
    if(Run.Phase==EPhase::Right){++Data.RightFrames;Data.PeakRightAngle=FMath::Max(Data.PeakRightAngle,MaxAngle);}
  }
  if(Run.LastTerrainHits!=V->TerrainBodyHits){
    Run.LastTerrainHits=V->TerrainBodyHits;
    Run.LastTerrainHitTime=Run.Time;
  }
  const bool BodyStall=Ledge&&Run.Time-Run.LastTerrainHitTime<.25f&&V->TestThrottle>.26f&&FMath::Abs(V->Speed)<.18f;
  Data.GroundedTime=BodyStall?Data.GroundedTime+Dt:0;
  Data.MaxGroundedTime=FMath::Max(Data.MaxGroundedTime,Data.GroundedTime);
  Run.SampleTime+=Dt;
  const bool BodyDue=Run.SampleTime>=.12f;
  if(!Data.Installed||(!BodyDue&&!Run.Detailed))return;
  const auto Witness=TerraTireProbeValidation::ClosestGroundWitness(V);
  const float Tire=Witness.GapCM;
  Data.Finite&=FMath::IsFinite(Tire);
  if(Run.Detailed&&Tire<Data.MinimumTireGap&&V->Wheels.IsValidIndex(Witness.Wheel)){
    const auto& W=V->WheelState[Witness.Wheel];
    const auto Transform=V->Wheels[Witness.Wheel]->GetComponentTransform();
    const auto P=V->GetActorLocation();
    const auto Unflexed=Transform.TransformPosition(Witness.MeshLocal);
    const FVector Up=V->GetActorUpVector();
    UE_LOG(LogTemp,Display,TEXT("TERRA_GRANITE_TREAD vehicle=%d phase=%d turn=%d t=%.3f root=%s speed=%.3f tire=%d gapCM=%.3f rigidGapCM=%.3f loadN=%.0f deflectionCM=%.3f ground=%d valid=%d constructed=%d vertex=%s local=%s hub=%s hubDelta=%s support=%s supportErrorCM=%.3f normal=%s up=%s steering=%.2f"),
      V->VehicleIndex,int(Run.Phase),Run.CombinedSign,Run.Time,*P.ToString(),V->Speed,Witness.Wheel,Tire,
      Unflexed.Z-V->Terrain->Height(Unflexed.X,Unflexed.Y),W.Load,W.TireDeflection*100,W.Ground.Surface,W.ContactValid,W.Constructed,
      *Witness.World.ToString(),*Witness.MeshLocal.ToString(),*Transform.GetLocation().ToString(),*(Transform.GetLocation()-W.Center).ToString(),
      *W.Contact.ToString(),W.Contact.Z-V->Terrain->Height(W.Contact.X,W.Contact.Y),*W.Ground.Normal.ToString(),*Up.ToString(),
      FMath::RadiansToDegrees(W.Angle));
  }
  Data.MinimumTireGap=FMath::Min(Data.MinimumTireGap,Tire);
  if(Run.Combined)Run.CombinedTireGap=FMath::Min(Run.CombinedTireGap,Tire);
  Data.TireSinkTime=Tire<-DeepTireSinkCM?Data.TireSinkTime+(Run.Detailed?Dt:Run.SampleTime):0;
  Data.MaxTireSinkTime=FMath::Max(Data.MaxTireSinkTime,Data.TireSinkTime);
  if(!BodyDue)return;
  const float Gap=MinimumBodyGap(V);
  Data.Finite&=FMath::IsFinite(Gap);
  Data.MinimumBodyGap=FMath::Min(Data.MinimumBodyGap,Gap);
  Data.BodyOverlapTime=Gap<-BodyToleranceCM?Data.BodyOverlapTime+Run.SampleTime:0;
  Data.MaxBodyOverlapTime=FMath::Max(Data.MaxBodyOverlapTime,Data.BodyOverlapTime);
  ++Data.Samples;
  Run.SampleTime=0;
}

bool BuildSchedule(ATerraVehicle* V,TFunctionRef<void(const FString&,bool,float)> Check){
  const auto& Roster=V->Terrain->Data->GetArrayField(TEXT("vehicles"));
  if(!V->Terrain->Routes.IsValidIndex(RouteIndex)||Roster.Num()!=ATerraVehicle::VehicleCount||!TerraTireProbeValidation::Load()){
    Check(TEXT("Granite tire-fit route and cooked measurement inputs load"),false,Roster.Num());
    return false;
  }
  int32 OnlyVehicle=INDEX_NONE,OnlyStage=INDEX_NONE;
  Run.Combined=FParse::Param(FCommandLine::Get(),TEXT("TerraGraniteLedgeLocks"));
  FParse::Value(FCommandLine::Get(),TEXT("TerraGraniteFitVehicle="),OnlyVehicle);
  FParse::Value(FCommandLine::Get(),TEXT("TerraGraniteFitStage="),OnlyStage);
  if(Run.Combined){
    OnlyVehicle=OnlyVehicle==INDEX_NONE?0:OnlyVehicle;
    if(!Roster.IsValidIndex(OnlyVehicle))return false;
    const auto& Fits=Roster[OnlyVehicle]->AsObject()->GetArrayField(TEXT("tireFits"));
    if(!Fits.IsEmpty())OnlyStage=Fits.Last()->AsObject()->GetIntegerField(TEXT("stage"));
  }
  Run.Detailed=Run.Combined||OnlyStage!=INDEX_NONE;
  const bool All=FParse::Param(FCommandLine::Get(),TEXT("TerraGraniteFitAll"))||OnlyStage!=INDEX_NONE;
  for(int32 Index=0;Index<Roster.Num();++Index){
    if(OnlyVehicle!=INDEX_NONE&&Index!=OnlyVehicle)continue;
    const auto Spec=Roster[Index]->AsObject();
    const auto& Sizes=Spec->GetArrayField(TEXT("tireFits"));
    const double StockInches=Spec->GetNumberField(TEXT("tireRadius"))/.0127;
    if((All||StockInches>=40)&&(OnlyStage==INDEX_NONE||OnlyStage==0))Run.Schedule.Add({Index,0});
    for(const auto& Size:Sizes){
      const auto Fit=Size->AsObject();
      const int32 Stage=Fit->GetIntegerField(TEXT("stage"));
      if((All||Fit->GetNumberField(TEXT("diameterInches"))>=40)&&(OnlyStage==INDEX_NONE||OnlyStage==Stage))Run.Schedule.Add({Index,Stage});
    }
  }
  const bool Valid=!Run.Schedule.IsEmpty()&&(OnlyVehicle!=INDEX_NONE||OnlyStage!=INDEX_NONE||Run.Schedule.Num()>=40);
  Check(TEXT("Granite test schedules tire diameters directly from the cooked catalog"),Valid,Run.Schedule.Num());
  const auto& R=V->Terrain->Routes[RouteIndex];
  Run.Forward=FRotator(0,R.Yaw,0).Vector();
  Run.Side=FVector::CrossProduct(FVector::UpVector,Run.Forward);
  V->SetEnergyUsageEnabled(false,false);
  V->SetDamageEnabled(false,false);
  V->Terrain->SetRain(false);
  V->Terrain->ResetSoil();
  return Valid;
}

void StartCombinedTurn(ATerraVehicle* V,const FTerraRoute& R){
  // Begin within the right bench and give each steering direction comparable
  // uphill room. Both poses use the selected kit's real tire supports.
  StartAt(V,R,1040,Run.CombinedSign==0?232:195);
  Run.CombinedImage=false;
  Run.CombinedFullFrames=0;
  Run.CombinedPeakTwist=0;
  Run.CombinedPeakFlex=0;
  Run.CombinedTireGap=UE_BIG_NUMBER;
  Run.Advance(EPhase::CombinedSettle);
}

void FrameLedgeTires(ATerraVehicle* V,bool Left){
  auto* Player=Cast<APlayerController>(V->GetController());
  if(!Player)return;
  if(!Run.LedgeCamera.IsValid())Run.LedgeCamera=V->GetWorld()->SpawnActor<ACameraActor>();
  if(!Run.LedgeCamera.IsValid())return;
  const FVector Center=V->GetActorLocation();
  const FVector Nose=V->GetActorForwardVector(),Side=V->GetActorRightVector();
  const FVector Eye=Center+Nose*620+Side*(Left?-500:500)+FVector(0,0,260);
  const FVector Target=Center+Nose*65-FVector(0,0,20);
  Run.LedgeCamera->SetActorLocationAndRotation(Eye,(Target-Eye).Rotation());
  Run.LedgeCamera->GetCameraComponent()->SetFieldOfView(50);
  Player->SetViewTarget(Run.LedgeCamera.Get());
}

void Install(ATerraVehicle* V,const FFit& Fit,const FTerraRoute& R) {
  auto& Data=Run.Data;
  Data=FObservation{};
  V->SetGarage(true);
  if(Run.LastVehicle!=Fit.Vehicle){
    V->SelectVehicle(Fit.Vehicle,false);
    V->ResetUpgrades(false);
    Run.LastVehicle=Fit.Vehicle;
  }
  Data.Size=Fit.Stage;
  Data.Suspension=V->RequiredTireSuspensionStage(Fit.Stage);
  if(V->UpgradeStage(TerraSim::Suspension)!=Data.Suspension)
    V->SetUpgrade(TerraSim::Suspension,Data.Suspension,false);
  if(Fit.Stage>0){
    V->SetUpgrade(TerraSim::TireSize,Fit.Stage,false);
    if(V->UpgradeStage(TerraSim::Tires)!=3)V->SetUpgrade(TerraSim::Tires,3,false);
  }
  if(!V->HasLowRange())V->SetUpgrade(TerraSim::Drivetrain,2,false);
  float RequestedPressure=0;
  if(FParse::Value(FCommandLine::Get(),TEXT("TerraGranitePressure="),RequestedPressure)&&RequestedPressure>0)
    V->RequestTirePressure(RequestedPressure,false);
  const auto Spec=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[Fit.Vehicle]->AsObject();
  Run.LaneTarget=V->SpecValue(TEXT("length"))>5.65f?240.f:BenchCM;
  const auto Suspension=Spec->GetObjectField(TEXT("suspension"));
  Run.Spring=Suspension->GetNumberField(TEXT("springRate"))*V->Tuning.Spring;
  Run.Rest=Suspension->GetNumberField(TEXT("restLength"));
  V->SetGarage(false);
  const bool Selected=V->VehicleIndex==Fit.Vehicle&&V->UpgradeStage(TerraSim::TireSize)==Fit.Stage&&
    V->UpgradeStage(TerraSim::Suspension)==Data.Suspension;
  const bool Tires=TerraTireProbeValidation::Matches(V);
  const bool Body=V->CoachworkCollisionReady&&BuildBodySamples(V);
  Data.Installed=Selected&&Tires&&Body;
  if(!Data.Installed)UE_LOG(LogTemp,Warning,TEXT("TERRA_GRANITE_MISSING vehicle=%d size=%d selection=%d tireWitness=%d shell=%d welded=%d"),
    Fit.Vehicle,Fit.Stage,Selected,Tires,Body,V->CoachworkCollisionReady);
  if(Run.Combined)StartCombinedTurn(V,R);
  else{
    StartAt(V,R,100,180);
    Run.Advance(EPhase::TurnSettle);
  }
}

void FinishFit(ATerraVehicle* V,const FFit& Fit,TFunctionRef<void(const FString&,bool,float)> Check) {
  auto& Data=Run.Data;
  const FString Label=FString::Printf(TEXT("%s stage %d (%.1f in)"),*V->VehicleName,Fit.Stage,V->TireDiameter());
  Check(Label+TEXT(" installs cooked tire and matching coachwork"),Data.Installed&&Data.Finite,Data.Samples);
  Check(Label+TEXT(" reaches both steering locks while rolling"),Data.LeftFrames>=2&&Data.RightFrames>=2&&
    Data.PeakLeftAngle>=V->TireKitSteeringDegrees*.87f&&Data.PeakRightAngle>=V->TireKitSteeringDegrees*.87f,
    FMath::Min(Data.PeakLeftAngle,Data.PeakRightAngle));
  Check(Label+TEXT(" drives the Granite ledges under its own power"),
    Data.Progress>=LedgeEndCM&&Data.DrivenRockFrames>=12&&Data.MaxHeight-Data.MinHeight>75&&Data.Gates>=2,Data.Progress);
  Check(Label+TEXT(" avoids sustained rubbing and tire burial"),Data.Samples>=15&&Data.MaxBodyOverlapTime<.35f&&
    Data.MaxTireSinkTime<.35f&&(V->TireDiameter()<40||!Run.Detailed||Data.MinimumTireGap>=-TreadToleranceCM),FMath::Min(Data.MinimumBodyGap,Data.MinimumTireGap));
  Check(Label+TEXT(" stays upright without getting hung up"),
    Data.Upright&&Data.TurnSettled&&Data.LedgeSettled&&Data.MaxGroundedTime<1.3f&&V->ObjectBodyHits==0,Data.MinUp);
  UE_LOG(LogTemp,Display,TEXT("TERRA_GRANITE_FIT vehicle=%d stage=%d inches=%.2f psi=%.2f suspension=%d drivetrain=%d locks=%d/%d/%d installed=%d settled=%d/%d gates=%d progressCM=%.2f rockFrames=%d fullLeft=%d fullRight=%d angles=%.2f/%.2f minUp=%.4f pitch=%.2f roll=%.2f riseCM=%.2f samples=%d bodyGapCM=%.2f tireGapCM=%.2f bodyOverlapS=%.3f tireSinkS=%.3f bumpFrames=%d maxBumpOverrunCM=%.2f lowSpeedAfterContactS=%.3f groundHits=%d objectHits=%d"),
    Fit.Vehicle,Fit.Stage,V->TireDiameter(),V->WheelPressure(0),Data.Suspension,V->UpgradeStage(TerraSim::Drivetrain), V->FrontLocked, V->CenterLockActive()||V->HasRigidTransfer(), V->RearLocked, Data.Installed,
    Data.TurnSettled,Data.LedgeSettled,Data.Gates,Data.Progress,
    Data.DrivenRockFrames,Data.LeftFrames,Data.RightFrames,Data.PeakLeftAngle,Data.PeakRightAngle,Data.MinUp,Data.MaxPitch,Data.MaxRoll,
    Data.MaxHeight-Data.MinHeight,Data.Samples,Data.MinimumBodyGap,Data.MinimumTireGap,Data.MaxBodyOverlapTime,Data.MaxTireSinkTime,
    Data.BumpFrames,Data.WorstBumpCM,Data.MaxGroundedTime,V->TerrainBodyHits,V->ObjectBodyHits);
}

}

bool Tick(ATerraVehicle* V,float Delta,
          TFunctionRef<void(const FString&,bool,float)> Check,
          TFunctionRef<void(const TCHAR*)> Capture){
  if(Run.Vehicle.Get()!=V){
    Run=FRun{};
    Run.Vehicle=V;
    if(!BuildSchedule(V,Check))return true;
  }
  const auto& R=V->Terrain->Routes[RouteIndex];
  const auto& Fit=Run.Schedule[Run.Index];
  auto& Data=Run.Data;
  Run.Time+=Delta;
  switch(Run.Phase){
    case EPhase::Fit:
      Install(V,Fit,R);
      return false;
    case EPhase::TurnSettle:
      if(Run.Time<.85f)return false;
      Data.TurnSettled=V->ContactCount>=2&&FMath::Abs(V->Speed)<.35f;
      if(!Data.TurnSettled&&Run.Time<1.7f)return false;
      Run.Advance(EPhase::RollIn);
      return false;
    case EPhase::RollIn:
      V->TestSteer=0;
      SpeedDemand(V,.8f,.50f);
      if(Run.Time>.45f)Run.Advance(EPhase::Left);
      return false;
    case EPhase::Left:
    case EPhase::Right: {
      const bool Left=Run.Phase==EPhase::Left;
      V->TestSteer=Left?-1.f:1.f;
      SpeedDemand(V,.8f,.45f);
      Observe(V,Delta,false);
      const int32 Turns=Left?Data.LeftFrames:Data.RightFrames;
      if(Run.Time<(Left?1.25f:1.40f)||(Turns<2&&Run.Time<1.95f))return false;
      if(Left)Run.Advance(EPhase::Right);
      else{
        StartAt(V,R,LedgeStartCM,Run.LaneTarget);
        Run.Advance(EPhase::LedgeSettle);
      }
      return false;
    }
    case EPhase::LedgeSettle:
      if(Run.Time<.85f)return false;
      Data.LedgeSettled=V->ContactCount>=2&&FMath::Abs(V->Speed)<.45f;
      if(Data.LedgeSettled&&(Fit.Vehicle==6||Fit.Vehicle==9||Fit.Vehicle==10)){
        // Teleport preserves drivetrain settings. Establish the requested
        // lockers through the player controls for each fit before driving.
        if(V->HasCenterLocker()&&!V->CenterLockActive())V->ToggleCenterLocker();
        if(V->HasLocker(false)&&!V->RearLocked)V->ToggleLocker(false);
        if(V->HasLocker(true)&&!V->FrontLocked)V->ToggleLocker(true);
        Data.LedgeSettled=(!V->HasCenterLocker()||V->CenterLockActive())&&
          (!V->HasLocker(false)||V->RearLocked)&&(!V->HasLocker(true)||V->FrontLocked);
      }
      if(!Data.LedgeSettled&&Run.Time<2.5f)return false;
      Run.Advance(EPhase::Ledge);
      return false;
    case EPhase::CombinedSettle:
      if(Run.Time>.85f)Run.Advance(EPhase::CombinedRoll);
      return false;
    case EPhase::CombinedRoll:
      SpeedDemand(V,Fit.Vehicle==4?.65f:.55f,Fit.Vehicle==4?.68f:.52f);
      if(Run.Time>.40f)Run.Advance(EPhase::CombinedTurn);
      return false;
    case EPhase::CombinedTurn: {
      const bool Left=Run.CombinedSign==0;
      V->TestSteer=Left?-1.f:1.f;
      SpeedDemand(V,Fit.Vehicle==4?.65f:.55f,Fit.Vehicle==4?.68f:.52f);
      const float Progress=Along(V,R),Lane=Lateral(V,R);
      Observe(V,Delta,false);
      int32 Rock=0;
      float Highest=-UE_BIG_NUMBER,Lowest=UE_BIG_NUMBER,MaxSteer=0,Flex=0;
      for(int I=0;I<V->WheelCount();++I){
        const auto& W=V->WheelState[I];
        if(I<2)MaxSteer=FMath::Max(MaxSteer,float(FMath::Abs(FMath::RadiansToDegrees(W.Angle))));
        if(!W.ContactValid||W.Load<50||W.Ground.Surface!=4)continue;
        ++Rock;
        const auto& TireData=V->Wheels[I]->GetCustomPrimitiveData().Data;
        if(TireData.Num()>15&&TireData[15]>0)Flex=FMath::Max(Flex,TireData[11]);
        Highest=FMath::Max(Highest,W.Distance);
        Lowest=FMath::Min(Lowest,W.Distance);
      }
      if(Rock>=2&&Progress>1045&&Progress<1230&&Lane>130&&Lane<320&&V->Speed>.20f&&V->Speed<1.05f&&
          (Left?-V->Steer:V->Steer)>=.97f&&MaxSteer>=V->TireKitSteeringDegrees*.87f){
        ++Run.CombinedFullFrames;
        Run.CombinedPeakTwist=FMath::Max(Run.CombinedPeakTwist,(Highest-Lowest)*100);
        Run.CombinedPeakFlex=FMath::Max(Run.CombinedPeakFlex,Flex);
        if(!Run.CombinedImage&&Run.CombinedFullFrames>=3){
          FrameLedgeTires(V,Left);
          const TCHAR* Vehicle=Fit.Vehicle==4?TEXT("hummer"):TEXT("wrangler");
          Capture(*FString::Printf(TEXT("granite-fit-%s-50-ledge-%s.png"),Vehicle,Left?TEXT("left"):TEXT("right")));
          Run.CombinedImage=true;
        }
      }
      if(Run.Time<(Fit.Vehicle==4?2.1f:1.65f)&&Data.Upright&&Progress<1230&&Lane>105&&Lane<340)return false;
      const FString Side=Left?TEXT("left"):TEXT("right");
      Check(V->VehicleName+TEXT(" crawls at full ")+Side+TEXT(" steering on the Granite ledge"),
        Data.Installed&&Run.CombinedFullFrames>=3&&Run.CombinedPeakTwist>5&&Run.CombinedPeakFlex>.5f,Run.CombinedFullFrames);
      UE_LOG(LogTemp,Display,TEXT("TERRA_GRANITE_LEDGE_LOCK vehicle=%d direction=%s inches=%.2f psi=%.2f samples=%d fullFrames=%d suspensionSpreadCM=%.2f deflectionCM=%.2f progressCM=%.2f laneCM=%.2f up=%.4f bodyGapCM=%.2f tireGapCM=%.2f"),
        Fit.Vehicle,*Side,V->TireDiameter(),V->WheelPressure(0),Data.Samples,Run.CombinedFullFrames,Run.CombinedPeakTwist,Run.CombinedPeakFlex,Progress,Lane,Data.MinUp,Data.MinimumBodyGap,Run.CombinedTireGap);
      if(Left){
        ++Run.CombinedSign;
        StartCombinedTurn(V,R);
        return false;
      }
      Check(V->VehicleName+TEXT(" keeps the tires clear of the ledge at both steering locks"),
        Data.Installed&&Data.Samples>=12&&Data.Upright&&Data.Finite&&Data.MaxBodyOverlapTime<.35f&&Data.MaxTireSinkTime<.35f&&
        V->ObjectBodyHits==0&&Data.MinimumTireGap>=-TreadToleranceCM,FMath::Min(Data.MinimumBodyGap,Data.MinimumTireGap));
      Brake(V);
      return true;
    }
    case EPhase::Ledge: {
      const float Progress=Along(V,R),Lane=Lateral(V,R);
      Data.Progress=FMath::Max(Data.Progress,Progress);
      Data.Gates=V->GateIndex;
      const float Aim=R.Yaw-FMath::RadiansToDegrees(FMath::Atan2(Lane-Run.LaneTarget,340.f));
      const float Error=FMath::FindDeltaAngleDegrees(V->GetActorRotation().Yaw,Aim);
      V->TestSteer=FMath::Clamp(Error/24.f,-.72f,.72f);
      SpeedDemand(V,1.55f,.62f);
      Observe(V,Delta,true);
      if(!Run.Captured&&Fit.Vehicle==0&&Fit.Stage==V->UpgradeMaxStage(TerraSim::TireSize)&&Progress>=1100){
        Capture(TEXT("granite-fit-largest-wrangler-on-ledge.png"));
        Run.Captured=true;
      }
      if(Progress<LedgeEndCM&&Run.Time<12.f&&Data.Upright&&FMath::Abs(Lane)<420&&Progress>LedgeStartCM-240)return false;
      Brake(V);
      FinishFit(V,Fit,Check);
      if(++Run.Index==Run.Schedule.Num())return true;
      Run.Advance(EPhase::Fit);
      return false;
    }
  }
  return true;
}

}
