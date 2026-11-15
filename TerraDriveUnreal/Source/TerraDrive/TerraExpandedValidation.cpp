#include "TerraExpandedValidation.h"
#include "TerraContact.h"
#include "TerraVehicle.h"
#include "TerraTireProbeValidation.h"
#include "TerraGameMode.h"
#include "TerraGarage.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Input/SButton.h"
#include "Components/BoxComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"
#include "GameFramework/HUD.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInterface.h"
#include "Math/Plane.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StaticMeshResources.h"
namespace TerraExpandedValidation {
namespace {
bool TireUpgradeRowVisible(const TSharedPtr<STerraGarage>& Garage){
  if(!Garage.IsValid()||!Garage->UpgradePartScrollBox().IsValid())return false;
  const auto Row=Garage->UpgradePartWidget(TerraSim::TireSize);
  if(!Row.IsValid()||!Row->GetVisibility().IsVisible())return false;
  const auto& R=Row->GetCachedGeometry();const auto& S=Garage->UpgradePartScrollBox()->GetCachedGeometry();
  const auto& G=Garage->GetCachedGeometry();
  const auto RT=R.LocalToAbsolute(FVector2D::ZeroVector),RB=R.LocalToAbsolute(R.GetLocalSize());
  const auto ST=S.LocalToAbsolute(FVector2D::ZeroVector),SB=S.LocalToAbsolute(S.GetLocalSize());
  const auto GT=G.LocalToAbsolute(FVector2D::ZeroVector),GB=G.LocalToAbsolute(G.GetLocalSize());
  return R.GetLocalSize().X>0&&R.GetLocalSize().Y>0&&S.GetLocalSize().Y>0&&
      RT.X>=ST.X-1&&RB.X<=SB.X+1&&RT.Y>=ST.Y-1&&RB.Y<=SB.Y+1&&
      RT.X>=GT.X-1&&RB.X<=GB.X+1&&RT.Y>=GT.Y-1&&RB.Y<=GB.Y+1;
}

struct FBodyTriangle { FVector A,B,C; };
struct FStockClearanceTarget { const TCHAR* Name; const TCHAR* SlotField; int SlotCount; };
constexpr double StockClearanceCM=.5;

bool IntersectsTireSweep(const FBodyTriangle& Triangle,TConstArrayView<FPlane> Planes){
  TArray<FVector,TInlineAllocator<8>> Polygon{Triangle.A,Triangle.B,Triangle.C},Clipped;
  for(const FPlane& Plane:Planes){
    Clipped.Reset();
    FVector Previous=Polygon.Last();
    double PreviousDistance=Plane.PlaneDot(Previous);
    for(const FVector& Point:Polygon){
      const double Distance=Plane.PlaneDot(Point);
      if((Distance>0)!=(PreviousDistance>0)){
        Clipped.Add(FMath::Lerp(Previous,Point,PreviousDistance/(PreviousDistance-Distance)));
      }
      if(Distance<=0)Clipped.Add(Point);
      Previous=Point;
      PreviousDistance=Distance;
    }
    if(Clipped.IsEmpty())return false;
    Swap(Polygon,Clipped);
  }
  return true;
}

bool StockWheelClears(const ATerraVehicle* V,int WheelIndex,const TArray<FBodyTriangle>& Body,
    const TerraTireProbeValidation::FMeshEnvelope& Envelope,double BumpCM,double ReboundCM,
    const FStockClearanceTarget& Target){
  const bool RearOnly=Target.SlotField!=nullptr;
  const auto* Wheel=V->Wheels[WheelIndex].Get();
  const FVector Center=V->GetActorTransform().InverseTransformPosition(Wheel->GetComponentLocation());
  const FVector Scale=Wheel->GetComponentTransform().GetScale3D().GetAbs();
  const FBox TireBounds=Wheel->GetStaticMesh()->GetBoundingBox().TransformBy(
    FTransform(FQuat::Identity,FVector::ZeroVector,Scale));
  const FVector Extent=TireBounds.Min.GetAbs().ComponentMax(TireBounds.Max.GetAbs());
  const double Radius=FMath::Max(FMath::Max3(double(V->TireDiameter())*1.27,Extent.X,Extent.Z),
    Envelope.RadiusCM*FMath::Max(Scale.X,Scale.Z));
  const double HalfWidth=FMath::Max(Extent.Y,Envelope.HalfWidthCM*Scale.Y);
  const bool Front=WheelIndex<2;
  const float Span=V->AxleOffsetM(0)-V->AxleOffsetM(1);
  const float FrontLock=FMath::DegreesToRadians(ATerraVehicle::SteeringLockDegrees);
  const float RearLock=RearOnly?FrontLock*ATerraVehicle::MonsterRearSteerRatio:0;
  const float AxleLock=Front?FrontLock:RearLock,OtherLock=Front?RearLock:FrontLock;
  const float LateralOffset=Center.Y*.01f,SignedSpan=Front?Span:-Span;
  const float Left=TerraSim::AckermannAngle(-AxleLock,-OtherLock,LateralOffset,SignedSpan);
  const float Right=TerraSim::AckermannAngle(AxleLock,OtherLock,LateralOffset,SignedSpan);
  const float MinAngle=FMath::Min(Left,Right),MaxAngle=FMath::Max(Left,Right);
  const int Steps=FMath::CeilToInt(FMath::RadiansToDegrees(MaxAngle-MinAngle));
  const double Step=Steps?(MaxAngle-MinAngle)/Steps:0;
  const double Reach=FMath::Sqrt(FMath::Square(Radius)+FMath::Square(HalfWidth));
  // Bound the displacement between steering samples as well as the clearance.
  const double Padding=StockClearanceCM+2*Reach*FMath::Sin(Step/4);
  const double XY=FMath::Sqrt(FMath::Square((Radius+Padding)/FMath::Cos(UE_DOUBLE_PI/32))+
    FMath::Square(HalfWidth+Padding));
  const FVector Start=Center-FVector::UpVector*ReboundCM;
  const double TravelCM=ReboundCM+BumpCM;
  const FBox Zone(Start-FVector(XY,XY,Radius+Padding),Start+FVector(XY,XY,Radius+Padding+TravelCM));
  TArray<const FBodyTriangle*> Nearby;
  for(const auto& Triangle:Body){
    FBox Bounds(ForceInit);
    Bounds+=Triangle.A;Bounds+=Triangle.B;Bounds+=Triangle.C;
    if(Zone.Intersect(Bounds))Nearby.Add(&Triangle);
  }
  if(!RearOnly&&Nearby.IsEmpty())return false;

  for(int I=0;I<=Steps;++I){
    const double Angle=MinAngle+Step*I;
    const FVector Forward(FMath::Cos(Angle),FMath::Sin(Angle),0);
    const FVector Axle(-Forward.Y,Forward.X,0);
    TArray<FPlane,TInlineAllocator<34>> Sweep;
    Sweep.Emplace(Axle,FVector::DotProduct(Axle,Start)+HalfWidth+Padding);
    Sweep.Emplace(-Axle,FVector::DotProduct(-Axle,Start)+HalfWidth+Padding);
    // Tangent planes enclose the cylinder throughout the vertical sweep.
    for(int J=0;J<32;++J){
      const double Phase=2*UE_DOUBLE_PI*J/32;
      const FVector Normal=Forward*FMath::Cos(Phase)+FVector::UpVector*FMath::Sin(Phase);
      Sweep.Emplace(Normal,FVector::DotProduct(Normal,Start)+Radius+Padding+FMath::Max(0.,Normal.Z*TravelCM));
    }
    for(const auto* Triangle:Nearby){
      if(IntersectsTireSweep(*Triangle,Sweep)){
        UE_LOG(LogTemp,Display,TEXT("TERRA_STOCK_TIRE_OVERLAP target=%s wheel=%d steerDeg=%.2f centerCm=%s radiusCm=%.3f halfWidthCm=%.3f triangleCm=[%s; %s; %s]"),
          Target.Name,WheelIndex,FMath::RadiansToDegrees(Angle),*Center.ToString(),Radius,HalfWidth,
          *Triangle->A.ToString(),*Triangle->B.ToString(),*Triangle->C.ToString());
        return false;
      }
    }
  }
  UE_LOG(LogTemp,Display,TEXT("TERRA_STOCK_TIRE_CLEARANCE target=%s wheel=%d reboundMm=%.3f bumpMm=%.3f minimumMm=%.1f steerDeg=[%.2f,%.2f] poses=%d nearbyTriangles=%d"),
    Target.Name,WheelIndex,ReboundCM*10,BumpCM*10,StockClearanceCM*10,
    FMath::RadiansToDegrees(MinAngle),FMath::RadiansToDegrees(MaxAngle),Steps+1,Nearby.Num());
  return true;
}

void CheckStockTireClearance(ATerraVehicle* V,const FJsonObject& Spec,const FStockClearanceTarget& Target,
    TFunctionRef<void(const FString&,bool,float)> Check){
  const bool RearOnly=Target.SlotField!=nullptr;
  TSet<FName> TargetSlots,MatchedSlots;
  const TArray<TSharedPtr<FJsonValue>>* Slots=nullptr;
  if(RearOnly&&Spec.TryGetArrayField(Target.SlotField,Slots)){
    for(const auto& Slot:*Slots)TargetSlots.Add(FName(*Slot->AsString()));
  }
  const UStaticMesh* Mesh=V->Body->GetStaticMesh();
  const auto* Render=Mesh&&Mesh->bAllowCPUAccess?Mesh->GetRenderData():nullptr;
  TArray<FBodyTriangle> Triangles;
  if(Render&&Render->LODResources.IsValidIndex(0)){
    const auto& LOD=Render->LODResources[0];
    const auto& Positions=LOD.VertexBuffers.PositionVertexBuffer;
    const auto Indices=LOD.IndexBuffer.GetArrayView();
    const FTransform BodyToActor=V->Body->GetComponentTransform().GetRelativeTransform(V->GetActorTransform());
    const auto Point=[&](int Index){return BodyToActor.TransformPosition(FVector(Positions.VertexPosition(Indices[Index])));};
    const auto AddTriangles=[&](uint32 First,uint32 Count){
      const uint64 End=uint64(First)+uint64(Count)*3;
      if(End>uint64(Indices.Num()))return false;
      for(uint32 I=First;I<End;I+=3)Triangles.Add({Point(I),Point(I+1),Point(I+2)});
      return Count>0;
    };
    if(RearOnly){
      const auto& Materials=Mesh->GetStaticMaterials();
      for(const auto& Section:LOD.Sections){
        if(!Section.NumTriangles||!Materials.IsValidIndex(Section.MaterialIndex))continue;
        const auto& Material=Materials[Section.MaterialIndex];
        for(const FName Slot:TargetSlots){
          // Automotive material instances retain the exported slot ID as their suffix.
          if(Material.MaterialSlotName!=Slot&&(!Material.MaterialInterface||
            !Material.MaterialInterface->GetName().EndsWith(TEXT("_")+Slot.ToString())))continue;
          if(AddTriangles(Section.FirstIndex,Section.NumTriangles))MatchedSlots.Add(Slot);
          break;
        }
      }
      UE_LOG(LogTemp,Display,TEXT("TERRA_STOCK_CLEARANCE_SECTIONS target=%s matched=%d triangles=%d"),Target.Name,MatchedSlots.Num(),Triangles.Num());
    }else{
      Triangles.Reserve(Indices.Num()/3);
      AddTriangles(0,Indices.Num()/3);
    }
  }
  const bool FactoryTires=V->Garage&&!V->Tracks&&V->UpgradeStage(TerraSim::TireSize)==0&&
    V->UpgradeStage(TerraSim::Tires)==0&&V->UpgradeStage(TerraSim::Wheels)==0&&
    V->UpgradeStage(TerraSim::Suspension)==0&&TerraTireProbeValidation::Load()&&TerraTireProbeValidation::Matches(V);
  const auto Envelope=TerraTireProbeValidation::MeshEnvelope(V);
  const bool CookedTargetReady=!Triangles.IsEmpty()&&(!RearOnly||
    (TargetSlots.Num()==Target.SlotCount&&MatchedSlots.Num()==Target.SlotCount&&Envelope.RadiusCM>0&&Envelope.HalfWidthCM>0));
  for(int I=RearOnly?2:0;I<4;++I){
    const double BumpCM=V->BumpTravel(I<2)*100;
    const double ReboundCM=RearOnly?V->ReboundTravel(I/2)*100:0;
    const bool Pass=FactoryTires&&CookedTargetReady&&BumpCM>0&&(!RearOnly||ReboundCM>0)&&
      StockWheelClears(V,I,Triangles,Envelope,BumpCM,ReboundCM,Target);
    const FString Label=RearOnly?FString::Printf(TEXT("stock Grave Digger rear tire %d clears cooked %s by 5 mm through full travel and steering"),I,Target.Name):
      FString::Printf(TEXT("stock 22B tire %d clears cooked body by 5 mm through full compression and steering"),I);
    Check(Label,Pass,(BumpCM+ReboundCM)*10);
  }
}

void CheckTireFitments(ATerraVehicle* V,const FJsonObject& Spec,
    TFunctionRef<void(const TCHAR*,bool,float)> Check){
  const int Largest=V->UpgradeMaxStage(TerraSim::TireSize);
  const float Stock=V->TireDiameter(),StockHeight=V->ExpectedRideHeight();
  const UStaticMesh* Rim=V->Rims[0]->GetStaticMesh().Get();
  const double RimRadius=Rim?Rim->GetBounds().SphereRadius:0;
  const TArray<TSharedPtr<FJsonValue>>* Fits=nullptr;
  const bool Metadata=Spec.TryGetArrayField(TEXT("tireFits"),Fits)&&Fits->Num()==Largest;
  Check(TEXT("body-derived fit table covers every offered tire diameter"),Metadata,Largest);
  bool Ordered=true,Bounded=true,RequiresSuspension=true,RejectsDowngrade=true,Separated=true;
  bool Probes=TerraTireProbeValidation::Load(),RimPreserved=Rim!=nullptr,IndependentCompound=true;
  bool Stance=true;
  float PreviousDiameter=0,WorstRiseError=0;
  for(int Size=0;Size<=Largest;++Size){
    V->ResetUpgrades(false);
    const int Required=V->RequiredTireSuspensionStage(Size);
    if(Size>0){
      RequiresSuspension&=Required>0&&Required<=V->UpgradeMaxStage(TerraSim::Suspension)&&
        !V->UpgradeUnavailableReason(TerraSim::TireSize,Size).IsEmpty();
      V->SetUpgrade(TerraSim::TireSize,Size,false);
      RequiresSuspension&=V->UpgradeStage(TerraSim::TireSize)==0&&V->UpgradeStage(TerraSim::Suspension)==0;
      V->SetUpgrade(TerraSim::Suspension,Required,false);
      V->SetUpgrade(TerraSim::TireSize,Size,false);
      RejectsDowngrade&=!V->UpgradeUnavailableReason(TerraSim::Suspension,Required-1).IsEmpty();
      V->SetUpgrade(TerraSim::Suspension,Required-1,false);
      RejectsDowngrade&=V->UpgradeStage(TerraSim::Suspension)==Required&&V->UpgradeStage(TerraSim::TireSize)==Size;
    }
    const float Diameter=V->TireDiameter();
    double Expected=Stock;
    if(Size>0){
      const auto Fit=Metadata?(*Fits)[Size-1]->AsObject():nullptr;
      Ordered&=Fit.IsValid()&&Fit->GetIntegerField(TEXT("stage"))==Size&&
        Fit->TryGetNumberField(TEXT("diameterInches"),Expected);
      RequiresSuspension&=Fit.IsValid()&&Fit->GetIntegerField(TEXT("minimumSuspensionStage"))==Required;
      Bounded&=Diameter>Stock&&Diameter<=50.01f&&FMath::IsNearlyEqual(Diameter,float(FMath::RoundToInt(Diameter)),.02f);
    }
    Ordered&=V->UpgradeStage(TerraSim::TireSize)==Size&&Diameter>PreviousDiameter&&FMath::IsNearlyEqual(Diameter,float(Expected),.02f);
    PreviousDiameter=Diameter;
    for(int Axle=1;Axle<V->AxleCount();++Axle)
      Separated&=V->AxleOffsetM(Axle-1)-V->AxleOffsetM(Axle)>Diameter*.0254f+.05f;
    Probes&=TerraTireProbeValidation::Matches(V);
    const UStaticMesh* FittedRim=V->Rims[0]->GetStaticMesh().Get();
    RimPreserved&=FittedRim&&FMath::IsNearlyEqual(double(FittedRim->GetBounds().SphereRadius),RimRadius,.01);
    const float ExpectedRise=(Diameter-Stock)*.0127f+.035f*Required;
    const float Rise=V->ExpectedRideHeight()-StockHeight;
    WorstRiseError=FMath::Max(WorstRiseError,FMath::Abs(Rise-ExpectedRise));
    Stance&=FMath::IsNearlyEqual(Rise,ExpectedRise,.01f)&&FMath::IsNearlyEqual(V->Tuning.Lift,.035f*Required,.01f);
    const UStaticMesh* Mesh=V->Wheels[0]->GetStaticMesh().Get();
    const FVector Scale=V->Wheels[0]->GetComponentScale();
    const float Grip=V->Tuning.Grip;
    for(int Compound=1;Compound<=V->UpgradeMaxStage(TerraSim::Tires);++Compound){
      V->SetUpgrade(TerraSim::Tires,Compound,false);
      const FVector CompoundScale=V->Wheels[0]->GetComponentScale();
      IndependentCompound&=V->UpgradeStage(TerraSim::Tires)==Compound&&V->UpgradeStage(TerraSim::TireSize)==Size&&
        FMath::IsNearlyEqual(V->TireDiameter(),Diameter,.01f)&&V->Wheels[0]->GetStaticMesh().Get()==Mesh&&
        FMath::IsNearlyEqual(CompoundScale.X,Scale.X,.0001)&&FMath::IsNearlyEqual(CompoundScale.Z,Scale.Z,.0001)&&
        V->Tuning.Grip>Grip;
    }
    V->SetUpgrade(TerraSim::Tires,0,false);
  }
  Check(TEXT("available tire diameters are ordered and match their fitted measurements"),Ordered,PreviousDiameter);
  Check(TEXT("upsized tires are whole-inch options capped at 50 inches"),Bounded,PreviousDiameter);
  Check(TEXT("larger tires require the minimum suspension with no automatic upgrade"),RequiresSuspension,Largest);
  Check(TEXT("downgrading suspension below the installed tire requirement is rejected"),RejectsDowngrade,Largest);
  Check(TEXT("all fitted tire envelopes stay separated between axles"),Separated,PreviousDiameter);
  Check(TEXT("all fitted tire meshes match cooked geometry witnesses"),Probes,Largest);
  Check(TEXT("all fitted tire diameters retain the original rim size"),RimPreserved,RimRadius);
  Check(TEXT("all selectable compounds affect grip without changing tire diameter or tire mesh"),IndependentCompound,Largest);
  Check(TEXT("ride height only rises by the added tire radius and selected suspension lift"),Stance,WorstRiseError*100);
}
bool BeginTireGarage(ATerraVehicle* V,const TSharedPtr<STerraGarage>& Garage){
  if(!Garage.IsValid()||Garage->UpgradePartWidget(TerraSim::TireSize)!=Garage->UpgradePartWidget(TerraSim::Tires))return false;
  const int Largest=V->UpgradeMaxStage(TerraSim::TireSize);
  for(int Stage=0;Stage<=Largest;++Stage)if(!Garage->TireDiameterButton(Stage).IsValid())return false;
  for(int Stage=0;Stage<=V->UpgradeMaxStage(TerraSim::Tires);++Stage)if(!Garage->TireCompoundButton(Stage).IsValid())return false;
  const auto Stock=Garage->TireDiameterButton(0);
  if(!Stock->IsEnabled()||!Garage->TireCompoundButton(1)->IsEnabled())return false;
  Stock->SimulateClick();
  V->SetUpgrade(TerraSim::Suspension,0,false);
  return V->UpgradeStage(TerraSim::TireSize)==0&&V->UpgradeStage(TerraSim::Suspension)==0;
}
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  static int Model=0,Phase=0;static float Time=0,Travel=0;static FVector Previous,BeforeRecovery;static int Gate=0,Route=0;static float Energy=0,Damage=0;
  static TWeakObjectPtr<ACameraActor> GraniteCamera;static int GraniteView=0;
  static FVector GraniteOutside,GraniteInside;static bool GraniteSamplesValid=false;
  static int DiameterStages[ATerraVehicle::VehicleCount],DiameterInches[ATerraVehicle::VehicleCount];
  static bool GarageValid=false,MotionFinite=true;
  static float RollingDistance[ATerraVehicle::MaxWheels],PatchDistance[ATerraVehicle::MaxWheels];
  static int MotionFrames[ATerraVehicle::MaxWheels];
  Time+=Dt;if(Phase==3){V->TestThrottle=FMath::Abs(V->Speed)<2.2f?.30f:0.f;V->TestBrake=FMath::Abs(V->Speed)>2.5f?.20f:0.f;Travel+=FVector::Dist2D(V->GetActorLocation(),Previous);Previous=V->GetActorLocation();}
  auto Next=[&](int P){Phase=P;Time=0;};
  const FString Prefix=FString::Printf(TEXT("expanded vehicle %d "),Model);
  auto Test=[&](const TCHAR* Name,bool Pass,float Value=0){Check(Prefix+Name,Pass,Value);};
  if(Phase==0){
    Check(TEXT("native roster includes twelve distinct vehicle assets"),V->Terrain->Data->GetArrayField(TEXT("vehicles")).Num()==12,12);
    Check(TEXT("Granite Trials uses the ground blend and retains colored markers"),V->Terrain->HasBlendedGraniteApproach(),0);
    V->SetGarage(true);if(const auto Garage=V->GetGarageWidget())Garage->SetVisibility(EVisibility::Collapsed);V->TeleportZone(8);GraniteView=0;Next(10);
  }else if(Phase==10){
    // The authored approach starts at native X=100 m. Photograph the actual
    // shared boundary, rather than assuming the Slate Rim survey includes it.
    const FVector Edge(10000,-26700,V->Terrain->Height(10000,-26700)+25);
    FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraGraniteEntryPhoto),true,V);
    auto GroundHit=[&](float X,FVector& Point,bool Constructed){FHitResult Hit;
      const bool Found=V->GetWorld()->LineTraceSingleByChannel(Hit,FVector(X,Edge.Y,Edge.Z+5000),FVector(X,Edge.Y,Edge.Z-1000),ECC_Visibility,Query);
      if(Found)Point=Hit.ImpactPoint;
      return Found&&Hit.GetComponent()&&Hit.GetComponent()->ComponentHasTag(TEXT("TerraConstructed"))==Constructed;};
    GraniteSamplesValid=GroundHit(9700,GraniteOutside,false)&&GroundHit(10300,GraniteInside,true);
    if(!GraniteCamera.IsValid())GraniteCamera=V->GetWorld()->SpawnActor<ACameraActor>();
    if(GraniteCamera.IsValid()){
      FVector Eye=Edge+(GraniteView==0?FVector(-2400,-2900,1800):FVector(-700,-900,600));
      Eye.Z=FMath::Max(Eye.Z,V->Terrain->Height(Eye.X,Eye.Y)+450.f);
      GraniteCamera->GetCameraComponent()->SetFieldOfView(GraniteView==0?60.f:58.f);
      GraniteCamera->SetActorLocationAndRotation(Eye,(Edge-Eye).Rotation());
      if(auto* PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(GraniteCamera.Get());if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}
    }
    Next(11);
  }else if(Phase==11&&Time>1.5f){
    auto* PC=Cast<APlayerController>(V->GetController());int Width=0,Height=0;if(PC)PC->GetViewportSize(Width,Height);
    bool Framed=GraniteSamplesValid&&GraniteCamera.IsValid()&&PC&&PC->GetViewTarget()==GraniteCamera.Get()&&(!V->GetGarageWidget().IsValid()||!V->GetGarageWidget()->GetVisibility().IsVisible());
    for(const auto& P:{GraniteOutside,GraniteInside}){FVector2D Screen;
      Framed&=!P.ContainsNaN()&&PC&&PC->ProjectWorldLocationToScreen(P,Screen)&&Screen.X>24&&Screen.X<Width-24&&Screen.Y>24&&Screen.Y<Height-24;}
    Check(FString::Printf(TEXT("Granite Trials entry view %d frames natural ground and the constructed apron across the seam"),GraniteView),Framed,GraniteSamplesValid?1:0);
    Capture(GraniteView==0?TEXT("native-granite-entry-oblique.png"):TEXT("native-granite-entry-close.png"));Next(12);
  }else if(Phase==12&&Time>.35f){
    if(++GraniteView<2){Next(10);}
    else{
      if(auto* PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(V);if(PC->GetHUD())PC->GetHUD()->bShowHUD=true;}
      if(GraniteCamera.IsValid())GraniteCamera->Destroy();GraniteCamera.Reset();Next(1);
    }
  }else if(Phase==1){
    V->SelectVehicle(Model);V->ResetUpgrades(false);V->SetNearCamera(true);
    const auto Spec=V->Terrain->Data->GetArrayField(TEXT("vehicles"))[Model]->AsObject();
    const FString Id=Spec->GetStringField(TEXT("id"));
    if(Id==TEXT("grave-digger")){
      CheckStockTireClearance(V,*Spec,{TEXT("exhaust"),TEXT("exhaustSlots"),2},Check);
      CheckStockTireClearance(V,*Spec,{TEXT("rear reservoirs"),TEXT("rearReservoirSlots"),3},Check);
    }else if(Id==TEXT("subaru-22b-sti")){
      CheckStockTireClearance(V,*Spec,{TEXT("body"),nullptr,0},Check);
    }
    Test(TEXT("body and independent rim meshes are cooked"),V->Body->GetStaticMesh()&&V->Rims[0]->GetStaticMesh());
    Test(TEXT("fuel capacity is finite and positive"),FMath::IsFinite(V->FuelCapacityGallons())&&V->FuelCapacityGallons()>1,V->FuelCapacityGallons());
    if(Model==10){
      Test(TEXT("factory fixed 4H retains front and rear shaft coupling"),V->DriveCapabilities().Permanent&&V->HasRigidTransfer()&&!V->HasCenterLocker()&&V->DrivenWheel(0)&&V->DrivenWheel(2));
      V->SetUpgrade(TerraSim::CenterDifferential,1,false);
      Test(TEXT("center retrofit replaces fixed coupling with a selectable differential"),V->DriveCapabilities().Permanent&&V->HasCenterLocker()&&!V->HasRigidTransfer()&&!V->CenterLocked);
      V->ResetUpgrades(false);V->SetUpgrade(TerraSim::EVSwap,1,false);
      const bool RearOnly=!V->FourDrive&&!V->DrivenWheel(0)&&V->DrivenWheel(2);
      V->FourDrive=true;
      Test(TEXT("single motor swap retains selectable rear or rigid four wheel drive"),RearOnly&&!V->DriveCapabilities().Permanent&&V->HasRigidTransfer()&&V->DrivenWheel(0)&&V->DrivenWheel(2));
      for(int Stage:{2,3}){V->SetUpgrade(TerraSim::EVSwap,Stage,false);
        Test(*FString::Printf(TEXT("motor layout %d replaces the factory transfer shaft"),Stage),V->DriveCapabilities().Permanent&&!V->HasRigidTransfer()&&!V->HasCenterLocker()&&V->DrivenWheel(0)&&V->DrivenWheel(2));}
      V->ResetUpgrades(false);
    }
    CheckTireFitments(V,*Spec,Test);
    DiameterStages[Model]=V->UpgradeStage(TerraSim::TireSize);
    DiameterInches[Model]=DiameterStages[Model]>0?FMath::RoundToInt(V->TireDiameter()):0;
    V->SetGarage(false);V->TeleportZone(1);V->TestThrottle=0;V->TestBrake=1;V->TestSteer=0;Next(2);
  }else if(Phase==2&&Time>2){
    Test(TEXT("largest tires support the parked chassis"),V->ContactCount==V->WheelCount()&&V->GetActorUpVector().Z>.95f,V->ContactCount);
    const float Clearance=V->GetActorLocation().Z-V->Terrain->Height(V->GetActorLocation().X,V->GetActorLocation().Y);
    Test(TEXT("lifted ride height follows tire size"),FMath::Abs(Clearance-V->ExpectedRideHeight()*100)<18,Clearance);
    auto* PC=Cast<APlayerController>(V->GetController());auto* HUD=PC?Cast<ATerraHUD>(PC->GetHUD()):nullptr;
    int ViewW=0,ViewH=0;if(PC)PC->GetViewportSize(ViewW,ViewH);
    FVector2D Projected;const FBoxSphereBounds B=V->Body->Bounds;float Bottom=0;bool Visible=PC&&HUD;
    auto ProjectVisible=[&](const FVector& Point){
      if(PC&&PC->ProjectWorldLocationToScreen(Point,Projected)){Bottom=FMath::Max(Bottom,float(Projected.Y));
        Visible&=Projected.X>=8&&Projected.X<ViewW-8&&Projected.Y>=8&&Projected.Y<ViewH-8;
      }else Visible=false;
    };
    if(V->Body->GetStaticMesh()){
      const FBox Box=V->Body->GetStaticMesh()->GetBoundingBox();
      for(int I=0;I<8;++I)ProjectVisible(V->Body->GetComponentTransform().TransformPosition(
        Box.GetCenter()+Box.GetExtent()*FVector(I&1?1:-1,I&2?1:-1,I&4?1:-1)));
    }else Visible=false;
    // Independent exported tire vertices validate the actual spinning mesh,
    // not a square local box that expands and contracts as a wheel rotates.
    const bool TireProbes=TerraTireProbeValidation::Load()&&TerraTireProbeValidation::Matches(V);
    Visible&=TireProbes;
    if(TireProbes)for(const FVector& Local:TerraTireProbeValidation::ActorLocalPoints(V))ProjectVisible(V->GetActorTransform().TransformPosition(Local));
    Test(TEXT("bottom status bar clears vehicle and tires in near camera"),Visible&&HUD&&Bottom<HUD->VehicleSafeBottom-8,HUD?HUD->VehicleSafeBottom-Bottom:0);
    UE_LOG(LogTemp,Display,TEXT("TERRA_HUD_FRAMING model=%d viewport=%dx%d safeBottom=%.2f projectedBottom=%.2f bodyOrigin=%s bodyExtent=%s wheelOrigin=%s wheelExtent=%s"),Model,ViewW,ViewH,HUD?HUD->VehicleSafeBottom:0,Bottom,*B.Origin.ToString(),*B.BoxExtent.ToString(),*V->Wheels[0]->Bounds.Origin.ToString(),*V->Wheels[0]->Bounds.BoxExtent.ToString());
    Capture(*FString::Printf(TEXT("expanded-largest-tires-%d.png"),Model));Next(13);
  }else if(Phase==13&&Time>.35f){
    // Screenshot requests execute after tick; retain the tested near camera
    // until its frame is captured before starting the separate driving trial.
    // Leave the road spawn and its nearby props before the steering test.
    V->SetNearCamera(false);
    FVector Road=V->Terrain->Spawns[1]+FVector(3000,0,0);
    Road.Z=V->Terrain->Height(Road.X,Road.Y)+V->ExpectedRideHeight()*100+5;
    V->SetActorLocationAndRotation(Road,FRotator::ZeroRotator,false,nullptr,ETeleportType::TeleportPhysics);
    V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
    V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
    Next(17);
  }else if(Phase==17&&Time>.6f){
    Previous=V->GetActorLocation();Travel=0;V->TestBrake=0;V->TestThrottle=.55f;V->TestSteer=1;Next(3);
  }else if(Phase==3&&Time>4){
    Test(TEXT("largest-tire vehicle accelerates forward"),Travel>180,Travel);
    if(Model==10){const float ShaftError=FMath::Abs((V->WheelState[0].Omega+V->WheelState[1].Omega-V->WheelState[2].Omega-V->WheelState[3].Omega)*.5f);
      Test(TEXT("fixed transfer constrains real front and rear shaft speeds while turning"),V->HasRigidTransfer()&&ShaftError<.01f,ShaftError);}
    V->TestThrottle=V->TestBrake=0;
    MotionFinite=true;
    for(int I=0;I<V->WheelCount();++I){RollingDistance[I]=PatchDistance[I]=0;MotionFrames[I]=0;}
    Next(16);
  }else if(Phase==16&&Time>.15f){
    // Keep full steering, let acceleration slip settle and compare each
    // contacting tire against the direction and travel of its own patch.
    for(int I=0;I<V->WheelCount();++I){
      const auto& Wheel=V->WheelState[I];
      MotionFinite&=FMath::IsFinite(Wheel.Omega)&&FMath::IsFinite(Wheel.LongSpeed);
      if(!Wheel.ContactValid||Wheel.Load<=100||FMath::Abs(Wheel.LongSpeed)<.35f)continue;
      RollingDistance[I]+=Wheel.Omega*V->TireDiameter()*.0127f*FMath::Sign(Wheel.LongSpeed)*Dt;
      PatchDistance[I]+=FMath::Abs(Wheel.LongSpeed)*Dt;
      ++MotionFrames[I];
    }
    if(Time>.75f){
      bool Rolling=MotionFinite;
      float Roll=0,Patch=0;
      for(int Axle=0;Axle<V->AxleCount();++Axle){
        bool AxleSampled=false;
        for(int I=Axle*2;I<Axle*2+2;++I){
          UE_LOG(LogTemp,Display,TEXT("TERRA_ROLLING model=%d wheel=%d samples=%d signedRollM=%.3f patchTravelM=%.3f"),
            Model,I,MotionFrames[I],RollingDistance[I],PatchDistance[I]);
          if(MotionFrames[I]<3)continue;
          AxleSampled=true;
          const float Ratio=RollingDistance[I]/FMath::Max(.001f,PatchDistance[I]);
          Rolling&=Ratio>.25f&&Ratio<4.f;
          Roll+=RollingDistance[I];Patch+=PatchDistance[I];
        }
        Rolling&=AxleSampled;
      }
      Test(TEXT("moving tire spin follows travel"),Rolling,Roll/FMath::Max(.01f,Patch));
      V->TestBrake=1;V->TestSteer=0;Next(4);
    }
  }else if(Phase==4&&Time>5){
    Test(TEXT("service brake stops enlarged tires"),V->Chassis->GetPhysicsLinearVelocity().Size2D()<45,V->Chassis->GetPhysicsLinearVelocity().Size2D());
    V->TeleportRoute(5);V->GateIndex=2;V->RouteTime=38;Gate=V->GateIndex;Route=V->RouteIndex;
    // Recover the largest supported fitment on a known flat patch while retaining challenge progress.
    BeforeRecovery=V->Terrain->Spawns[1]+FVector(3000,0,0);BeforeRecovery.Z=V->Terrain->Height(BeforeRecovery.X,BeforeRecovery.Y)+200;
    V->SetActorLocationAndRotation(BeforeRecovery,FRotator(0,28,Model%2?180:90),false,nullptr,ETeleportType::TeleportPhysics);
    Energy=V->IsElectric()?V->BatterySOC:V->FuelFraction;Damage=V->Damage;
    Test(TEXT("local rollover recovery accepts current position"),V->RecoverInPlace());
    Test(TEXT("recovery keeps XY position and challenge progress"),FVector::Dist2D(V->GetActorLocation(),BeforeRecovery)<.1f&&V->RouteIndex==Route&&V->GateIndex==Gate&&V->RouteTime==38);
    Test(TEXT("recovery preserves damage and energy"),V->Damage==Damage&&FMath::IsNearlyEqual(V->IsElectric()?V->BatterySOC:V->FuelFraction,Energy));Next(5);
  }else if(Phase==5&&Time>2){
    Test(TEXT("recovered vehicle settles upright with support"),V->GetActorUpVector().Z>.85f&&V->ContactCount>=3,V->ContactCount);
    Capture(*FString::Printf(TEXT("expanded-recovered-%d.png"),Model));Next(6);
  }else if(Phase==6&&Time>.3f){
    if(Model==2||Model==10||Model==11){
      V->SetGarage(true);
      if(const auto Garage=V->GetGarageWidget())Garage->ShowUpgradePart(TerraSim::TireSize);
      Next(7);
    }else Next(8);
  }else if(Phase==7&&Time>.8f){
    const auto Garage=V->GetGarageWidget();
    GarageValid=TireUpgradeRowVisible(Garage)&&BeginTireGarage(V,Garage);
    Next(14);
  }else if(Phase==14&&Time>.15f){
    // Slate updates bound enabled states during its attribute pass.
    const int Largest=V->UpgradeMaxStage(TerraSim::TireSize);
    if(GarageValid&&Largest>0){
      const auto Diameter=V->GetGarageWidget()->TireDiameterButton(Largest);
      GarageValid=Diameter.IsValid()&&!Diameter->IsEnabled();
      V->SetUpgrade(TerraSim::Suspension,V->RequiredTireSuspensionStage(Largest),false);
    }
    Next(15);
  }else if(Phase==15&&Time>.15f){
    if(GarageValid){
      const auto Garage=V->GetGarageWidget();
      const int Largest=V->UpgradeMaxStage(TerraSim::TireSize);
      const auto Diameter=Garage->TireDiameterButton(Largest),Compound=Garage->TireCompoundButton(1);
      GarageValid=Diameter.IsValid()&&Diameter->IsEnabled()&&Compound.IsValid()&&Compound->IsEnabled();
      if(GarageValid){
        Diameter->SimulateClick();
        const float Fitted=V->TireDiameter();
        Compound->SimulateClick();
        GarageValid=V->UpgradeStage(TerraSim::TireSize)==Largest&&V->UpgradeStage(TerraSim::Tires)==1&&
          FMath::IsNearlyEqual(V->TireDiameter(),Fitted,.01f);
      }
    }
    Test(TEXT("unified tire card is visible and its diameter and compound buttons work independently"),GarageValid);
    Capture(*FString::Printf(TEXT("expanded-tire-garage-%d.png"),Model));Next(8);
  }else if(Phase==8&&Time>.3f){
    if(++Model>=ATerraVehicle::VehicleCount){
      const FString Path=FPaths::ProjectSavedDir()/TEXT("expanded-fixture-save.json");
      FString Json;TSharedPtr<FJsonObject> Save;const TArray<TSharedPtr<FJsonValue>>* Cars=nullptr;
      bool RoundTrip=V->SaveGarage(Path)&&FFileHelper::LoadFileToString(Json,*Path)&&
        FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Save)&&Save.IsValid()&&
        Save->GetIntegerField(TEXT("version"))==TerraSim::GarageSaveVersion&&
        Save->TryGetArrayField(TEXT("builds"),Cars)&&Cars->Num()==ATerraVehicle::VehicleCount&&V->LoadGarage(Path);
      if(RoundTrip)for(int I=0;I<ATerraVehicle::VehicleCount;++I){
        const auto& Slots=(*Cars)[I]->AsArray();
        RoundTrip&=Slots.Num()==TerraSim::PartCount&&Slots[TerraSim::TireSize]->AsNumber()==DiameterInches[I]&&
          V->Builds[I].Stage[TerraSim::TireSize]==DiameterStages[I];
      }
      Check(TEXT("version ten stores each fitted diameter in inches and restores its selection"),RoundTrip,ATerraVehicle::VehicleCount);
      return true;
    }
    V->SetGarage(true);Next(1);
  }
  return false;
}
}
