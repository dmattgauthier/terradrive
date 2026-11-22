#include "TerraCarcassValidation.h"
#include "TerraGarage.h"
#include "TerraVehicle.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/HUD.h"
#include "GameFramework/PlayerController.h"
#include "Math/RotationMatrix.h"

namespace TerraCarcassValidation {
namespace {
constexpr int PavementZone=1, Wrangler=0, TireStage=5, FrontRight=1;
constexpr const TCHAR* PressureLabels[]={TEXT("low"),TEXT("road"),TEXT("high")};
constexpr const TCHAR* PressurePictures[]={
    TEXT("native-carcass-low.png"),TEXT("native-carcass-road.png"),TEXT("native-carcass-high.png")};
constexpr int Urus=5, UrusStockView=5, UrusConvertedView=6;
constexpr int UnderbodyVehicles[]={7,9,Wrangler,Wrangler,Wrangler,Urus,Urus};
constexpr const TCHAR* UnderbodyPictures[]={
    TEXT("native-underbody-g580.png"),TEXT("native-underbody-g63-sixwheel.png"),
    TEXT("native-underbody-wrangler-stock.png"),TEXT("native-underbody-wrangler-quad-portal.png"),
    TEXT("native-underbody-wrangler-single.png"),TEXT("native-underbody-urus.png"),TEXT("native-underbody-urus-quad.png")};
constexpr int UpgradedView=3, SingleMotorView=4, SingleSwap=1, QuadSwap=3, FrameStage=3, BodyStage=3, PortalStage=2;

enum class Phase { Resume, Settle, HoldCapture, Airborne, Underbody, Finish };

struct FPressureSample {
    float Deflection=0, HubGap=0, Load=0, Pressure=0, ShaderDeflection=0;
    int Frames=0;
    bool Parked=true, BoundMaterial=true;
};

struct FUnderbodyReadback {
    int Motors=0, Exhaust=0, PortalCases=0, OffCenterShields=0, CenterShields=0;
    int RearPipeEnds=0, UrusSocketMask=0;
    float RailWidth=0, FrontSkidWidth=0;
    bool Rendered=false;
};

struct FRun {
    TWeakObjectPtr<ATerraVehicle> Vehicle;
    TWeakObjectPtr<ACameraActor> Camera;
    FVector Pavement=FVector::ZeroVector;
    FVector TireFocus=FVector::ZeroVector;
    FPressureSample Samples[3];
    FUnderbodyReadback StockWrangler;
    float Targets[3]={};
    float Time=0, Radius=0;
    int Trial=0, UnderbodyView=0;
    Phase Step=Phase::Resume;

    void Advance(Phase Next) { Step=Next; Time=0; }
} Run;

void Brake(ATerraVehicle& Vehicle) {
    Vehicle.TestDriverInput=false;
    Vehicle.TestThrottle=Vehicle.TestSteer=0;
    Vehicle.TestBrake=1;
}

void Place(ATerraVehicle& Vehicle,const FVector& Position,const FRotator& Rotation) {
    Vehicle.SetActorLocationAndRotation(Position,Rotation,false,nullptr,ETeleportType::TeleportPhysics);
    Vehicle.Chassis->SetPhysicsLinearVelocity(FVector::ZeroVector);
    Vehicle.Chassis->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
}

void Frame(ATerraVehicle& Vehicle,const FVector& Eye,const FRotator& Direction,float Fov) {
    if(!Run.Camera.IsValid())Run.Camera=Vehicle.GetWorld()->SpawnActor<ACameraActor>();
    if(!Run.Camera.IsValid())return;
    Run.Camera->SetActorLocationAndRotation(Eye,Direction);
    Run.Camera->GetCameraComponent()->SetFieldOfView(Fov);
    if(auto* Player=Cast<APlayerController>(Vehicle.GetController())){
        Player->SetViewTarget(Run.Camera.Get());
        if(auto* HUD=Player->GetHUD())HUD->bShowHUD=false;
    }
}

bool FlatPavement(const ATerraVehicle& Vehicle,const FVector& Center) {
    for(float X:{-210.f,0.f,210.f})for(float Y:{-140.f,0.f,140.f}){
        const auto Surface=Vehicle.Terrain->Sample(Center+FVector(X,Y,0));
        if(Surface.Surface!=1||Surface.PavementCoverage<.85f||FMath::Abs(Surface.Height-Center.Z)>3.f)
            return false;
    }
    return true;
}

void StartPressure(ATerraVehicle& Vehicle) {
    Vehicle.SetGarage(true);
    Vehicle.RequestTirePressure(Run.Targets[Run.Trial],false);
    Vehicle.SetGarage(false);
    Brake(Vehicle);
    Run.Advance(Phase::Resume);
}

void SamplePressure(const ATerraVehicle& Vehicle,FPressureSample& Sample) {
    const auto& Wheel=Vehicle.WheelState[FrontRight];
    const float HubGap=FVector::DotProduct(Wheel.Center-Wheel.Contact,Wheel.Ground.Normal)*.01f;
    const auto& Tire=Vehicle.Wheels[FrontRight];
    const auto& Data=Tire->GetCustomPrimitiveData().Data;
    const bool HasShape=Data.IsValidIndex(11);
    Sample.BoundMaterial&=HasShape&&
        Tire->GetCustomPrimitiveDataIndexForVectorParameter(TEXT("CarcassPlane"))==0&&
        Tire->GetCustomPrimitiveDataIndexForVectorParameter(TEXT("CarcassPush"))==4&&
        Tire->GetCustomPrimitiveDataIndexForVectorParameter(TEXT("CarcassShape"))==8&&
        FVector(Data[0],Data[1],Data[2]).SizeSquared()>.5f&&
        Data[7]>0&&Data[8]>0&&Data[9]>Data[8]&&Data[10]>=Data[11]&&
        FMath::Abs(Data[11]-Wheel.TireDeflection*100.f)<.16f;
    Sample.ShaderDeflection+=HasShape?Data[11]:0.f;
    Sample.Parked&=Vehicle.ContactCount==4&&Wheel.ContactValid&&!Wheel.Constructed&&
        Wheel.Ground.Surface==1&&Wheel.Ground.Normal.Z>.995f&&Wheel.Load>500.f&&
        FMath::Abs(Vehicle.Speed)<.12f&&FVector::Dist2D(Vehicle.GetActorLocation(),Run.Pavement)<5.f;
    Sample.Deflection+=Wheel.TireDeflection;
    Sample.HubGap+=HubGap;
    Sample.Load+=Wheel.Load;
    Sample.Pressure+=Vehicle.WheelPressure(FrontRight);
    ++Sample.Frames;
}

void ReportPressure(FPressureSample& Sample,TFunctionRef<void(const FString&,bool,float)> Check) {
    const float Scale=1.f/FMath::Max(1,Sample.Frames);
    Sample.Deflection*=Scale;
    Sample.HubGap*=Scale;
    Sample.Load*=Scale;
    Sample.Pressure*=Scale;
    Sample.ShaderDeflection*=Scale;
    const FString Label=FString::Printf(TEXT("carcass %s pressure"),PressureLabels[Run.Trial]);
    Check(Label+TEXT(" settles on the same pavement at the serviced PSI"),
        Sample.Frames>=8&&Sample.Parked&&FMath::IsNearlyEqual(Sample.Pressure,Run.Targets[Run.Trial],.1f),Sample.Pressure);
    Check(Label+TEXT(" loads the sidewall and shortens the hub to contact distance"),
        Sample.Deflection>.005f&&FMath::Abs(Run.Radius-Sample.HubGap-Sample.Deflection)<.012f,Sample.HubGap*100.f);
    Check(Label+TEXT(" sends the loaded tire plane and deflection to the render primitive"),
        Sample.BoundMaterial&&Sample.ShaderDeflection>.5f,Sample.ShaderDeflection);
    UE_LOG(LogTemp,Display,TEXT("TERRA_CARCASS pressure=%s psi=%.3f loadN=%.2f deflectionCM=%.3f hubGapCM=%.3f cpdCM=%.3f samples=%d"),
        PressureLabels[Run.Trial],Sample.Pressure,Sample.Load,Sample.Deflection*100.f,Sample.HubGap*100.f,Sample.ShaderDeflection,Sample.Frames);
}

void ComparePressure(TFunctionRef<void(const FString&,bool,float)> Check) {
    const auto& Low=Run.Samples[0];
    const auto& Road=Run.Samples[1];
    const auto& High=Run.Samples[2];
    const float LoadDifference=FMath::Max(FMath::Abs(Low.Load-Road.Load),FMath::Abs(High.Load-Road.Load));
    Check(TEXT("carcass comparisons use matched supported corner load"),
        Road.Load>500.f&&LoadDifference<Road.Load*.10f,LoadDifference);
    Check(TEXT("airing down produces greater carcass deflection than road and high pressure"),
        Low.Deflection-Road.Deflection>.008f&&Road.Deflection-High.Deflection>.002f,(Low.Deflection-High.Deflection)*100.f);
    Check(TEXT("lower pressure brings the rigid rim and hub closer to their loaded contact"),
        Road.HubGap-Low.HubGap>.006f&&High.HubGap-Road.HubGap>.0015f,(High.HubGap-Low.HubGap)*100.f);
}

FUnderbodyReadback ReadUnderbody(const ATerraVehicle& Vehicle) {
    FUnderbodyReadback Parts;
    if(Vehicle.UnderbodyMeshes.Num()!=4||!Vehicle.RunningGearMeshes.IsValidIndex(4))return Parts;
    const auto& Frame=*Vehicle.UnderbodyMeshes[0];
    const auto& Alloy=*Vehicle.UnderbodyMeshes[1];
    const auto& Steel=*Vehicle.UnderbodyMeshes[2];
    const auto& GearBoxes=*Vehicle.RunningGearMeshes[4];
    const float RailLength=Vehicle.AxleOffsetM(0)-Vehicle.AxleOffsetM(Vehicle.AxleCount()-1)-.34f;
    const float FrontAxleX=Vehicle.AxleOffsetM(0)*100.f;
    FTransform Instance;
    for(int Index=0;Index<Frame.GetInstanceCount();++Index)
        if(Frame.GetInstanceTransform(Index,Instance,false)&&FMath::IsNearlyEqual(Instance.GetScale3D().X,double(RailLength),.01))
            Parts.RailWidth=FMath::Max(Parts.RailWidth,float(Instance.GetScale3D().Y*100));
    for(int Index=0;Index<Alloy.GetInstanceCount();++Index){
        if(!Alloy.GetInstanceTransform(Index,Instance,false))continue;
        const double Y=FMath::Abs(Instance.GetLocation().Y);
        const auto Scale=Instance.GetScale3D();
        const double AxleGap=Instance.GetLocation().X-FrontAxleX;
        if(AxleGap>30&&AxleGap<53&&Y<.5)
            Parts.FrontSkidWidth=FMath::Max(Parts.FrontSkidWidth,float(Scale.Y*100));
        if(Vehicle.ElectricLayout()==TerraSim::MotorLayout::Single&&Scale.X>RailLength*.55f){
            if(Y-Scale.Y*50>=14.f)++Parts.OffCenterShields;
            else ++Parts.CenterShields;
        }
    }
    for(int Index=0;Index<Steel.GetInstanceCount();++Index){
        if(!Steel.GetInstanceTransform(Index,Instance,false))continue;
        const FVector Axis=Instance.GetRotation().GetUpVector();
        const FVector Scale=Instance.GetScale3D();
        // The full motor case is transverse and thicker than the longitudinal exhaust.
        if(FMath::Abs(Axis.Y)>.90&&FMath::IsNearlyEqual(Scale.Z,.22,.02)&&Scale.X>.17)++Parts.Motors;
        if(FMath::Abs(Axis.X)>.75&&Scale.Z>.45&&Scale.X<.15)++Parts.Exhaust;
        if(Vehicle.VehicleIndex==Urus){
            // Interrogate the actual steel cylinder's rear cap, including its
            // transform. Each tip must terminate inside one measured oval bore.
            const FVector End=Instance.TransformPosition(FVector(0,0,Axis.X<0?50.:-50.));
            if(End.X>=-241.)continue;
            ++Parts.RearPipeEnds;
            const bool Outer=FMath::Abs(End.Y)>72.;
            const FVector Rim(Outer?-249.4:-252.46,Outer?79.9:64.7,Outer?-18.45:-19.04);
            const double Depth=End.X-Rim.X;
            if(Depth>=3.5&&Depth<=6.5&&FMath::Abs(FMath::Abs(End.Y)-Rim.Y)<1.&&
               FMath::Abs(End.Z-Rim.Z)<1.5&&FMath::Abs(Axis.X)>.99)
                Parts.UrusSocketMask|=1<<((End.Y>0?2:0)+(Outer?1:0));
        }
    }
    const float CaseHeight=Vehicle.PortalLift()+.11f;
    for(int Index=0;Index<GearBoxes.GetInstanceCount();++Index){
        if(!GearBoxes.GetInstanceTransform(Index,Instance,false))continue;
        const FVector Scale=Instance.GetScale3D();
        if(FMath::Abs(Instance.GetLocation().Y)>50&&FMath::IsNearlyEqual(Scale.X,.14,.004)&&
           FMath::IsNearlyEqual(Scale.Y,.10,.004)&&FMath::IsNearlyEqual(Scale.Z,double(CaseHeight),.004))
            ++Parts.PortalCases;
    }
    Parts.Rendered=Alloy.WasRecentlyRendered(.4f)&&Steel.WasRecentlyRendered(.4f);
    return Parts;
}

void StartUnderbody(ATerraVehicle& Vehicle) {
    Vehicle.SetGarage(true);
    Vehicle.SelectVehicle(UnderbodyVehicles[Run.UnderbodyView]);
    Vehicle.ResetUpgrades(false);
    if(Run.UnderbodyView==UpgradedView){
        Vehicle.SetUpgrade(TerraSim::EVSwap,QuadSwap,false);
        Vehicle.SetUpgrade(TerraSim::Frame,FrameStage,false);
        Vehicle.SetUpgrade(TerraSim::Body,BodyStage,false);
        Vehicle.SetUpgrade(TerraSim::Portals,PortalStage,false);
    }else if(Run.UnderbodyView==UrusConvertedView){
        Vehicle.SetUpgrade(TerraSim::EVSwap,QuadSwap,false);
    }else if(Run.UnderbodyView==SingleMotorView){
        Vehicle.SetUpgrade(TerraSim::EVSwap,SingleSwap,false);
    }
    if(const auto Garage=Vehicle.GetGarageWidget())Garage->SetVisibility(EVisibility::Collapsed);
    // Pose the stationary garage truck for a clear inspection of its floor.
    const FRotator Roll(0,0,-132.f);
    const FTransform Pose(Roll,Run.Pavement+FVector(0,0,280.f));
    Place(Vehicle,Pose.GetLocation(),Roll);
    const FVector Focus=Pose.TransformPosition(FVector(-30,0,-25));
    const FVector Eye=Focus+Pose.TransformVectorNoScale(FVector(180,140,-790));
    Frame(Vehicle,Eye,FRotationMatrix::MakeFromXZ(Focus-Eye,Pose.TransformVectorNoScale(FVector::RightVector)).Rotator(),48.f);
    Run.Advance(Phase::Underbody);
}
}

bool Tick(ATerraVehicle* Vehicle,float Delta,
    TFunctionRef<void(const FString&,bool,float)> Check,
    TFunctionRef<void(const TCHAR*)> Capture) {
    auto& V=*Vehicle;
    if(Run.Vehicle.Get()!=Vehicle){
        Run=FRun{};
        Run.Vehicle=Vehicle;
        V.SetGarage(true);
        V.SelectVehicle(Wrangler);
        V.ResetUpgrades(false);
        V.TeleportZone(PavementZone);
        V.SetUpgrade(TerraSim::Suspension,V.RequiredTireSuspensionStage(TireStage),false);
        V.SetUpgrade(TerraSim::TireSize,TireStage,false);
        Run.Radius=V.TireDiameter()*.0127f;
        const auto Bounds=V.TireAirBounds();
        Run.Targets[0]=FMath::Max(Bounds.MinimumPSI,Bounds.RoadPSI*.42f);
        Run.Targets[1]=Bounds.RoadPSI;
        Run.Targets[2]=Bounds.MaximumPSI-3.f;
        const bool Fitted=V.UpgradeStage(TerraSim::TireSize)==TireStage&&V.TireDiameter()>=40.f&&
            V.Wheels.IsValidIndex(FrontRight)&&Run.Targets[1]-Run.Targets[0]>12.f&&Run.Targets[2]-Run.Targets[1]>12.f;
        Check(TEXT("pressure fixture uses an installed 40-inch or larger tire and three valid settings"),Fitted,V.TireDiameter());
        Run.Pavement=V.Terrain->Spawns[PavementZone]-FVector(600,600,0);
        Run.Pavement.Z=V.Terrain->Height(Run.Pavement.X,Run.Pavement.Y);
        const bool Flat=FlatPavement(V,Run.Pavement);
        Check(TEXT("pressure fixture verifies flat pavement under the entire vehicle"),Flat,Run.Pavement.Z);
        if(!Fitted||!Flat)return true;
        Run.TireFocus=Run.Pavement+FVector(V.AxleOffsetM(0)*100.f,108.f,Run.Radius*100.f+2.f);
        StartPressure(V);
        return false;
    }

    Run.Time+=Delta;
    switch(Run.Step){
        case Phase::Resume: {
            if(Run.Time<.25f)return false;
            // The garage release must complete before moving the dynamic body.
            Place(V,Run.Pavement+FVector(0,0,V.ExpectedRideHeight()*100.f+12.f),FRotator::ZeroRotator);
            for(auto& Wheel:V.WheelState)Wheel=FTerraWheel();
            Brake(V);
            const FVector Eye=Run.TireFocus+FVector(125,325,34);
            Frame(V,Eye,(Run.TireFocus-Eye).Rotation(),39.f);
            Run.Advance(Phase::Settle);
            return false;
        }
        case Phase::Settle:
            if(Run.Time>2.5f)SamplePressure(V,Run.Samples[Run.Trial]);
            if(Run.Time<3.3f)return false;
            ReportPressure(Run.Samples[Run.Trial],Check);
            Capture(PressurePictures[Run.Trial]);
            Run.Advance(Phase::HoldCapture);
            return false;
        case Phase::HoldCapture:
            if(Run.Time<.30f)return false;
            if(++Run.Trial<UE_ARRAY_COUNT(Run.Samples)){
                StartPressure(V);
                return false;
            }
            ComparePressure(Check);
            Place(V,V.GetActorLocation()+FVector(0,0,265),V.GetActorRotation());
            Run.Advance(Phase::Airborne);
            return false;
        case Phase::Airborne: {
            if(Run.Time<.25f)return false;
            bool Clear=V.ContactCount==0;
            float Maximum=0;
            for(int Index=0;Index<V.WheelCount();++Index){
                const auto& Wheel=V.WheelState[Index];
                const auto& Data=V.Wheels[Index]->GetCustomPrimitiveData().Data;
                Maximum=FMath::Max(Maximum,Wheel.TireDeflection);
                Clear&=!Wheel.ContactValid&&FMath::IsNearlyZero(Wheel.TireDeflection,.0001f)&&
                    Data.IsValidIndex(11)&&FMath::IsNearlyZero(Data[11],.001f);
            }
            Check(TEXT("all unloaded wheels clear both physics deflection and shader displacement"),Clear,Maximum*100.f);
            StartUnderbody(V);
            return false;
        }
        case Phase::Underbody: {
            if(Run.Time<.8f)return false;
            const auto Parts=ReadUnderbody(V);
            if(Run.UnderbodyView==0){
                Check(TEXT("G 580 renders battery protection and four transverse motor cases without a longitudinal exhaust"),
                    V.ElectricLayout()==TerraSim::MotorLayout::Quad&&Parts.Motors==4&&Parts.Exhaust==0&&
                    Parts.FrontSkidWidth>0&&Parts.Rendered,Parts.Motors);
            }else if(Run.UnderbodyView==1){
                Check(TEXT("G 63 6x6 renders a three-axle ICE underbody with two longitudinal exhaust runs"),
                    !V.IsElectric()&&V.WheelCount()==6&&Parts.Motors==0&&Parts.Exhaust>=2&&Parts.Rendered,Parts.Exhaust);
            }else if(Run.UnderbodyView==UpgradedView){
                const auto& Stock=Run.StockWrangler;
                const bool Selected=V.VehicleIndex==Wrangler&&V.ElectricLayout()==TerraSim::MotorLayout::Quad&&
                    V.UpgradeStage(TerraSim::Frame)==FrameStage&&V.UpgradeStage(TerraSim::Body)==BodyStage&&
                    V.UpgradeStage(TerraSim::Portals)==PortalStage;
                const bool Converted=Stock.Motors==0&&Stock.Exhaust>0&&Parts.Motors==4&&Parts.Exhaust==0;
                const bool Protected=Stock.RailWidth>0&&Parts.RailWidth>Stock.RailWidth+2.f&&Stock.FrontSkidWidth>0&&
                    Parts.FrontSkidWidth>Stock.FrontSkidWidth*1.15f&&V.Protection&&V.Protection->IsVisible();
                Check(TEXT("garage quad swap and protection upgrades change the same Wrangler's rendered hardware"),
                    Selected&&Converted&&Protected&&Stock.PortalCases==0&&Parts.PortalCases==4&&
                    Stock.Rendered&&Parts.Rendered,Parts.PortalCases);
                UE_LOG(LogTemp,Display,TEXT("TERRA_UNDERBODY_WRANGLER motors=%d/%d exhaust=%d/%d railsCM=%.1f/%.1f skidCM=%.1f/%.1f portals=%d/%d"),
                    Stock.Motors,Parts.Motors,Stock.Exhaust,Parts.Exhaust,Stock.RailWidth,Parts.RailWidth,
                    Stock.FrontSkidWidth,Parts.FrontSkidWidth,Stock.PortalCases,Parts.PortalCases);
            }else if(Run.UnderbodyView==SingleMotorView){
                Check(TEXT("single-motor Wrangler has two battery shields outside its driveshaft tunnel"),
                    V.ElectricLayout()==TerraSim::MotorLayout::Single&&Parts.OffCenterShields==2&&
                    Parts.CenterShields==0&&Parts.Exhaust==0&&Parts.Rendered,Parts.OffCenterShields);
            }else if(Run.UnderbodyView==UrusStockView){
                Check(TEXT("Urus V8 feeds the four recessed diffuser outlets with no additional exposed tailpipes"),
                    !V.IsElectric()&&Parts.Rendered&&Parts.RearPipeEnds==4&&Parts.UrusSocketMask==15,Parts.RearPipeEnds);
            }else if(Run.UnderbodyView==UrusConvertedView){
                Check(TEXT("quad-converted Urus replaces the exhaust feeds with four motor cases"),
                    V.IsElectric()&&Parts.Rendered&&Parts.Motors==4&&Parts.Exhaust==0&&Parts.RearPipeEnds==0,Parts.Motors);
            }else Run.StockWrangler=Parts;
            Capture(UnderbodyPictures[Run.UnderbodyView]);
            Run.Advance(Phase::Finish);
            return false;
        }
        case Phase::Finish:
            if(Run.Time<.3f)return false;
            if(++Run.UnderbodyView<UE_ARRAY_COUNT(UnderbodyVehicles)){
                StartUnderbody(V);
                return false;
            }
            return true;
    }
    return false;
}
}
