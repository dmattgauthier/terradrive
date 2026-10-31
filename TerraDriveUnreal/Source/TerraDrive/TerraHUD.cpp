#include "TerraGameMode.h"
#include "TerraVehicle.h"
#include "TerraControls.h"
#include "TerraUnits.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/World.h"

void ATerraHUD::DrawHUD() {
  Super::DrawHUD();
  VisibleStatusIds.Reset();LastStatusBottom=0;
  auto* V=Cast<ATerraVehicle>(GetOwningPawn());
  if(!bShowHUD||!V||!Canvas||V->Garage||V->PauseMenuOpen)return;
  using A=TerraControls::Action;
  const FLinearColor White(.94f,.97f,.96f),Muted(.61f,.70f,.72f),Mint(.48f,.94f,.72f),Amber(1.f,.76f,.30f);
  const float S=FMath::Min(1.35f,Canvas->SizeX/1280.f),Y=16*S,H=82*S,Gap=6*S;
  struct Card {FString Id,Title,Value,Key;int Icon;bool On;float Width;};
  TArray<Card> Cards;
  auto Add=[&](FString Id,FString Title,FString Value,FString Key,int Icon,bool On,float Width){Cards.Add({Id,Title,Value,Key,Icon,On,Width*S});};
  Add(TEXT("speed"),TEXT("SPEED"),FString::Printf(TEXT("%.0f mph"),TerraUnits::MPH(FMath::Abs(V->Speed))),V->ControlLabel(A::Forward)+TEXT(" / ")+V->ControlLabel(A::Reverse),0,false,126);
  Add(TEXT("rpm"),V->IsElectric()?TEXT("MOTOR RPM"):TEXT("ENGINE RPM"),FString::Printf(TEXT("%.0f"),V->RPM),FString::Printf(TEXT("%s%d"),V->Direction<0?TEXT("R"):TEXT("D"),V->Gear+1),1,false,110);
  const bool Front=V->DrivenWheel(0),Rear=V->DrivenWheel(2);
  const auto Drive=V->DriveCapabilities();
  const FString Mode=Front&&Rear?((V->CenterLockActive()||V->HasRigidTransfer()||(!Drive.Permanent&&!Drive.CenterLocker))?TEXT("4WD"):TEXT("AWD")):Front?TEXT("FWD"):TEXT("RWD");
  Add(TEXT("drive"),TEXT("DRIVE"),Mode,V->HasFourDrive()?(V->DriveCapabilities().Permanent?TEXT("FIXED"):V->ControlLabel(A::FourDrive)):TEXT("STOCK"),2,Front&&Rear,96);
  if(V->HasLowRange())Add(TEXT("range"),TEXT("RANGE"),V->LowRange?TEXT("LOW"):TEXT("HIGH"),V->ControlLabel(A::LowRange),3,V->LowRange,86);
  if(V->HasLocker(true)&&!V->IndependentWheel(0))Add(TEXT("frontLock"),TEXT("FRONT DIFF"),V->FrontLocked?TEXT("LOCKED"):TEXT("OPEN"),V->ControlLabel(A::FrontLock),4,V->FrontLocked,98);
  if(V->HasCenterLocker()||V->HasRigidTransfer())Add(TEXT("centerLock"),TEXT("CENTER"),(V->CenterLockActive()||V->HasRigidTransfer())?TEXT("LOCKED"):TEXT("OPEN"),V->HasRigidTransfer()?V->ControlLabel(A::FourDrive)+TEXT(" AUTO"):V->ControlLabel(A::CenterLock),5,V->CenterLockActive()||V->HasRigidTransfer(),98);
  if(V->HasLocker(false)&&!V->IndependentWheel(2))Add(TEXT("rearLock"),TEXT("REAR DIFF"),V->RearLocked?TEXT("LOCKED"):TEXT("OPEN"),V->ControlLabel(A::RearLock),6,V->RearLocked,98);
  Add(TEXT("pressure"),TEXT("TIRE PRESSURE"),FString::Printf(TEXT("%.0f / %.0f PSI"),V->WheelPressure(0),V->WheelPressure(2)),V->ControlLabel(A::PressureDown)+TEXT(" / ")+V->ControlLabel(A::PressureUp),7,V->TireAirRequested,137);
  if(V->IsElectric())Add(TEXT("battery"),TEXT("BATTERY"),FString::Printf(TEXT("%.0f%%"),V->BatterySOC*100),TEXT("CHARGE"),8,V->BatterySOC<.15f,89);
  Add(TEXT("garage"),TEXT("GARAGE"),TEXT("BUILD"),V->ControlLabel(A::Garage),9,false,81);
  Add(TEXT("menu"),TEXT("MENU"),TEXT("PAUSE"),TEXT("Esc"),10,false,81);
  float Total=Gap*(Cards.Num()-1);for(const auto& C:Cards)Total+=C.Width;
  const float Fit=FMath::Min(1.f,(Canvas->SizeX-24*S)/Total);
  // At 720p every fitted card stays inside the viewport; higher resolutions
  // scale text and line art together rather than stretching bitmap icons.
  const float Q=S*Fit;float X=(Canvas->SizeX-Total*Fit)*.5f;
  auto Text=[&](const FString& T,FLinearColor Color,float PX,float PY,float Size,float Width){
    float TW=0,TH=0;Canvas->StrLen(GEngine->GetSmallFont(),T,TW,TH);
    const float Scale=FMath::Min(Size*Q,Width/FMath::Max(1.f,TW));
    DrawText(T,Color,PX,PY,GEngine->GetSmallFont(),Scale);
  };
  for(const auto& C:Cards){
    VisibleStatusIds.Add(C.Id);const float CW=C.Width*Fit,CH=H*Fit;
    const auto Accent=C.On?Amber:Mint;
    DrawRect(FLinearColor(0,0,0,.20f),X+2*Q,Y+3*Q,CW,CH);
    DrawRect(FLinearColor(.018f,.032f,.038f,.89f),X,Y,CW,CH);
    DrawRect(C.On?Amber:FLinearColor(.20f,.35f,.35f),X,Y,CW,2*Q);
    const float IX=X+19*Q,IY=Y+31*Q;
    auto Line=[&](float AX,float AY,float BX,float BY,FLinearColor Col){DrawLine(IX+AX*Q,IY+AY*Q,IX+BX*Q,IY+BY*Q,Col,1.5f*Q);};
    auto Box=[&](float BX,float BY,float BW,float BH,FLinearColor Col){DrawRect(Col,IX+BX*Q,IY+BY*Q,BW*Q,BH*Q);};
    if(C.Icon==0||C.Icon==1){
      for(int I=0;I<16;++I){const float A0=PI+I*PI/16,A1=PI+(I+1)*PI/16;Line(FMath::Cos(A0)*11,FMath::Sin(A0)*11,FMath::Cos(A1)*11,FMath::Sin(A1)*11,Accent);}
      const float F=C.Icon==0?FMath::Clamp(TerraUnits::MPH(FMath::Abs(V->Speed))/100.f,0.f,1.f):FMath::Clamp(V->RPM/8000.f,0.f,1.f);
      Line(0,0,FMath::Cos(PI+F*PI)*9,FMath::Sin(PI+F*PI)*9,White);Box(-1,-1,2,2,White);
    }else if(C.Icon>=2&&C.Icon<=6){
      Line(-9,-9,9,-9,Muted);Line(-9,9,9,9,Muted);Line(0,-9,0,9,Muted);
      for(int Z=0;Z<2;++Z)for(int Side=-1;Side<=1;Side+=2)Box(Side*10-2,Z?5:-13,4,8,(Z?Rear:Front)?Accent:Muted*.45f);
      if(C.Icon>=4){const float LY=C.Icon==4?-9:C.Icon==6?9:0;
        Box(-4,LY-3,8,6,Accent);Line(-3,LY-3,-3,LY-6,Accent);Line(-3,LY-6,3,LY-6,Accent);if(C.On)Line(3,LY-6,3,LY-3,Accent);
      }else if(C.Icon==3){Line(-5,0,5,0,Accent);Line(0,-5,0,5,Accent);}
    }else if(C.Icon==7){
      Line(-8,-12,8,-12,Accent);Line(-8,12,8,12,Accent);Line(-8,-12,-11,-6,Accent);Line(-11,-6,-11,6,Accent);Line(-11,6,-8,12,Accent);Line(8,-12,11,-6,Accent);Line(11,-6,11,6,Accent);Line(11,6,8,12,Accent);Line(-4,-7,-4,7,Muted);Line(4,-7,4,7,Muted);
    }else if(C.Icon==8){Box(-12,-7,23,14,Muted*.35f);Box(-10,-5,19*V->BatterySOC,10,Accent);Box(11,-3,3,6,Accent);
    }else if(C.Icon==9){Line(-12,-2,0,-12,Accent);Line(0,-12,12,-2,Accent);Line(-9,-3,-9,11,Accent);Line(9,-3,9,11,Accent);Line(-9,11,9,11,Accent);for(int J=0;J<3;++J)Line(-5,2+J*3,5,2+J*3,Muted);
    }else{Box(-7,-10,4,20,Accent);Box(3,-10,4,20,Accent);}
    Text(C.Title,Muted,X+7*Q,Y+8*Q,.73f,CW-14*Q);
    Text(C.Value,C.On?Amber:White,X+36*Q,Y+28*Q,1.12f,CW-41*Q);
    DrawRect(FLinearColor(.09f,.15f,.17f,.96f),X+7*Q,Y+59*Q,CW-14*Q,17*Q);
    Text(C.Key,White,X+12*Q,Y+60*Q,.80f,CW-24*Q);
    X+=CW+Gap*Fit;
  }
  LastStatusBottom=Y+H*Fit;
  FString Details=V->VehicleName+TEXT("   /   ")+V->SurfaceName+TEXT("   /   ")+(V->DamageEnabled?FString::Printf(TEXT("Condition %.0f%%"),(1-V->Damage)*100):TEXT("FREE RUN"));
  if(V->DescentAssist)Details+=TEXT("   /   DESCENT [")+V->ControlLabel(A::DescentAssist)+TEXT("]");
  if(V->Tracks)Details+=TEXT("   /   TRACKS [")+V->ControlLabel(A::Tracks)+TEXT("]");
  if(V->WinchAttached)Details+=FString::Printf(TEXT("   /   WINCH %.0f lbf ["),TerraUnits::PoundsForce(V->WinchTension))+V->ControlLabel(A::WinchReel)+TEXT("]");
  Text(Details,White,20*S,LastStatusBottom+10*S,.83f,Canvas->SizeX-40*S);
  if(!V->RouteStatus.IsEmpty())Text(V->RouteStatus,Muted,20*S,LastStatusBottom+30*S,.8f,Canvas->SizeX-40*S);
  const double Now=GetWorld()->GetRealTimeSeconds();
  if(LastNotice!=V->Notice){LastNotice=V->Notice;NoticeChangedAt=Now;}
  FString Notice=V->Overturned?TEXT("ROLLED OVER  /  Recover [")+V->ControlLabel(A::Recover)+TEXT("]"):(Now-NoticeChangedAt<5?LastNotice:FString());
  if(!Notice.IsEmpty())Text(Notice,Amber,20*S,LastStatusBottom+50*S,.9f,Canvas->SizeX-40*S);
}
