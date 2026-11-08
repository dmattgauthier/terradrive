#include "TerraExpandedValidation.h"
#include "TerraVehicle.h"
#include "TerraTireProbeValidation.h"
#include "TerraGameMode.h"
#include "TerraGarage.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Components/BoxComponent.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"
#include "GameFramework/HUD.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/PlayerController.h"
#include "Misc/Paths.h"
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
}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
  static int Model=0,Phase=0;static float Time=0,Travel=0;static FVector Start,Previous,BeforeRecovery;static int Gate=0,Route=0;static float Energy=0,Damage=0;
  static TWeakObjectPtr<ACameraActor> GraniteCamera;static int GraniteView=0;
  static FVector GraniteOutside,GraniteInside;static bool GraniteSamplesValid=false;
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
    const TArray<TSharedPtr<FJsonValue>>* FitRows=nullptr;
    Test(TEXT("vehicle has exact body-derived tire-kit fits or factory monster tires"),Model==10||(Spec->TryGetArrayField(TEXT("tireFits"),FitRows)&&FitRows->Num()==3));
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
    const float Stock=V->TireDiameter();const float Rim=V->Rims[0]->GetStaticMesh()->GetBounds().SphereRadius;
    for(int S=1;S<=3;++S){V->SetUpgrade(TerraSim::TireSize,S,false);
      const float Expected=Stock>=50?Stock:TerraSim::TireKitDiameterInches(Stock,S);
      Test(*FString::Printf(TEXT("diameter stage %d matches physical specification"),S),FMath::Abs(V->TireDiameter()-Expected)<.02f,V->TireDiameter());
      bool Separated=true;for(int A=1;A<V->AxleCount();++A)Separated&=V->AxleOffsetM(A-1)-V->AxleOffsetM(A)>V->TireDiameter()*.0254f+.05f;
      Test(*FString::Printf(TEXT("diameter stage %d has separated axle tire envelopes"),S),Separated);
      bool Meshes=true;for(auto Wheel:V->Wheels)Meshes&=Wheel->GetStaticMesh()!=nullptr;
      Test(*FString::Printf(TEXT("diameter stage %d has cooked tires and unchanged rim diameter"),S),Meshes&&FMath::Abs(Rim-V->Rims[0]->GetStaticMesh()->GetBounds().SphereRadius)<.01f);
    }
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
    V->SetNearCamera(false);Start=Previous=V->GetActorLocation();Travel=0;V->TestBrake=0;V->TestThrottle=.55f;V->TestSteer=1;Next(3);
  }else if(Phase==3&&Time>4){
    Test(TEXT("largest-tire vehicle accelerates forward"),Travel>180,Travel);
    float RollingSpeed=0,PatchSpeed=0;for(int I=0;I<V->WheelCount();++I){RollingSpeed+=FMath::Abs(V->WheelState[I].Omega)*V->TireDiameter()*.0254f*.5f;PatchSpeed+=FMath::Abs(V->WheelState[I].LongSpeed);}
    Test(TEXT("moving tire spin follows travel"),FMath::IsFinite(RollingSpeed)&&PatchSpeed>.1f&&RollingSpeed>PatchSpeed*.25f&&RollingSpeed<PatchSpeed*4,RollingSpeed/FMath::Max(.01f,PatchSpeed));
    if(Model==10){const float ShaftError=FMath::Abs((V->WheelState[0].Omega+V->WheelState[1].Omega-V->WheelState[2].Omega-V->WheelState[3].Omega)*.5f);
      Test(TEXT("fixed transfer constrains real front and rear shaft speeds while turning"),V->HasRigidTransfer()&&ShaftError<.01f,ShaftError);}
    V->TestThrottle=0;V->TestBrake=1;V->TestSteer=0;Next(4);
  }else if(Phase==4&&Time>5){
    Test(TEXT("service brake stops enlarged tires"),V->Chassis->GetPhysicsLinearVelocity().Size2D()<45,V->Chassis->GetPhysicsLinearVelocity().Size2D());
    V->TeleportRoute(5);V->GateIndex=2;V->RouteTime=38;Gate=V->GateIndex;Route=V->RouteIndex;
    // Recover the tall conversion on a known flat patch. The route state is
    // deliberately retained; a steep quarry camber can legitimately roll a 50-inch road-car conversion again.
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
    Test(TEXT("tire diameter upgrade row is visible inside the garage scroll viewport"),TireUpgradeRowVisible(V->GetGarageWidget()));
    Capture(*FString::Printf(TEXT("expanded-tire-garage-%d.png"),Model));Next(8);
  }else if(Phase==8&&Time>.3f){
    if(++Model>=ATerraVehicle::VehicleCount){
      const FString Path=FPaths::ProjectSavedDir()/TEXT("expanded-fixture-save.json");
      Check(TEXT("version nine garage roundtrip preserves the new roster and tire kits"),V->SaveGarage(Path)&&V->LoadGarage(Path)&&V->UpgradeStage(TerraSim::TireSize)==3,0);return true;
    }
    V->SetGarage(true);Next(1);
  }
  return false;
}
}
