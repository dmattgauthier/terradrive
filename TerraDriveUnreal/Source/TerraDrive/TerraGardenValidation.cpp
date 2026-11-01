#include "TerraGardenValidation.h"
#include "TerraVehicle.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"
#include "Engine/World.h"
#include "Components/PrimitiveComponent.h"
#include "CollisionQueryParams.h"
namespace TerraGardenValidation {
namespace {struct FState{TWeakObjectPtr<ATerraVehicle> V;TWeakObjectPtr<ACameraActor> Camera;int View=0;float Time=0;bool Placed=false;}S;}
bool Tick(ATerraVehicle* V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,TFunctionRef<void(const TCHAR*)> Capture){
 const FVector XY[]={{11800,-13500,90},{15600,-8800,80},{14300,-14500,110},{9900,-9100,60},{10200,-11200,70}};
 const FVector Offset[]={{-900,1050,650},{-760,-650,490},{950,640,480},{-420,390,250},{-1150,650,610}};
 const TCHAR* Names[]={TEXT("garden-main-outcrop"),TEXT("garden-detached-blocks"),TEXT("garden-ledge-silhouette"),TEXT("garden-stone-close"),TEXT("garden-articulation-line")};
 if(S.V.Get()!=V){S=FState();S.V=V;V->SetGarage(false);V->TestBrake=1;V->TestThrottle=V->TestSteer=0;V->SetActorTickEnabled(false);S.Camera=V->GetWorld()->SpawnActor<ACameraActor>();if(auto* PC=Cast<APlayerController>(V->GetController())){PC->SetViewTarget(S.Camera.Get());if(PC->GetHUD())PC->GetHUD()->bShowHUD=false;}}
 if(S.View>=5){V->SetActorTickEnabled(true);return true;}
 const auto P=XY[S.View];const float H=V->Terrain->Height(P.X,P.Y);FVector Target(P.X,P.Y,H+P.Z);
 if(!S.Placed){S.Camera->SetActorLocationAndRotation(Target+Offset[S.View],(Target-(Target+Offset[S.View])).Rotation());S.Camera->GetCameraComponent()->SetFieldOfView(55);S.Time=0;S.Placed=true;}
 S.Time+=Dt;if(S.Time<1.5f)return false;
 int Hits=0;float Error=0;
 FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraGardenSurface),true,V);
 TInlineComponentArray<UPrimitiveComponent*> Ground;V->Terrain->GetComponents(Ground);
 Ground.RemoveAll([](UPrimitiveComponent* Component){return !IsValid(Component)||!Component->IsRegistered()||
  !Component->ComponentHasTag(TEXT("TerraGround"))||Component->GetCollisionEnabled()==ECollisionEnabled::NoCollision;});
 for(int X=-2;X<=2;++X)for(int Y=-2;Y<=2;++Y){const FVector Q(P.X+X*85,P.Y+Y*85,0);const float Floor=V->Terrain->Height(Q.X,Q.Y);
  bool Hit=false;float SurfaceZ=-FLT_MAX;
  // Query the real ground bodies directly: a separately placed boulder must
  // neither hide missing terrain nor prevent testing the surface below it.
  for(auto* Component:Ground){const FBox Bounds=Component->Bounds.GetBox();
   if(Q.X<Bounds.Min.X||Q.X>Bounds.Max.X||Q.Y<Bounds.Min.Y||Q.Y>Bounds.Max.Y)continue;
   FHitResult Result;if(Component->LineTraceComponent(Result,FVector(Q.X,Q.Y,Floor+500),FVector(Q.X,Q.Y,Floor-100),Params)){
    SurfaceZ=FMath::Max(SurfaceZ,float(Result.ImpactPoint.Z));Hit=true;}}
  if(Hit){++Hits;Error=FMath::Max(Error,FMath::Abs(SurfaceZ-Floor));}}
 UE_LOG(LogTemp,Display,TEXT("TERRA_GARDEN_SURFACE view=%s hits=%d/25 maximumHeightErrorCM=%.6f"),Names[S.View],Hits,Error);
 Check(FString(Names[S.View])+TEXT(" detailed source loaded and all25 terrain collision samples match height sampling"),V->Terrain->HasGardenGeology()&&Hits==25&&Error<.5f,Error);
 Check(FString(Names[S.View])+TEXT(" camera remains above actual terrain"),S.Camera->GetActorLocation().Z>V->Terrain->Height(S.Camera->GetActorLocation().X,S.Camera->GetActorLocation().Y)+30,S.Camera->GetActorLocation().Z-H);
 Capture(*(FString(Names[S.View])+TEXT(".png")));++S.View;S.Placed=false;return false;
}
}
