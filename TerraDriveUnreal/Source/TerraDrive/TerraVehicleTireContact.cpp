#include "TerraVehicle.h"
#include "TerraTireProbeValidation.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "Dom/JsonObject.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "PhysicsEngine/BodyInstance.h"
#include "ProfilingDebugging/CpuProfilerTrace.h"

namespace {
// A tire is a rounded finite carcass, not a sphere or a box. The support
// point is analytic on its revolved profile; spinning tread need not recook
// or move any welded collision shapes.
FVector CarcassSupport(const FVector& Center,const FVector& Axis,const FVector& Forward,
    const FVector& Normal,const TArray<FVector2D>& Profile,float End) {
  const float Axial=FVector::DotProduct(Normal,Axis);
  const FVector RadialNormal=Normal-Axis*Axial;
  const float RadialLength=RadialNormal.Size();
  // A sidewall normal parallel to the axle has a whole support ring.
  // Span its radial height: the two axle centers already span fore/aft.
  const FVector Direction=RadialLength>.01f?RadialNormal/RadialLength:FVector::CrossProduct(Axis,Forward).GetSafeNormal()*End;
  float Best=-1;FVector Point=Center;
  for(const auto& Ring:Profile){
    const float Support=RadialLength*Ring.X+FMath::Abs(Axial)*Ring.Y;
    if(Support>Best){Best=Support;Point=Center-Direction*Ring.X-Axis*(FMath::Sign(Axial)*Ring.Y);}
  }
  return Point;
}
struct FCarcassContact {
  FVector Point,Normal;
  float Clearance=0,Friction=.8f,Impulse=0;
  bool Natural=false,VirtualBody=false;
  FVector TangentImpulse=FVector::ZeroVector;
};
}

// These are real Chaos manifold witnesses, used only to predict the body
// reaction while solving tire impulses. Chaos still supplies the actual
// coachwork response; no second body force is submitted by this solver.
void ATerraVehicle::CacheRolledBodyContact(UPrimitiveComponent* Other,const FHitResult& Hit) {
  if(!Other||Garage||Tracks||GetActorUpVector().Z>.65f||Other->IsSimulatingPhysics()||
      Other->GetComponentVelocity().SizeSquared()>1.f||Hit.ImpactPoint.ContainsNaN()||Hit.ImpactNormal.ContainsNaN())return;
  const FVector Normal=Hit.ImpactNormal.GetSafeNormal();
  if(Normal.Z<.2f||FVector::DotProduct(GetActorUpVector(),Normal)>.5f)return;
  const auto& SurfaceTransform=Other->GetComponentTransform();
  FTerraRolledBodySupport Contact;
  Contact.BodyLocalPoint=GetActorTransform().InverseTransformPosition(Hit.ImpactPoint);
  Contact.SurfaceLocalPoint=SurfaceTransform.InverseTransformPosition(Hit.ImpactPoint);
  Contact.SurfaceLocalNormal=SurfaceTransform.InverseTransformVectorNoScale(Normal);
  Contact.Surface=Other;Contact.Time=GetWorld()->GetTimeSeconds();
  for(auto& Prior:RolledBodySupports)if(Prior.Surface==Other&&FVector::DistSquared(Prior.BodyLocalPoint,Contact.BodyLocalPoint)<FMath::Square(20.f)){
    Prior=Contact;return;
  }
  if(RolledBodySupports.Num()<4)RolledBodySupports.Add(Contact);
  else {int Oldest=0;for(int I=1;I<RolledBodySupports.Num();++I)if(RolledBodySupports[I].Time<RolledBodySupports[Oldest].Time)Oldest=I;
    RolledBodySupports[Oldest]=Contact;}
}

void ATerraVehicle::RolledTireProfile(int Wheel,TArray<FVector2D>& Profile) const {
  Profile.Reset();
  FString Size;Spec->TryGetStringField(TEXT("tireSize"),Size);
  const int RimAt=Size.Find(TEXT("R"));
  const float RimInches=Number(TEXT("rimDiameterInches"),RimAt>=0?FCString::Atof(*Size.Mid(RimAt+1)):18.f);
  const float Stock=Number(TEXT("tireRadius"),.42f),Rim=RimInches*.0254f*.5f;
  const float W=(Wheel<2?Number(TEXT("tireWidth"),.285f):Number(TEXT("rearTireWidth"),Number(TEXT("tireWidth"),.285f)))*Tuning.TireWidth;
  const bool Monster=Number(TEXT("monsterTruck"),0)>0;
  const bool Resized=UpgradeStage(TerraSim::TireSize)>0&&Stock*200/2.54f<50;
  auto Ring=[&](float R,float HalfWidth){
    // The large-tire mesh preserves its rim/bead. Uniformly scaling its
    // shoulder radius would leave a visible gap during a side rollover.
    const float Bead=Rim*.97f;
    if(Resized&&R>Bead)R=Bead+(R-Bead)*(Radius-Bead)/FMath::Max(.001f,Stock-Bead);
    else if(!Resized)R*=TireVisualScale;
    Profile.Emplace(R*100,HalfWidth*W*100);
  };
  if(Monster){
    Ring(Rim*.97f,.41f);Ring(Rim*1.10f,.46f);Ring(Stock*.68f,.51f);
    Ring(Stock*.85f,.52f);Ring(Stock*.94f,.47f);Ring(Stock-.042f,.35f);
    // Chevron crown/shoulder extremities, including the raised shoulder lug.
    Ring(Stock,0);Ring(Stock-.011f,.45f);
    const float BarWidth=.012f/Number(TEXT("tireWidth"),1.0922f);
    Ring(Stock*.86f+.012f,.50f+BarWidth);Ring(Stock*.94f+.012f,.47f+BarWidth);
  }else{
    FString Type;Spec->TryGetStringField(TEXT("tireType"),Type);
    const float Depth=Type==TEXT("mud-terrain")?.018f:Type==TEXT("all-terrain")?.011f:
      Type==TEXT("road-performance")?.006f:Type==TEXT("highway-commercial")?.008f:.007f;
    auto Skin=[&](float R,float Y){Ring(R-Depth*FMath::SmoothStep(.82f,1.f,R/Stock),Y);};
    Skin(Rim*.97f,.425f);Skin(Rim*1.045f,.447f);Skin(FMath::Lerp(Rim*1.045f,Stock,.45f),.495f);
    Skin(Stock*.880f,.516f);Skin(Stock*.947f,.484f);Skin(Stock*.982f,.413f);
    Ring(Stock,.31f);Ring(Stock,0);
    if(Type==TEXT("mud-terrain")||Type==TEXT("all-terrain")){
      // Authored raised shoulder bars remain outside the smooth carcass.
      // Their original geometry is bead-remapped with the rest of a tire kit.
      const float BarRadius=Type==TEXT("mud-terrain")?.004f:.0025f;
      Ring(Stock*.954f+BarRadius,.503f+BarRadius/Number(TEXT("tireWidth"),.285f));
    }
  }
}

void ATerraVehicle::UpdateRolledTireContacts(float Dt) {
  TRACE_CPUPROFILER_EVENT_SCOPE(TerraRolledTireContact);
  RolledTireCandidates=RolledTireTraces=RolledTireContacts=0;RolledTireImpulseNS=0;
  if(!Terrain||Tracks||Garage||Dt<=0||GetActorUpVector().Z>.65f){RolledBodySupports.Reset();return;}
  // Dedicated native counterfactual: identical terrain, mesh and drop pose,
  // with only the former missing tire-sidewall contact behavior restored.
  if(AutoTest&&FParse::Param(FCommandLine::Get(),TEXT("TerraLegacyRolledTires")))return;
  const FVector Up=GetActorUpVector(),Forward=GetActorForwardVector();
  const FVector GravityDelta(0,0,Chassis->IsGravityEnabled()?GetWorld()->GetGravityZ()*Dt:0.f);
  FCollisionQueryParams Query(SCENE_QUERY_STAT(TerraRolledTire),true,this);
  TArray<FCarcassContact,TInlineAllocator<16>> Contacts;
  TArray<FVector2D> Profile;Profile.Reserve(10);
  for(int I=0;I<WheelCount();++I){
    const auto& Wheel=WheelState[I];
    if(Wheel.Center.ContainsNaN())continue;
    // An inverted vehicle supported by the loop retains its ordinary tires.
    if(Wheel.Constructed&&Wheel.ContactValid&&Wheel.Load>50&&FVector::DotProduct(Up,Wheel.Ground.Normal)>.35f)continue;
    const FVector F=FQuat(Up,Overturned?0.f:Wheel.Angle).RotateVector(Forward);
    const FVector Axis=FVector::CrossProduct(Up,F).GetSafeNormal();
    RolledTireProfile(I,Profile);
    FVector PreviousPoint(UE_BIG_NUMBER);bool HavePoint=false;
    for(float End:{-1.f,1.f}){
      ++RolledTireCandidates;
      FVector Normal=Terrain->Sample(Wheel.Center).Normal;
      FVector Point=CarcassSupport(Wheel.Center,Axis,F,Normal,Profile,End);
      // Resolve the terrain at the shoulder, not underneath the hub. These
      // cheap field reads follow live ruts and triangular terrain exactly.
      for(int Pass=0;Pass<2;++Pass){Normal=Terrain->Sample(Point).Normal;Point=CarcassSupport(Wheel.Center,Axis,F,Normal,Profile,End);}
      if(HavePoint&&FVector::DistSquared(Point,PreviousPoint)<FMath::Square(3.f))continue;
      PreviousPoint=Point;HavePoint=true;
      auto Ground=Terrain->Sample(Point);
      float Clearance=(Point.Z-Ground.Height)*Normal.Z;
      bool Natural=true;
      float Friction=FMath::Clamp(Ground.Mu,.25f,1.05f);
      auto ConsiderRigid=[&](const FHitResult& Hit,bool RaisedGround){
        const FVector RigidNormal=Hit.ImpactNormal.GetSafeNormal();
        if(RigidNormal.Z<=.15f||FVector::DotProduct(Up,RigidNormal)>=.5f)return false;
        const FVector RigidPoint=CarcassSupport(Wheel.Center,Axis,F,RigidNormal,Profile,End);
        const FVector Delta=RigidPoint-Hit.ImpactPoint;
        const float RigidClearance=FVector::DotProduct(Delta,RigidNormal);
        // On a continuous rock pad depth is real even if the hub is already
        // under the triangles. A log, bridge or loop still needs a nearby hit.
        const FVector Offset=RaisedGround?FVector::VectorPlaneProject(Delta,RigidNormal):Delta;
        if(Offset.SizeSquared()>=FMath::Square(Radius*45+20)||RigidClearance>=Clearance)return false;
        Point=RigidPoint;Normal=RigidNormal;Clearance=RigidClearance;Natural=false;Friction=.85f;
        return true;
      };
      FHitResult Hit;++RolledTireTraces;
      const FVector Start=Wheel.Center+Normal*10.f,EndPoint=Point-Normal*12.f;
      const bool HasRigidSupport=GetWorld()->LineTraceSingleByChannel(Hit,Start,EndPoint,ECC_Visibility,Query)&&
        Hit.Component.IsValid()&&!Hit.Component->ComponentHasTag(TEXT("TerraGround"))&&
        !Hit.bStartPenetrating&&ConsiderRigid(Hit,false);
      if(!HasRigidSupport){
        const FVector DeckProbe=CarcassSupport(Wheel.Center,Axis,F,FVector::UpVector,Profile,End);
        if(Terrain->TraceRaisedGround(DeckProbe,Hit,RolledTireTraces))ConsiderRigid(Hit,true);
      }
      if(FVector::DotProduct(Up,Normal)>.5f||Normal.Z<.15f)continue;
      const float NormalSpeed=FVector::DotProduct(Chassis->GetPhysicsLinearVelocityAtPoint(Point)+GravityDelta,Normal);
      const float Reach=FMath::Clamp(-NormalSpeed*Dt,2.f,60.f);
      if(Clearance>Reach||Clearance<-Radius*200||Point.ContainsNaN())continue;
      Contacts.Add({Point,Normal,Clearance,Friction,0,Natural});
    }
  }
  if(Contacts.IsEmpty())return;
  const int TireConstraintCount=Contacts.Num();
  const float NowSeconds=GetWorld()->GetTimeSeconds();
  // A tire impulse can rotate the roof/shoulder into ground that Chaos will
  // block later in this tick. Include up to four recent, actual body support
  // reactions in prediction so that unavailable rotation is not mistaken for
  // a successful tire separation. Never create hypothetical coachwork hits.
  for(int I=RolledBodySupports.Num()-1;I>=0;--I){
    const auto& Cached=RolledBodySupports[I];auto* Surface=Cached.Surface.Get();
    bool Valid=Surface&&NowSeconds>=Cached.Time&&NowSeconds-Cached.Time<=.20f;
    FVector Point=FVector::ZeroVector,Normal=FVector::ZeroVector,SurfacePoint;float Clearance=0;
    if(Valid){
      Point=GetActorTransform().TransformPosition(Cached.BodyLocalPoint);
      SurfacePoint=Surface->GetComponentTransform().TransformPosition(Cached.SurfaceLocalPoint);
      Normal=Surface->GetComponentTransform().TransformVectorNoScale(Cached.SurfaceLocalNormal).GetSafeNormal();
      const FVector Delta=Point-SurfacePoint;
      Clearance=FVector::DotProduct(Delta,Normal);
      Valid=!Point.ContainsNaN()&&!Normal.ContainsNaN()&&Normal.Z>.2f&&FVector::DotProduct(Up,Normal)<.5f&&
        !Surface->IsSimulatingPhysics()&&Surface->GetComponentVelocity().SizeSquared()<=1.f&&
        Clearance>=-4.f&&Clearance<=3.f&&FVector::VectorPlaneProject(Delta,Normal).SizeSquared()<=FMath::Square(8.f);
      if(Valid&&Surface->ComponentHasTag(TEXT("TerraGround"))){
        const auto Ground=Terrain->Sample(Point);
        // A stale collision triangle must not support the body over a new rut.
        const float FieldClearance=(Point.Z-Ground.Height)*Ground.Normal.Z;
        Valid=FieldClearance>=-4.f&&FieldClearance<=3.f&&FVector::DotProduct(Normal,Ground.Normal)>.9f;
        if(Valid){Normal=Ground.Normal;Clearance=FieldClearance;}
      }
    }
    if(!Valid){RolledBodySupports.RemoveAtSwap(I,1,EAllowShrinking::No);continue;}
    const float Friction=Chassis->GetPhysicsLinearVelocityAtPoint(Point).SizeSquared()<FMath::Square(10.f)?BodyGroundStaticFriction:BodyGroundSlidingFriction;
    Contacts.Add({Point,Normal,Clearance,FMath::Max(0.f,Friction),0,false,true});
  }
  // Sequential, bounded contact impulses include rotational effective mass.
  // They stop inward velocity at the real carcass surface and allow residual
  // outward/tumbling momentum. No pose correction, weld, or mesh cook occurs.
  const float ActualMass=FMath::Max(1.f,Chassis->GetMass());
  const FVector COM=Chassis->GetCenterOfMass(),Inertia=Chassis->GetInertiaTensor();
  const FQuat MassRotation=Chassis->BodyInstance.GetMassSpaceToWorldSpace().GetRotation();
  auto InverseInertia=[&](const FVector& WorldTorque){
    const FVector Torque=MassRotation.UnrotateVector(WorldTorque);
    return MassRotation.RotateVector(FVector(Torque.X/FMath::Max(1.f,float(Inertia.X)),
      Torque.Y/FMath::Max(1.f,float(Inertia.Y)),Torque.Z/FMath::Max(1.f,float(Inertia.Z))));
  };
  auto InverseEffectiveMass=[&](const FVector& Point,const FVector& Direction){
    const FVector Arm=Point-COM;
    return 1.f/ActualMass+FVector::DotProduct(FVector::CrossProduct(InverseInertia(FVector::CrossProduct(Arm,Direction)),Arm),Direction);
  };
  // Chaos accumulates AddImpulse rather than immediately changing the queried
  // velocity. Maintain the local predicted velocity for sequential contacts;
  // repeatedly querying the old velocity would multiply impact energy.
  // The queued impulses precede this frame's gravity integration. Predict
  // gravity here (without adding it to the body again), otherwise each slow
  // frame would reintroduce downward speed and a persistent penetration.
  FVector Linear=Chassis->GetPhysicsLinearVelocity()+GravityDelta,Angular=Chassis->GetPhysicsAngularVelocityInRadians();
  auto PointVelocity=[&](const FVector& Point){return Linear+FVector::CrossProduct(Angular,Point-COM);};
  auto PredictImpulse=[&](const FVector& Impulse,const FVector& Point){
    Linear+=Impulse/ActualMass;Angular+=InverseInertia(FVector::CrossProduct(Point-COM,Impulse));
  };
  // Project accumulated normal/tangent reactions. A later friction reaction
  // can alter an earlier wheel's normal velocity through the body inertia;
  // positive-only impulses cannot release an obsolete reaction or converge.
  // Eight bounded iterations add no terrain queries or physics-state writes.
  for(int Pass=0;Pass<8;++Pass)for(auto& C:Contacts){
    FVector Velocity=PointVelocity(C.Point);
    const float NormalSpeed=FVector::DotProduct(Velocity,C.Normal);
    const float Target=C.VirtualBody?0.f:(C.Clearance>=-.5f?-(C.Clearance+.5f)/FMath::Max(.008f,Dt):
      FMath::Min(150.f,(-C.Clearance-.5f)*.25f/FMath::Max(.008f,Dt)));
    const float NormalDelta=(Target-NormalSpeed)/FMath::Max(.000001f,InverseEffectiveMass(C.Point,C.Normal));
    const float NewNormalImpulse=FMath::Max(0.f,C.Impulse+NormalDelta);
    PredictImpulse(C.Normal*(NewNormalImpulse-C.Impulse),C.Point);C.Impulse=NewNormalImpulse;
    Velocity=PointVelocity(C.Point);
    const FVector Tangent=FVector::VectorPlaneProject(Velocity,C.Normal);const float TangentSpeed=Tangent.Size();
    FVector NewTangentImpulse=C.TangentImpulse;
    if(TangentSpeed>.001f){
      const FVector TangentDirection=Tangent/TangentSpeed;
      NewTangentImpulse-=TangentDirection*(TangentSpeed/FMath::Max(.000001f,InverseEffectiveMass(C.Point,TangentDirection)));
    }
    const float Limit=C.Friction*C.Impulse;
    NewTangentImpulse=NewTangentImpulse.GetClampedToMaxSize(Limit);
    PredictImpulse(NewTangentImpulse-C.TangentImpulse,C.Point);C.TangentImpulse=NewTangentImpulse;
  }
  // Only tire reactions are queued. Virtual coachwork impulses predict the
  // separate Chaos contact solve and must never be applied a second time.
  for(const auto& C:Contacts)if(!C.VirtualBody&&C.Impulse>.001f){
    ++RolledTireContacts;RolledTireImpulseNS+=C.Impulse*.01f;
    Chassis->AddImpulseAtLocation(C.Normal*C.Impulse+C.TangentImpulse,C.Point);
  }
  if(AutoTest&&FParse::Param(FCommandLine::Get(),TEXT("TerraRolledTireDiagnostics"))){
    static double NextLog=0;const double Now=GetWorld()->GetTimeSeconds();
    if(Now>=NextLog){NextLog=Now+.25;float Clearance=UE_BIG_NUMBER,Residual=0;
      for(const auto& C:Contacts){if(C.VirtualBody)continue;Clearance=FMath::Min(Clearance,C.Clearance);
        const float Target=C.Clearance>=-.5f?-(C.Clearance+.5f)/FMath::Max(.008f,Dt):
          FMath::Min(150.f,(-C.Clearance-.5f)*.25f/FMath::Max(.008f,Dt));
        Residual=FMath::Max(Residual,Target-float(FVector::DotProduct(PointVelocity(C.Point),C.Normal)));}
      float VisibleClearance=UE_BIG_NUMBER;FVector VisibleMinimum=FVector::ZeroVector;int VisibleWheel=INDEX_NONE;
      if(TerraTireProbeValidation::Load()&&TerraTireProbeValidation::Matches(this)){
        const auto Witnesses=TerraTireProbeValidation::ActorLocalPoints(this);const int PerWheel=Witnesses.Num()/WheelCount();
        for(int I=0;I<Witnesses.Num();++I){const FVector Point=GetActorTransform().TransformPosition(Witnesses[I]);
          const float Gap=Point.Z-Terrain->Height(Point.X,Point.Y);
          if(Gap<VisibleClearance){VisibleClearance=Gap;VisibleMinimum=Point;VisibleWheel=PerWheel?I/PerWheel:INDEX_NONE;}}
      }
      UE_LOG(LogTemp,Display,TEXT("TERRA_TIRE_CONTACT model=%d roll=%.2f dt=%.4f clearanceCM=%.3f residualCMPS=%.3f contacts=%d bodyPrediction=%d impulseNS=%.3f visibleCM=%.3f visibleWheel=%d visiblePoint=%s linear=%s angular=%s"),
        VehicleIndex,GetActorRotation().Roll,Dt,Clearance,Residual,RolledTireContacts,Contacts.Num()-TireConstraintCount,RolledTireImpulseNS,
        VisibleClearance,VisibleWheel,*VisibleMinimum.ToString(),*Linear.ToString(),*Angular.ToString());
      if(VisibleClearance< -4.f){
        UE_LOG(LogTemp,Display,TEXT("TERRA_TIRE_PENETRATION_POSE frame=%llu model=%d actorCM=%s rotation=%s up=%s comCM=%s inertiaKGCM2=%s massKg=%.3f massRotation=%s"),
          static_cast<unsigned long long>(GFrameCounter),VehicleIndex,*GetActorLocation().ToString(),*GetActorRotation().ToString(),*Up.ToString(),
          *COM.ToString(),*Inertia.ToString(),ActualMass,*MassRotation.Rotator().ToString());
        for(int I=0;I<WheelCount();++I){const auto& W=WheelState[I];
          const FVector MeshLocation=Wheels.IsValidIndex(I)&&Wheels[I]?Wheels[I]->GetComponentLocation():FVector::ZeroVector;
          UE_LOG(LogTemp,Display,TEXT("TERRA_TIRE_PENETRATION_WHEEL frame=%llu model=%d wheel=%d centerCM=%s meshCM=%s distanceM=%.5f valid=%d constructed=%d loadN=%.3f normal=%s upDotNormal=%.5f contactCM=%s"),
            static_cast<unsigned long long>(GFrameCounter),VehicleIndex,I,*W.Center.ToString(),*MeshLocation.ToString(),W.Distance,
            W.ContactValid?1:0,W.Constructed?1:0,W.Load,*W.Ground.Normal.ToString(),FVector::DotProduct(Up,W.Ground.Normal),*W.Contact.ToString());
        }
      }

    }
  }
}
