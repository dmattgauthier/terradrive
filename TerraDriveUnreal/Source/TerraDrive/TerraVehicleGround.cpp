#include "TerraVehicle.h"
#include "TerraBodyGround.h"
#include "Components/BoxComponent.h"
#include "PhysicalMaterials/PhysicalMaterial.h"
#include "Chaos/ChaosEngineInterface.h"
#include "ProceduralMeshComponent.h"
#include "Engine/World.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

void ATerraVehicle::UpdateBodyGroundGrip(){
  if(!Terrain||!UndertrayMaterial)return;
  auto Ground=Terrain->Sample(GetActorLocation());
  FVector SupportNormal=Ground.Normal,ConstructedNormal=FVector::ZeroVector;
  float ConstructedLoad=0;
  for(const auto& W:WheelState)if(W.Constructed&&W.ContactValid&&W.Load>50){
    ConstructedNormal+=W.Ground.Normal*W.Load;ConstructedLoad+=W.Load;Ground.Surface=W.Ground.Surface;
  }
  // Correctly supported inverted loop driving is upright relative to its
  // track. World-up alone must not turn that into overturned body drag.
  if(ConstructedLoad>50)SupportNormal=ConstructedNormal.GetSafeNormal();
  auto Grip=TerraSim::BodyGrip(FVector::DotProduct(GetActorUpVector(),SupportNormal),Ground.Surface,Terrain->Rain);
  // Same executable/terrain control for the dedicated native A/B coast test.
  if(AutoTest&&FParse::Param(FCommandLine::Get(),TEXT("TerraLegacyBodyGrip")))Grip={};
  BodyGroundSlidingFriction=Grip.Sliding;BodyGroundStaticFriction=Grip.Static;
  if(FMath::Abs(UndertrayMaterial->Friction-Grip.Sliding)<.005f&&
      FMath::Abs(UndertrayMaterial->StaticFriction-Grip.Static)<.005f)return;
  UndertrayMaterial->Friction=Grip.Sliding;UndertrayMaterial->StaticFriction=Grip.Static;
  FChaosEngineInterface::UpdateMaterial(UndertrayMaterial->GetPhysicsMaterial(),UndertrayMaterial);
  // Push the changed material into the welded Chaos shapes. Merely changing
  // the UObject's numbers leaves the live physics material stale.
  Chassis->BodyInstance.UpdatePhysicalMaterials();
  FrontCollision->BodyInstance.UpdatePhysicalMaterials();
  RearCollision->BodyInstance.UpdatePhysicalMaterials();
  CoachworkCollision->BodyInstance.UpdatePhysicalMaterials();
}
void ATerraVehicle::QueueBodyGroundContact(FVector Impulse,const FHitResult& Hit){
  if(!Terrain||Garage||Hit.ImpactPoint.ContainsNaN()||Hit.ImpactNormal.ContainsNaN())return;
  const FVector Normal=Hit.ImpactNormal.GetSafeNormal();
  const float Alignment=FVector::DotProduct(GetActorUpVector(),Normal);
  if(Alignment>.70f||Normal.Z<.20f)return;
  const auto Ground=Terrain->Sample(Hit.ImpactPoint);
  if(FMath::Abs(Hit.ImpactPoint.Z-Ground.Height)>18.f)return;
  const float NormalImpulse=FMath::Abs(FVector::DotProduct(Impulse,Normal))*.01f;
  if(NormalImpulse<.25f)return;
  FVector Velocity=Chassis->GetPhysicsLinearVelocityAtPoint(Hit.ImpactPoint);
  Velocity=FVector::VectorPlaneProject(Velocity,Normal);
  FVector Tangent=Velocity.GetSafeNormal();
  if(Tangent.IsNearlyZero())Tangent=FVector::VectorPlaneProject(GetActorForwardVector(),Normal).GetSafeNormal();
  if(Tangent.IsNearlyZero())Tangent=FVector::VectorPlaneProject(GetActorRightVector(),Normal).GetSafeNormal();
  // Welded shape notifications can repeat one contact. Keep the largest
  // normal impulse at that position rather than multiplying soil load.
  for(auto& C:PendingBodyGroundContacts)if(FVector::DistSquared(C.Point,Hit.ImpactPoint)<FMath::Square(22.f)&&FVector::DotProduct(C.Normal,Normal)>.95f){
    C.ImpulseNS=FMath::Max(C.ImpulseNS,NormalImpulse);C.Speed=FMath::Max(C.Speed,float(Velocity.Size()*.01));return;
  }
  if(PendingBodyGroundContacts.Num()<12){
    PendingBodyGroundContacts.Add({Hit.ImpactPoint,Normal,Tangent,NormalImpulse,float(Velocity.Size()*.01),Alignment});
    ++BodyGroundContactCount;
  }
}
void ATerraVehicle::ProcessBodyGroundContacts(float Dt){
  if(!Terrain||Garage){PendingBodyGroundContacts.Reset();return;}
  const float Exposure=FMath::Clamp(Dt,.008f,.12f),ForceTime=FMath::Clamp(Dt,.008f,.5f);
  PendingBodyGroundContacts.Sort([](const FTerraBodyGroundContact& A,const FTerraBodyGroundContact& B){return A.ImpulseNS>B.ImpulseNS;});
  int Budget=0;
  for(const auto& C:PendingBodyGroundContacts){
    if(++Budget>4)break; // Keep soil work bounded to the strongest real support patches.
    const float Load=FMath::Clamp(C.ImpulseNS/ForceTime,50.f,Mass*9.81f*2.5f);
    const bool Roof=C.Alignment<-.45f;
    const float PanelWidth=FMath::Clamp(Number(TEXT("width"),1.8f)*(Roof?.43f:.27f),.35f,1.1f);
    const float Length=FMath::Clamp(Number(TEXT("length"),4.5f)*.26f,.65f,1.55f);
    Terrain->BodyGroundContact(C.Point,C.Tangent,Load,PanelWidth,Length,C.Speed,Exposure);
  }
  PendingBodyGroundContacts.Reset();
}
