#include "TerraRutDriveValidation.h"
#include "TerraVehicle.h"
#include "TerraWorld.h"
#include "Math/RotationMatrix.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Engine/World.h"
#include "Engine/OverlapResult.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/HUD.h"
#include "CollisionShape.h"
#include "CollisionQueryParams.h"

namespace TerraRutDriveValidation {
namespace {
struct FPathPoint { FVector Soil,Hub;float ArcCM=0,ForwardCM=0; };
struct FWheelPath {
  TArray<FPathPoint> Points;
  int LoadedFrames=0;
  float MaxAnchorStepErrorM=0;
};
struct FDriveState {
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TWeakObjectPtr<ACameraActor> Camera;
  FWheelPath Wheel[4];
  int Trial=0,Phase=0,Frames=0;
  float Time=0,WheelbaseCM=300,TravelM=0,ForwardM=0,PeakForwardM=0,MaxRollbackM=0,PeakSpeed=0;
  bool Fixture=false,Finite=true;
  FVector Start=FVector::ZeroVector,Focus=FVector::ZeroVector,CloseFocus=FVector::ZeroVector;
  FVector Forward=FVector::ForwardVector,Side=FVector::RightVector;
};
FDriveState State;
const int Zones[]={3,7},Surfaces[]={2,6};
const TCHAR *Names[]={TEXT("actual mud"),TEXT("actual snow")};
const TCHAR *Oblique[]={TEXT("native-rut-driven-mud-oblique.png"),TEXT("native-rut-driven-snow-oblique.png")};
const TCHAR *Close[]={TEXT("native-rut-driven-mud-profile.png"),TEXT("native-rut-driven-snow-profile.png")};

bool GentlePure(ATerraWorld *T,FVector P,int Trial) {
  const auto S=T->Sample(P);const auto B=T->SurfaceBlend(P.X,P.Y);
  return S.Surface==Surfaces[Trial]&&B.Weight[Surfaces[Trial]]>.97f&&
      S.Normal.Z>.985f&&FMath::IsFinite(S.Height)&&S.MaxSink>.03f;
}
bool OpenCorridor(ATerraVehicle *V,FVector P) {
  // Test above the ground, where the actual body will travel. Grass has no
  // rigid collision; signs, trees and boulders must not obstruct this trial.
  FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraRutDriveCorridor),false,V);
  TArray<FOverlapResult> Overlaps;
  for(int Along=-100;Along<=1100;Along+=200) {
    FVector Q=P+FVector(Along,0,0);Q.Z=V->Terrain->Height(Q.X,Q.Y)+115;
    Overlaps.Reset();
    if(V->GetWorld()->OverlapMultiByChannel(Overlaps,Q,FQuat::Identity,ECC_WorldStatic,
        FCollisionShape::MakeBox(FVector(120,110,90)),Params))return false;
  }
  return true;
}
FVector Along(const FWheelPath &Path,float ForwardCM) {
  if(Path.Points.IsEmpty())return FVector::ZeroVector;
  for(int I=1;I<Path.Points.Num();++I)if(Path.Points[I].ForwardCM>=ForwardCM&&Path.Points[I-1].ForwardCM<=ForwardCM) {
    const auto &A=Path.Points[I-1];const auto &B=Path.Points[I];
    return FMath::Lerp(A.Soil,B.Soil,FMath::Clamp((ForwardCM-A.ForwardCM)/FMath::Max(.001f,B.ForwardCM-A.ForwardCM),0.f,1.f));
  }
  return Path.Points.Last().Soil;
}
void Frame(ATerraVehicle *V,bool CloseView) {
  if(!State.Camera.IsValid())State.Camera=V->GetWorld()->SpawnActor<ACameraActor>();
  FVector Focus=CloseView?State.CloseFocus:State.Focus;
  Focus.Z=V->Terrain->Height(Focus.X,Focus.Y);
  // Actual trial terrain is unobstructed along the driving corridor, but a
  // tree outside it can still hide a trail camera. Prefer a clear side of
  // the same real path; never relocate the vehicle or the deformation.
  Focus.Z+=8;
  FVector Eye=Focus-State.Forward*(CloseView?130:440)-State.Side*(CloseView?155:420)+FVector(0,0,CloseView?95:285);
  FCollisionQueryParams Params(SCENE_QUERY_STAT(TerraRutDrivePhoto),true,V);
  bool Clear=false;
  for(float ExtraHeight:{0.f,100.f,220.f}) {
    for(float AlongSign:{-1.f,1.f}) {
      for(float SideSign:{-1.f,1.f}) {
        const FVector Candidate=Focus+State.Forward*(AlongSign*(CloseView?130:440))+
            State.Side*(SideSign*(CloseView?155:420))+FVector(0,0,(CloseView?95:285)+ExtraHeight);
        bool Visible=true;
        for(float Offset:{-60.f,0.f,60.f}) {
          FHitResult Hit;const FVector Target=Focus+State.Forward*Offset;
          if(V->GetWorld()->LineTraceSingleByChannel(Hit,Candidate,Target,ECC_Visibility,Params)&&
              FVector::Dist(Hit.ImpactPoint,Target)>12){Visible=false;break;}
        }
        if(Visible){Eye=Candidate;Clear=true;break;}
      }
      if(Clear)break;
    }
    if(Clear)break;
  }
  State.Camera->SetActorLocationAndRotation(Eye,(Focus-Eye).Rotation());
  State.Camera->GetCameraComponent()->SetFieldOfView(CloseView?54:60);
  UE_LOG(LogTemp,Display,TEXT("TERRA_RUT_DRIVE_CAMERA trial=%s close=%d clear=%d eye=%s focus=%s"),Names[State.Trial],CloseView,Clear,*Eye.ToString(),*Focus.ToString());
  if(auto *PC=Cast<APlayerController>(V->GetController())) {
    PC->SetViewTarget(State.Camera.Get());if(auto *HUD=PC->GetHUD())HUD->bShowHUD=false;
  }
}
void Place(ATerraVehicle *V) {
  auto *T=V->Terrain.Get();
  V->SelectVehicle(0);V->ResetUpgrades(false);V->SetGarage(false);
  V->TestDriverInput=false;V->TestForward=V->TestReverse=V->TestStop=false;
  V->TestThrottle=V->TestSteer=0;V->TestBrake=1;
  V->TeleportZone(Zones[State.Trial]);T->ResetSoil();
  V->FourDrive=V->LowRange=V->FrontLocked=V->RearLocked=true;
  V->Pressure=24;V->Direction=1;V->Gear=0;
  State.WheelbaseCM=T->Data->GetArrayField(TEXT("vehicles"))[0]->AsObject()->GetNumberField(TEXT("wheelbase"))*100;
  State.Frames=0;State.Finite=true;State.TravelM=State.ForwardM=State.PeakForwardM=State.MaxRollbackM=State.PeakSpeed=0;
  for(auto &Wheel:State.Wheel)Wheel=FWheelPath();
  const FVector Origin=T->Spawns[Zones[State.Trial]]-FVector(600,600,0);
  FVector Best=Origin;float CostBest=FLT_MAX;State.Fixture=false;
  for(int X=-28;X<=28;++X)for(int Y=-28;Y<=28;++Y) {
    const float Cost=X*X+Y*Y;if(Cost>=CostBest)continue;
    const FVector P=Origin+FVector(X*200,Y*200,0);bool Valid=true;
    for(int Along=-250;Along<=1350&&Valid;Along+=100)for(float Across:{-155.f,0.f,155.f})
      if(!GentlePure(T,P+FVector(Along,Across,0),State.Trial)){Valid=false;break;}
    if(Valid&&FMath::Abs(T->Height(P.X+1200,P.Y)-T->Height(P.X,P.Y))<80&&OpenCorridor(V,P)) {
      CostBest=Cost;Best=P;State.Fixture=true;
    }
  }
  Best.Z=T->Height(Best.X,Best.Y)+V->ExpectedRideHeight()*100+12;
  const FRotator Rotation=FRotationMatrix::MakeFromXZ(FVector::ForwardVector,T->Sample(Best).Normal).Rotator();
  // Pose and velocity initialization ends here. The settle/drive/brake phases
  // below never teleport, reset velocity, or synthesize deformation stamps.
  V->SetActorLocationAndRotation(Best,Rotation,false,nullptr,ETeleportType::TeleportPhysics);
  V->Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
  V->Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
  State.Start=Best;State.Focus=State.CloseFocus=Best;State.Forward=FVector::ForwardVector;State.Side=FVector::RightVector;
  State.Time=0;State.Phase=1;
  UE_LOG(LogTemp,Display,TEXT("TERRA_RUT_DRIVE_START trial=%s pure=%d origin=%s wheelbaseCM=%.3f throttle=.20 pressurePSI=24 low=1 frontLock=1 rearLock=1"),Names[State.Trial],State.Fixture,*Best.ToString(),State.WheelbaseCM);
}
void Record(ATerraVehicle *V) {
  ++State.Frames;
  State.Finite&=!V->GetActorLocation().ContainsNaN()&&FMath::IsFinite(V->Speed);
  State.PeakSpeed=FMath::Max(State.PeakSpeed,FMath::Abs(V->Speed));
  for(int I=0;I<4;++I) {
    const auto &W=V->WheelState[I];auto &Path=State.Wheel[I];
    State.Finite&=FMath::IsFinite(W.Load)&&FMath::IsFinite(W.Distance)&&!W.Center.ContainsNaN()&&
        !W.Contact.ContainsNaN()&&!W.Ground.Normal.ContainsNaN();
    if(!W.ContactValid||W.Constructed||W.Load<=500||!W.SoilConnected)continue;
    ++Path.LoadedFrames;
    if(W.LastSoil.ContainsNaN()){State.Finite=false;continue;}
    float Arc=0,Forward=0;
    if(!Path.Points.IsEmpty()) {
      const auto &Previous=Path.Points.Last();const float Travel=FVector::Dist2D(Previous.Soil,W.LastSoil);
      const float HubTravel=FVector::Dist2D(Previous.Hub,W.Center);
      Path.MaxAnchorStepErrorM=FMath::Max(Path.MaxAnchorStepErrorM,FMath::Abs(Travel-HubTravel)/100);
      if(Travel<.10f)continue;
      Arc=Previous.ArcCM+Travel;
      Forward=FVector::DotProduct(W.LastSoil-Path.Points[0].Soil,State.Forward);
    }
    Path.Points.Add({W.LastSoil,W.Center,Arc,Forward});
  }
}
void Evaluate(ATerraVehicle *V,TFunctionRef<void(const FString&,bool,float)> Check) {
  auto *T=V->Terrain.Get();auto Add=[&](const TCHAR *Name,bool Pass,float Value=0.f) {
    Check(FString(Names[State.Trial])+TEXT(" ")+Name,Pass,Value);
  };
  const float ExcludeCM=State.WheelbaseCM+50;
  bool Finite=State.Finite,DepthBounded=true,Matching=true;
  float MinLoadedFraction=1,MaxAnchorError=0,MinimumCoverage=1;
  float MaxDepth=0,MaxSink=0,MaxLocalSinkExcess=0,AllPathBerm=0,MaxStep=0,MaxCurvature=0,PeakBerm=0,MaxCrossSlope=0,FarEdge=0;
  int ProfileSamples=0,EligiblePaths=0;
  for(const auto &Path:State.Wheel) {
    MinLoadedFraction=FMath::Min(MinLoadedFraction,float(Path.LoadedFrames)/FMath::Max(1,State.Frames));
    MaxAnchorError=FMath::Max(MaxAnchorError,Path.MaxAnchorStepErrorM);
    for(const auto &Point:Path.Points) {
      const auto S=T->Sample(Point.Soil);
      Finite&=FMath::IsFinite(S.RutDepth)&&FMath::IsFinite(S.Displacement)&&FMath::IsFinite(S.MaxSink)&&!S.Normal.ContainsNaN();
      DepthBounded&=S.RutDepth>=0&&S.RutDepth<=S.MaxSink+.003f;
      MaxDepth=FMath::Max(MaxDepth,S.RutDepth);MaxSink=FMath::Max(MaxSink,S.MaxSink);
      MaxLocalSinkExcess=FMath::Max(MaxLocalSinkExcess,S.RutDepth-S.MaxSink);
      for(float Offset:{-50.f,-35.f,35.f,50.f})AllPathBerm=FMath::Max(AllPathBerm,T->Sample(Point.Soil+State.Side*Offset).Displacement);
    }
  }
  FVector FocusSum=FVector::ZeroVector;
  for(int Wheel=2;Wheel<4;++Wheel) {
    const auto &Path=State.Wheel[Wheel];
    const float End=Path.Points.IsEmpty()?0:Path.Points.Last().ForwardCM-50;
    bool Ordered=true,Entered=false;float PreviousForward=0,HighWater=0,MaxReverseCM=0;
    for(const auto &Point:Path.Points) {
      if(Point.ForwardCM>=ExcludeCM||Entered) {
        if(Entered&&(Point.ForwardCM<=End||PreviousForward<=End)) {
          MaxReverseCM=FMath::Max(MaxReverseCM,PreviousForward-Point.ForwardCM);
          // Up to one tenth of the 6.25 cm sampling interval is harmless
          // numerical/contact jitter. A folded-back driven path is rejected
          // as a whole, rather than selecting its convenient forward visits.
          Ordered&=PreviousForward-Point.ForwardCM<=.625f&&HighWater-Point.ForwardCM<=6.25f;
        }
        Entered=true;HighWater=FMath::Max(HighWater,Point.ForwardCM);
      }
      PreviousForward=Point.ForwardCM;
    }
    int Samples=0,Depressed=0;float Previous=0,PreviousStep=0;
    for(float Arc=ExcludeCM;Ordered&&Arc<=End;Arc+=6.25f) {
      const FVector P=Along(Path,Arc);const auto S=T->Sample(P);const auto Blend=T->SurfaceBlend(P.X,P.Y);
      Matching&=S.Surface==Surfaces[State.Trial]&&Blend.Weight[Surfaces[State.Trial]]>.97f;
      Finite&=FMath::IsFinite(S.Displacement)&&FMath::IsFinite(S.RutDepth);
      if(S.RutDepth>.003f)++Depressed;
      if(Samples>0) {
        const float Step=S.Displacement-Previous;MaxStep=FMath::Max(MaxStep,FMath::Abs(Step));
        if(Samples>1)MaxCurvature=FMath::Max(MaxCurvature,FMath::Abs(Step-PreviousStep));PreviousStep=Step;
      }
      Previous=S.Displacement;++Samples;++ProfileSamples;
    }
    if(Samples>=24) {
      ++EligiblePaths;MinimumCoverage=FMath::Min(MinimumCoverage,float(Depressed)/Samples);
      const float Middle=(ExcludeCM+End)*.5f;FocusSum+=Along(Path,Middle);
      if(Wheel==2)State.CloseFocus=Along(Path,Middle);
      for(float Fraction:{.25f,.50f,.75f}) {
        const FVector P=Along(Path,FMath::Lerp(ExcludeCM,End,Fraction));float CrossPrevious=0;bool First=true;
        for(int I=-12;I<=12;++I) {
          const auto S=T->Sample(P+State.Side*(I*6.25f));
          Finite&=FMath::IsFinite(S.Displacement);
          PeakBerm=FMath::Max(PeakBerm,S.Displacement);
          if(!First)MaxCrossSlope=FMath::Max(MaxCrossSlope,FMath::Abs(S.Displacement-CrossPrevious)/.0625f);
          First=false;CrossPrevious=S.Displacement;
        }
        for(float Offset:{-90.f,90.f})FarEdge=FMath::Max(FarEdge,FMath::Abs(T->Sample(P+State.Side*Offset).Displacement));
      }
    }else MinimumCoverage=0;
    UE_LOG(LogTemp,Display,TEXT("TERRA_RUT_DRIVE_PATH trial=%s wheel=%d points=%d loadedFrames=%d allFrames=%d arcM=%.4f forwardM=%.4f fromM=%.4f endM=%.4f ordered=%d reverseStepM=%.5f profileSamples=%d coverage=%.4f anchorStepErrorM=%.5f"),
        Names[State.Trial],Wheel,Path.Points.Num(),Path.LoadedFrames,State.Frames,Path.Points.IsEmpty()?0:Path.Points.Last().ArcCM/100,
        Path.Points.IsEmpty()?0:Path.Points.Last().ForwardCM/100,ExcludeCM/100,End/100,Ordered,MaxReverseCM/100,
        Samples,Samples?float(Depressed)/Samples:0,Path.MaxAnchorStepErrorM);
  }
  if(EligiblePaths==2)State.Focus=FocusSum*.5f;
  else {State.Focus=(State.Start+V->GetActorLocation())*.5f;State.CloseFocus=State.Focus+State.Side*80;}
  State.Focus.Z=T->Height(State.Focus.X,State.Focus.Y);
  const double Error=FMath::Abs(T->DepressedVolume-T->DisplacedVolume-T->CompactedVolume);
  Add(TEXT("stock Jeep trial uses pure gentle unobstructed terrain"),State.Fixture&&Matching);
  Add(TEXT("motor drive advances at least six forward metres without intervention"),State.ForwardM>=6&&State.MaxRollbackM<.25f&&State.PeakSpeed>.2f&&FMath::Abs(V->Speed)<.4f,State.ForwardM);
  Add(TEXT("loaded wheel footprints follow finite supported tire centres"),Finite&&MinLoadedFraction>.90f&&MaxAnchorError<.10f&&V->ObjectBodyHits==0,MaxAnchorError);
  Add(TEXT("physical rut depth stays within the configured surface sink limit"),Finite&&DepthBounded&&MaxDepth>.003f,MaxDepth);
  Add(TEXT("both rear tire trails retain continuous real-drive depression"),EligiblePaths==2&&ProfileSamples>=48&&MinimumCoverage>.90f,MinimumCoverage);
  Add(TEXT("real rolling trail has no alternating crater teeth"),EligiblePaths==2&&Finite&&MaxStep<=.030f&&MaxCurvature<=.030f,MaxStep);
  Add(TEXT("real rolling banks have bounded drivable cross profiles"),EligiblePaths==2&&Finite&&PeakBerm>.002f&&PeakBerm<.1016f&&MaxCrossSlope<2.2f&&FarEdge<.003f,PeakBerm);
  Add(TEXT("real driven excavation equals side banks plus compaction"),FMath::IsFinite(Error)&&Error<.00001&&T->DepressedVolume>.001&&T->DisplacedVolume>0&&T->CompactedVolume>0,float(Error));
  UE_LOG(LogTemp,Display,TEXT("TERRA_RUT_DRIVE_RESULT trial=%s travelM=%.4f forwardM=%.4f peakForwardM=%.4f rollbackM=%.5f peakMPS=%.4f endMPS=%.4f frames=%d loadedFraction=%.4f paths=%d samples=%d coverage=%.4f depthM=%.5f maxSinkM=%.4f localSinkExcessM=%.5f allPathBermM=%.5f stepM=%.5f curvatureM=%.5f bermM=%.5f wallSlope=%.5f farEdgeM=%.5f terrainHits=%d objectHits=%d removedM3=%.7f displacedM3=%.7f compactedM3=%.7f errorM3=%.9f"),
      Names[State.Trial],State.TravelM,State.ForwardM,State.PeakForwardM,State.MaxRollbackM,State.PeakSpeed,V->Speed,State.Frames,MinLoadedFraction,EligiblePaths,ProfileSamples,MinimumCoverage,
      MaxDepth,MaxSink,MaxLocalSinkExcess,AllPathBerm,MaxStep,MaxCurvature,PeakBerm,MaxCrossSlope,FarEdge,V->TerrainBodyHits,V->ObjectBodyHits,
      T->DepressedVolume,T->DisplacedVolume,T->CompactedVolume,Error);
}
}
bool Tick(ATerraVehicle *V,float Dt,TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture) {
  if(!V||!V->Initialized||!V->Terrain||!V->Terrain->Ready)return false;
  if(State.Vehicle.Get()!=V){State=FDriveState();State.Vehicle=V;}
  // Match the vehicle's existing simulation-time cap. A streaming/search
  // hitch must not count as two seconds of settled physical contact.
  State.Time+=FMath::Min(Dt,.1f);
  if(State.Phase==0){Place(V);return false;}
  if(State.Phase==1&&State.Time>=2) {
    State.Start=V->GetActorLocation();State.Forward=V->GetActorForwardVector();State.Forward.Z=0;State.Forward.Normalize();
    State.Side=FVector(-State.Forward.Y,State.Forward.X,0);V->ResetContactTelemetry();
    V->TestBrake=0;V->TestThrottle=.20f;State.Time=0;State.Phase=2;return false;
  }
  if(State.Phase==2) {
    Record(V);State.TravelM=FVector::Dist2D(State.Start,V->GetActorLocation())/100;
    State.ForwardM=FVector::DotProduct(V->GetActorLocation()-State.Start,State.Forward)/100;
    State.PeakForwardM=FMath::Max(State.PeakForwardM,State.ForwardM);
    State.MaxRollbackM=FMath::Max(State.MaxRollbackM,State.PeakForwardM-State.ForwardM);
    if(State.Time>=16||State.TravelM>=10) {V->TestThrottle=0;V->TestBrake=1;State.Time=0;State.Phase=3;}
    return false;
  }
  if(State.Phase==3&&State.Time>=1.2f) {
    Evaluate(V,Check);Frame(V,false);State.Time=0;State.Phase=4;return false;
  }
  if(State.Phase==4&&State.Time>=.8f){Capture(Oblique[State.Trial]);State.Time=0;State.Phase=5;return false;}
  // Screenshot requests render later in this tick; never move that camera in
  // the same frame as a capture request.
  if(State.Phase==5&&State.Time>=.2f){Frame(V,true);State.Time=0;State.Phase=6;return false;}
  if(State.Phase==6&&State.Time>=.8f){Capture(Close[State.Trial]);State.Time=0;State.Phase=7;return false;}
  if(State.Phase==7&&State.Time>=.2f) {
    if(++State.Trial<2){State.Phase=0;State.Time=0;return false;}
    if(auto *PC=Cast<APlayerController>(V->GetController()))PC->SetViewTarget(V);
    if(State.Camera.IsValid())State.Camera->Destroy();State.Camera.Reset();State.Phase=99;
  }
  return State.Phase==99;
}
}
