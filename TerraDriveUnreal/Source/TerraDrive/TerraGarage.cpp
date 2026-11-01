#include "TerraGarage.h"
#include "TerraVehicle.h"
#include "TerraUnits.h"
#include "TerraGraphics.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/Layout/SWidgetSwitcher.h"
#include "Widgets/Text/STextBlock.h"
#include "InputCoreTypes.h"

namespace {
const FLinearColor Ink(.035f,.055f,.058f,.96f), Muted(.56f,.65f,.63f), White(.91f,.94f,.90f), Mint(.59f,.88f,.65f);
const FSlateRoundedBoxBrush Panel(Ink,12.f);
const FSlateRoundedBoxBrush Card(FLinearColor::White,7.f);
const FButtonStyle &ButtonStyle() {
  static FButtonStyle S=FButtonStyle().SetNormal(FSlateRoundedBoxBrush(FLinearColor::White,6.f))
    .SetHovered(FSlateRoundedBoxBrush(FLinearColor(1.25f,1.25f,1.25f),6.f))
    .SetPressed(FSlateRoundedBoxBrush(FLinearColor(.75f,.85f,.8f),6.f))
    .SetNormalPadding(FMargin(0)).SetPressedPadding(FMargin(0));
  return S;
}
FSlateFontInfo Font(int Size, bool Bold=false) { return FCoreStyle::GetDefaultFontStyle(Bold?"Bold":"Regular",Size); }
TSharedRef<STextBlock> Label(const FString &S,int Size=12,FLinearColor Color=White,bool Bold=false) {
  return SNew(STextBlock).Text(FText::FromString(S)).Font(Font(Size,Bold)).ColorAndOpacity(Color);
}
const TCHAR* ShortNames[]={TEXT("WRANGLER"),TEXT("BRONCO"),TEXT("CIVIC"),TEXT("SPRINTER"),TEXT("HUMMER EV"),TEXT("URUS"),TEXT("EARTHCRUISER"),TEXT("G 580 EV"),TEXT("AMG G 63")};
const TCHAR* Roles[]={TEXT("RUBICON  /  TECHNICAL CRAWLER"),TEXT("BADLANDS  /  ALL-TERRAIN"),
 TEXT("SPORT  /  LIGHT & AGILE"),TEXT("2500  /  EXPEDITION VAN"),TEXT("3X SUV  /  ELECTRIC TORQUE"),TEXT("PERFORMANTE  /  V8 SUPER SUV"),
 TEXT("EXP98  /  OVERLAND CAB-OVER"),TEXT("EQ TECHNOLOGY  /  FOUR-MOTOR EV"),TEXT("AMG  /  V8 & FACTORY LOCKERS")};
const TCHAR* Notes[]={TEXT("Solid axles, low range and front/rear lockers.\nA deliberate line is your best tool."),
 TEXT("Independent front suspension and locking axles.\nBuilt for speed between the obstacles."),
 TEXT("Lightweight front-wheel drive.\nFind the smooth line and keep momentum."),
 TEXT("Long wheelbase and rear-wheel drive.\nManage clearance and choose wide approaches."),
 TEXT("Electric all-wheel drive and rear steering.\nImmediate torque meets substantial weight."),TEXT("Twin-turbo V8, steel coils and road tires.\nChoose flowing trails over deep rock steps."),
 TEXT("A heavy expedition cabin on leaf-sprung axles.\nUse low range and allow room for the rear overhang."),
 TEXT("Four-wheel motor torque control and low range.\nA heavy electric off-roader with a rear Design Box."),
 TEXT("V8 power, low range and three factory locks.\nSide-exit exhaust and a covered rear spare.")};
static_assert(UE_ARRAY_COUNT(ShortNames)==ATerraVehicle::VehicleCount,"Garage names must match the vehicle roster");
static_assert(UE_ARRAY_COUNT(Roles)==ATerraVehicle::VehicleCount,"Garage roles must match the vehicle roster");
static_assert(UE_ARRAY_COUNT(Notes)==ATerraVehicle::VehicleCount,"Garage notes must match the vehicle roster");

TSharedRef<SWidget> PressureControls(TWeakObjectPtr<ATerraVehicle> Vehicle){
  auto Adjust=[Vehicle](float Delta){if(Vehicle.IsValid())Vehicle->RequestTirePressure(Vehicle->PressureTarget+Delta);return FReply::Handled();};
  return SNew(SBorder).BorderImage(&Card).BorderBackgroundColor(FLinearColor(.055,.09,.09)).Padding(12)
    [SNew(SVerticalBox)
      +SVerticalBox::Slot().AutoHeight()[Label(TEXT("TIRE PRESSURE"),10,Mint,true)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,6)
      [SNew(STextBlock).Text_Lambda([Vehicle]{return FText::FromString(Vehicle.IsValid()?FString::Printf(TEXT("ACTUAL   F %.1f  /  R %.1f PSI"),Vehicle->WheelPressure(0),Vehicle->WheelPressure(2)):TEXT(""));}).Font(Font(11,true)).ColorAndOpacity(White)]
      +SVerticalBox::Slot().AutoHeight()
      [SNew(SHorizontalBox)
        +SHorizontalBox::Slot().AutoWidth()
        [SNew(SButton).ButtonStyle(&ButtonStyle()).ButtonColorAndOpacity(FLinearColor(.14,.23,.21)).ContentPadding(FMargin(11,8))
          .IsEnabled_Lambda([Vehicle]{return Vehicle.IsValid()&&Vehicle->PressureTarget>Vehicle->TireAirBounds().MinimumPSI+.05f;})
          .OnClicked_Lambda([Adjust]{return Adjust(-2.f);})[Label(TEXT("- 2"),12,Mint,true)]]
        +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center).HAlign(HAlign_Center).Padding(6,0)
        [SNew(STextBlock).Text_Lambda([Vehicle]{return FText::FromString(Vehicle.IsValid()?FString::Printf(TEXT("%.0f PSI"),Vehicle->PressureTarget):TEXT(""));}).Font(Font(17,true)).ColorAndOpacity(White)]
        +SHorizontalBox::Slot().AutoWidth()
        [SNew(SButton).ButtonStyle(&ButtonStyle()).ButtonColorAndOpacity(FLinearColor(.14,.23,.21)).ContentPadding(FMargin(11,8))
          .IsEnabled_Lambda([Vehicle]{return Vehicle.IsValid()&&Vehicle->PressureTarget<Vehicle->TireAirBounds().MaximumPSI-.05f;})
          .OnClicked_Lambda([Adjust]{return Adjust(2.f);})[Label(TEXT("+ 2"),12,Mint,true)]]]
      +SVerticalBox::Slot().AutoHeight().Padding(0,7,0,0)
      [SNew(STextBlock).Text_Lambda([Vehicle]{return FText::FromString(Vehicle.IsValid()?Vehicle->TireAirDescription():TEXT(""));}).Font(Font(10,true)).ColorAndOpacity(Mint).AutoWrapText(true)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,5,0,0)
      [SNew(STextBlock).Text_Lambda([Vehicle]{if(!Vehicle.IsValid())return FText::GetEmpty();const auto Bounds=Vehicle->TireAirBounds();return FText::FromString(FString::Printf(TEXT("Front target range %.0f-%.0f PSI\nRear follows its axle pressure setup."),Bounds.MinimumPSI,Bounds.MaximumPSI));}).Font(Font(9)).ColorAndOpacity(Muted).AutoWrapText(true)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,8,0,0)
      [SNew(SButton).ButtonStyle(&ButtonStyle()).ButtonColorAndOpacity(FLinearColor(.12,.20,.19)).ContentPadding(FMargin(8,7)).HAlign(HAlign_Center)
        .IsEnabled_Lambda([Vehicle]{return Vehicle.IsValid();})
        .OnClicked_Lambda([Vehicle]{if(Vehicle.IsValid())Vehicle->RequestTirePressure(Vehicle->TireAirBounds().RoadPSI);return FReply::Handled();})[Label(TEXT("ROAD PRESSURE"),10,White,true)]]
      +SVerticalBox::Slot().AutoHeight().Padding(0,7,0,0)
      [SNew(STextBlock).Text(FText::FromString(TEXT("Garage service adjusts immediately. On the trail, fitted air control sets flow and speed limits."))).Font(Font(9)).ColorAndOpacity(Muted).AutoWrapText(true)]];
}
}
class STerraVehiclePreview : public SCompoundWidget {
public:
  SLATE_BEGIN_ARGS(STerraVehiclePreview){} SLATE_ARGUMENT(ATerraVehicle*,Vehicle) SLATE_END_ARGS()
  void Construct(const FArguments &Args){
    Vehicle=Args._Vehicle;
    auto Views=SNew(SHorizontalBox);
    const TCHAR* Names[]={TEXT("RESET"),TEXT("FRONT"),TEXT("SIDE"),TEXT("REAR")};
    for(int I=0;I<4;++I)Views->AddSlot().FillWidth(1).Padding(2)
      [SNew(SButton).ButtonStyle(&ButtonStyle()).ButtonColorAndOpacity(FLinearColor(.14,.22,.20)).ContentPadding(FMargin(5,8)).HAlign(HAlign_Center)
        .OnClicked_Lambda([this,I]{if(Vehicle.IsValid())Vehicle->SetGarageView(I);return FReply::Handled();})[Label(Names[I],9,Mint,true)]];
    ChildSlot[SNew(SOverlay)
      +SOverlay::Slot()[SNew(SBorder).BorderImage(FCoreStyle::Get().GetBrush("NoBrush"))[SNew(SSpacer)]]
      +SOverlay::Slot().VAlign(VAlign_Bottom)
      [SNew(SBorder).BorderImage(&Panel).Padding(10)
        [SNew(SVerticalBox)
          +SVerticalBox::Slot().AutoHeight()[Label(TEXT("DRAG TO ORBIT  /  SCROLL TO ZOOM"),10,Mint,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,6,0,0)[Views]]]];
  }
  virtual FReply OnMouseButtonDown(const FGeometry&,const FPointerEvent &E) override{
    if(E.GetEffectingButton()==EKeys::LeftMouseButton||E.GetEffectingButton()==EKeys::RightMouseButton)
      return FReply::Handled().CaptureMouse(AsShared());
    return FReply::Unhandled();
  }
  virtual FReply OnMouseButtonUp(const FGeometry&,const FPointerEvent&) override{
    return HasMouseCapture()?FReply::Handled().ReleaseMouseCapture():FReply::Unhandled();
  }
  virtual FReply OnMouseMove(const FGeometry&,const FPointerEvent &E) override{
    if(!HasMouseCapture())return FReply::Unhandled();
    if(Vehicle.IsValid())Vehicle->OrbitGarageCamera(-E.GetCursorDelta().X*.30f,-E.GetCursorDelta().Y*.24f);
    return FReply::Handled();
  }
  virtual FReply OnMouseWheel(const FGeometry&,const FPointerEvent &E) override{
    if(Vehicle.IsValid())Vehicle->ZoomGarageCamera(E.GetWheelDelta());return FReply::Handled();
  }
private:
  TWeakObjectPtr<ATerraVehicle> Vehicle;
};
void STerraGarage::Construct(const FArguments &Args) {
  Vehicle=Args._Vehicle;
  ChildSlot[
    SNew(SScaleBox).Stretch(EStretch::ScaleToFit)
    [SNew(SBox).WidthOverride(1280).HeightOverride(720)
      [SNew(SVerticalBox)
        +SVerticalBox::Slot().AutoHeight().Padding(28,22,28,14)
        [SNew(SHorizontalBox)
          +SHorizontalBox::Slot().FillWidth(1)[SNew(SVerticalBox)
            +SVerticalBox::Slot().AutoHeight()[Label(TEXT("TERRA DRIVE"),27,White,true)]
            +SVerticalBox::Slot().AutoHeight().Padding(1,3)[Label(TEXT("BUILD YOUR WAY THROUGH"),10,Mint,true)]]
          +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(5,0)
          [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(16,10)).ButtonColorAndOpacity_Lambda([this]{return Page==0?FLinearColor(.22,.38,.29):Ink;})
            .OnClicked_Lambda([this]{Page=0;Pages->SetActiveWidgetIndex(0);return FReply::Handled();})[Label(TEXT("01   VEHICLES"),13,White,true)]]
          +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(5,0)
          [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(16,10)).ButtonColorAndOpacity_Lambda([this]{return Page==1?FLinearColor(.22,.38,.29):Ink;})
            .OnClicked_Lambda([this]{Page=1;Pages->SetActiveWidgetIndex(1);return FReply::Handled();})[Label(TEXT("02   UPGRADES"),13,White,true)]]
          +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(5,0)
          [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(16,10)).ButtonColorAndOpacity_Lambda([this]{return Page==2?FLinearColor(.22,.38,.29):Ink;})
            .OnClicked_Lambda([this]{Page=2;Pages->SetActiveWidgetIndex(2);return FReply::Handled();})[Label(TEXT("03   GRAPHICS"),13,White,true)]]]
        +SVerticalBox::Slot().FillHeight(1).Padding(28,0)
        [SAssignNew(Pages,SWidgetSwitcher)
          +SWidgetSwitcher::Slot()[VehiclePage()]
          +SWidgetSwitcher::Slot()[UpgradePage()]
          +SWidgetSwitcher::Slot()[GraphicsPage()]]
        +SVerticalBox::Slot().AutoHeight().Padding(28,10,28,0)[EnergyControls(Args._Vehicle)]
        +SVerticalBox::Slot().AutoHeight().Padding(28,10,28,0)
        [SNew(SBorder).BorderImage(&Panel).Padding(12,8)
          [SNew(SHorizontalBox)
            +SHorizontalBox::Slot().AutoWidth()
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(14,9))
              .ButtonColorAndOpacity_Lambda([this]{return Vehicle.IsValid()&&Vehicle->DamageEnabled?FLinearColor(.28,.20,.12):FLinearColor(.15,.30,.22);})
              .OnClicked_Lambda([this]{if(Vehicle.IsValid())Vehicle->SetDamageEnabled(!Vehicle->DamageEnabled);return FReply::Handled();})
              [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()&&Vehicle->DamageEnabled?TEXT("DAMAGE ON"):TEXT("FREE RUN / DAMAGE OFF"));}).Font(Font(11,true)).ColorAndOpacity(White)]]
            +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center).Padding(16,0)
            [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->DamageDescription():TEXT(""));}).Font(Font(11)).ColorAndOpacity(Muted).AutoWrapText(true)]
            +SHorizontalBox::Slot().AutoWidth()
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(14,9)).ButtonColorAndOpacity(FLinearColor(.14,.23,.21))
              .OnClicked_Lambda([this]{if(Vehicle.IsValid())Vehicle->RepairDamage();return FReply::Handled();})[Label(TEXT("REPAIR VEHICLE"),11,Mint,true)]]]]
        +SVerticalBox::Slot().AutoHeight().Padding(28,16,28,22)
        [SNew(SBorder).BorderImage(&Panel).Padding(18,12)
          [SNew(SHorizontalBox)
            +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center)
            [SNew(SVerticalBox)
              +SVerticalBox::Slot().AutoHeight()[Label(TEXT("YOUR GARAGE. YOUR SETUP."),12,Mint,true)]
              +SVerticalBox::Slot().AutoHeight().Padding(0,4)[SNew(STextBlock).Text_Lambda([this]{return FText::FromString(TEXT("Saved per vehicle  /  ")+(Vehicle.IsValid()?Vehicle->ControlLabel(TerraControls::Action::Garage):TEXT("V"))+TEXT(" or Tab to drive  /  Esc menu"));}).Font(Font(11)).ColorAndOpacity(Muted)]]
            +SHorizontalBox::Slot().AutoWidth().Padding(12,0)
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(16,12)).VAlign(VAlign_Center).ButtonColorAndOpacity(FLinearColor(.14,.20,.19))
              .OnClicked_Lambda([this]{if(Vehicle.IsValid())Vehicle->ResetUpgrades();return FReply::Handled();})
              [Label(TEXT("RESET TO STOCK"),11)]]
            +SHorizontalBox::Slot().AutoWidth()
            [SNew(SButton).ButtonStyle(&ButtonStyle()).ButtonColorAndOpacity(Mint)
              .ContentPadding(FMargin(28,14))
              .OnClicked_Lambda([this]{if(Vehicle.IsValid())Vehicle->SetGarage(false);return FReply::Handled();})
              [Label(TEXT("LET'S DRIVE   >"),14,FLinearColor(.025,.06,.04),true)]]]]
      ]]];
  if(FParse::Param(FCommandLine::Get(),TEXT("TerraRenderOnly"))){Page=2;Pages->SetActiveWidgetIndex(2);}
}
TSharedRef<SWidget> STerraGarage::EnergyControls(ATerraVehicle* Pawn){
  TWeakObjectPtr<ATerraVehicle> V=Pawn;
  return SNew(SBorder).BorderImage(&Panel).Padding(12,8)
    [SNew(SHorizontalBox)
      +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
      [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(12,10))
        .ButtonColorAndOpacity_Lambda([V]{return V.IsValid()&&V->EnergyUsageEnabled?FLinearColor(.14,.23,.21):FLinearColor(.15,.30,.22);})
        .OnClicked_Lambda([V]{if(V.IsValid())V->SetEnergyUsageEnabled(!V->EnergyUsageEnabled);return FReply::Handled();})
        [SNew(STextBlock).Text_Lambda([V]{return FText::FromString(V.IsValid()&&V->EnergyUsageEnabled?TEXT("FUEL / CHARGE USE: ON"):TEXT("UNLIMITED FUEL / CHARGE"));}).Font(Font(11,true)).ColorAndOpacity(White)]]
      +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center).Padding(14,0)
      [SNew(STextBlock).Text_Lambda([V]{return FText::FromString(V.IsValid()?V->EnergyDescription():TEXT(""));}).Font(Font(11)).ColorAndOpacity(Muted).AutoWrapText(true)]
      +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
      [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(12,10)).ButtonColorAndOpacity(FLinearColor(.14,.23,.21))
        .IsEnabled_Lambda([V]{return V.IsValid()&&V->CanServiceEnergy();})
        .ToolTipText(FText::FromString(TEXT("Stop upright to instantly charge the battery or fill the tank.")))
        .OnClicked_Lambda([V]{if(V.IsValid())V->ServiceEnergy();return FReply::Handled();})
        [SNew(STextBlock).Text_Lambda([V]{return FText::FromString(V.IsValid()&&V->IsElectric()?TEXT("CHARGE TO 100%"):TEXT("FILL FUEL TANK"));}).Font(Font(11,true)).ColorAndOpacity(Mint)]]];
}
TSharedRef<SWidget> STerraGarage::GraphicsPage(){
  auto Options=SNew(SVerticalBox);
  const TCHAR *Names[]={TEXT("COOL   /   30 FPS"),TEXT("BALANCED   /   45 FPS"),TEXT("QUALITY   /   60 FPS")};
  const TCHAR *Details[]={TEXT("Recommended for lower GPU load. 75% internal resolution, lighter shadows, screen-space GI and reflections off."),
    TEXT("Smoother driving. 85% internal resolution, medium shadows and simple reflections. Uses more GPU power than Cool."),
    TEXT("Full internal resolution, higher shadows, screen-space GI and reflections. Highest GPU demand.")};
  for(int I=0;I<3;++I)Options->AddSlot().AutoHeight().Padding(0,0,0,14)
    [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(22)
      .ButtonColorAndOpacity_Lambda([I]{return TerraGraphics::Preset()==I?FLinearColor(.19,.33,.26):Ink;})
      .OnClicked_Lambda([I]{TerraGraphics::Select(I);return FReply::Handled();})
      [SNew(SVerticalBox)
        +SVerticalBox::Slot().AutoHeight()[Label(Names[I],19,Mint,true)]
        +SVerticalBox::Slot().AutoHeight().Padding(0,10,0,0)[SNew(STextBlock).Text(FText::FromString(Details[I])).Font(Font(13)).ColorAndOpacity(White).AutoWrapText(true)]]];
  return SNew(SHorizontalBox)
    +SHorizontalBox::Slot().FillWidth(1.5).Padding(0,0,24,0)[Options]
    +SHorizontalBox::Slot().FillWidth(1)
    [SNew(SBorder).BorderImage(&Panel).Padding(26)
      [SNew(SVerticalBox)
        +SVerticalBox::Slot().AutoHeight()[Label(TEXT("RENDERING & POWER"),16,Mint,true)]
        +SVerticalBox::Slot().AutoHeight().Padding(0,18)[SNew(STextBlock).Text_Lambda([]{return FText::FromString(TerraGraphics::Name());}).Font(Font(22,true)).ColorAndOpacity(White)]
        +SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text(FText::FromString(TEXT("Changes apply immediately and are saved.\n\nGarage previews are capped at 20 FPS. An unfocused game window is capped at 15 FPS.\n\nTerrain ruts, crushed grass, vehicle physics and textures remain available in every preset.\n\nA lower cap reduces rendering work; it cannot guarantee a particular GPU temperature."))).Font(Font(14)).ColorAndOpacity(Muted).AutoWrapText(true)]]];
}
FReply STerraGarage::OnPreviewKeyDown(const FGeometry& Geometry,const FKeyEvent &Event){
  // Camera keys must work after a child button acquires keyboard focus.
  return OnKeyDown(Geometry,Event);
}
FReply STerraGarage::OnKeyDown(const FGeometry&,const FKeyEvent &Event) {
  if(Event.GetKey()==EKeys::Escape){
    if(Vehicle.IsValid())Vehicle->SetPauseMenu(true);
    return FReply::Handled();
  }
  if(Event.GetKey()==EKeys::Tab||(Vehicle.IsValid()&&Event.GetKey()==Vehicle->ControlKey(TerraControls::Action::Garage))){
    if(Vehicle.IsValid())Vehicle->SetGarage(false);
    return FReply::Handled();
  }
  if(Vehicle.IsValid()){
    const auto K=Event.GetKey();
    if(K==EKeys::Left||K==EKeys::Right){Vehicle->OrbitGarageCamera(K==EKeys::Left?15:-15,0);return FReply::Handled();}
    if(K==EKeys::Up||K==EKeys::Down){Vehicle->OrbitGarageCamera(0,K==EKeys::Up?-8:8);return FReply::Handled();}
    if(K==EKeys::PageUp||K==EKeys::PageDown){Vehicle->ZoomGarageCamera(K==EKeys::PageUp?1:-1);return FReply::Handled();}
  }
  return FReply::Unhandled();
}
TSharedRef<SWidget> STerraGarage::Metric(const FString &Name,TAttribute<FText> Value) {
  return SNew(SVerticalBox)
    +SVerticalBox::Slot().AutoHeight()[Label(Name,10,Muted,true)]
    +SVerticalBox::Slot().AutoHeight().Padding(0,4,0,10)
      [SNew(STextBlock).Text(Value).Font(Font(21,true)).ColorAndOpacity(White)];
}
TSharedRef<SWidget> STerraGarage::VehiclePage() {
  auto List=SNew(SVerticalBox);
  for(int I=0;I<ATerraVehicle::VehicleCount;++I) {
    List->AddSlot().AutoHeight().Padding(0,0,0,8)
    [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(18,10))
      .ButtonColorAndOpacity_Lambda([this,I]{return Vehicle.IsValid()&&Vehicle->VehicleIndex==I?FLinearColor(.19,.33,.26):Ink;})
      .OnClicked_Lambda([this,I]{if(Vehicle.IsValid())Vehicle->SelectVehicle(I);return FReply::Handled();})
      [SNew(SVerticalBox)
        +SVerticalBox::Slot().AutoHeight()
        [SNew(SHorizontalBox)
          +SHorizontalBox::Slot().FillWidth(1)[Label(ShortNames[I],19,White,true)]
          +SHorizontalBox::Slot().AutoWidth()[SNew(STextBlock).Text_Lambda([this,I]{return FText::FromString(Vehicle.IsValid()&&Vehicle->VehicleIndex==I?TEXT("SELECTED"):TEXT(""));}).Font(Font(9,true)).ColorAndOpacity(Mint)]]
        +SVerticalBox::Slot().AutoHeight().Padding(0,5,0,0)[Label(Roles[I],9,Muted)]]];
  }
  return SNew(SHorizontalBox)
    +SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(322)
      [SNew(SVerticalBox)
        +SVerticalBox::Slot().AutoHeight().Padding(4,0,0,10)[Label(TEXT("CHOOSE YOUR VEHICLE"),12,Mint,true)]
        +SVerticalBox::Slot().FillHeight(1)[SNew(SScrollBox)+SScrollBox::Slot()[List]]
        +SVerticalBox::Slot().AutoHeight().Padding(4,6,0,0)[Label(TEXT("SCROLL FOR ALL NINE VEHICLES"),9,Muted)]]]
    +SHorizontalBox::Slot().FillWidth(1).Padding(20,0)
      [SNew(STerraVehiclePreview).Vehicle(Vehicle.Get())]
    +SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(285)
      [SNew(SBorder).BorderImage(&Panel).Padding(20)
        [SNew(SScrollBox)+SScrollBox::Slot()[SNew(SVerticalBox)
          +SVerticalBox::Slot().AutoHeight()[Label(TEXT("READY FOR THE NEXT LINE"),10,Mint,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,12,0,14)
          [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->VehicleName:TEXT(""));}).Font(Font(23,true)).ColorAndOpacity(White).WrapTextAt(228)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,4)[Label(TEXT("FACTORY CHARACTER"),9,Muted,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,14)
          [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Notes[FMath::Clamp(Vehicle.IsValid()?Vehicle->VehicleIndex:0,0,ATerraVehicle::VehicleCount-1)]);}).Font(Font(12)).ColorAndOpacity(Muted).AutoWrapText(true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,4)[Label(TEXT("CURRENT POWERTRAIN"),9,Muted,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,12)
          [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->PowertrainDescription():TEXT(""));}).Font(Font(11,true)).ColorAndOpacity(Mint).AutoWrapText(true)]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("OUTPUT"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f hp"),Vehicle.IsValid()?Vehicle->PowerHP():0));}))]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("WEIGHT"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f lb"),Vehicle.IsValid()?TerraUnits::Pounds(Vehicle->Mass):0));}))]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("TIRE DIAMETER"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.1f in"),Vehicle.IsValid()?Vehicle->TireDiameter():0));}))]
          +SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->TireAirDescription():TEXT(""));}).Font(Font(10)).ColorAndOpacity(Muted).AutoWrapText(true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,14,0,0)
          [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(12,10)).ButtonColorAndOpacity(FLinearColor(.18,.3,.24))
            .OnClicked_Lambda([this]{Page=1;Pages->SetActiveWidgetIndex(1);return FReply::Handled();})[Label(TEXT("BUILD THIS VEHICLE   >"),12,Mint,true)]]
        ]]]];
}
TSharedRef<SWidget> STerraGarage::UpgradeRow(int Part) {
  auto Stages=SNew(SHorizontalBox);
  for(int S=0;S<4;++S){
    Stages->AddSlot().AutoWidth().Padding(3,0)
    [SNew(SBox).WidthOverride(S==0?64:Part==TerraSim::CenterDifferential?96:Part>=TerraSim::Drivetrain?59:46).HeightOverride(34)
      [SNew(SButton).ButtonStyle(&ButtonStyle()).HAlign(HAlign_Center).VAlign(VAlign_Center)
        .IsEnabled_Lambda([this,Part,S]{return Vehicle.IsValid()&&(Part!=TerraSim::Electrical||Vehicle->HasElectrical())&&(Part!=TerraSim::CenterDifferential||S==0||Vehicle->CenterLockUpgradeAvailable());})
        .ButtonColorAndOpacity_Lambda([this,Part,S]{return Vehicle.IsValid()&&Vehicle->UpgradeStage(Part)==S?FLinearColor(.28,.49,.34):FLinearColor(.07,.10,.11);})
        .OnClicked_Lambda([this,Part,S]{if(Vehicle.IsValid())Vehicle->SetUpgrade(Part,S);return FReply::Handled();})
        [SNew(STextBlock).Text_Lambda([this,Part,S]{return FText::FromString(Vehicle.IsValid()?Vehicle->UpgradeStageName(Part,S):TEXT(""));}).Font(Font(10,true)).ColorAndOpacity(White)]]];
  }
  return SNew(SBorder).BorderImage(&Card).BorderBackgroundColor(FLinearColor(.055,.08,.083,.98)).Padding(14,4)
    [SNew(SHorizontalBox)
      +SHorizontalBox::Slot().FillWidth(1)
      [SNew(SVerticalBox)
        +SVerticalBox::Slot().AutoHeight()
        [SNew(STextBlock).Text_Lambda([this,Part]{return FText::FromString(Vehicle.IsValid()?Vehicle->UpgradeName(Part):TEXT(""));}).Font(Font(13,true)).ColorAndOpacity(White)]
        +SVerticalBox::Slot().AutoHeight().Padding(0,2)
        [SNew(STextBlock).Text_Lambda([this,Part]{return FText::FromString(Vehicle.IsValid()?Vehicle->UpgradeDescription(Part):TEXT(""));}).Font(Font(10)).ColorAndOpacity(Muted).AutoWrapText(true)]
        +SVerticalBox::Slot().AutoHeight()
        [SNew(STextBlock).Text_Lambda([this,Part]{return FText::FromString(Vehicle.IsValid()?Vehicle->UpgradeEffect(Part):TEXT(""));}).Font(Font(10,true)).ColorAndOpacity(Mint).AutoWrapText(true)]]
      +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(12,0)[Stages]];
}
TSharedRef<SWidget> STerraGarage::UpgradePage() {
  auto Rows=SNew(SVerticalBox);
  UpgradeRows.Reset();
  for(int I=0;I<TerraSim::PartCount;++I){
    if(I==0||I==TerraSim::Drivetrain)Rows->AddSlot().AutoHeight().Padding(3,I?14:0,0,8)
      [Label(I?TEXT("DRIVE, ENERGY & AIR"):TEXT("CHASSIS & GRIP"),10,Mint,true)];
    auto Row=UpgradeRow(I);UpgradeRows.Add(Row);
    Rows->AddSlot().AutoHeight().Padding(0,0,0,6)[Row];
  }
  auto Sheet=SNew(SVerticalBox)
    +SVerticalBox::Slot().AutoHeight()[Label(TEXT("THE BUILD SHEET"),11,Mint,true)]
    +SVerticalBox::Slot().AutoHeight().Padding(0,10,0,14)
    [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->VehicleName:TEXT(""));}).Font(Font(22,true)).ColorAndOpacity(White).AutoWrapText(true)]
    +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("POWER"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f hp"),Vehicle.IsValid()?Vehicle->PowerHP():0));}))]
    +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("TIRE GRIP"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("+%.0f%%"),Vehicle.IsValid()?(Vehicle->GripMultiplier()-1)*100:0));}))]
    +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("RUNNING WEIGHT"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f lb"),Vehicle.IsValid()?TerraUnits::Pounds(Vehicle->Mass):0));}))]
    +SVerticalBox::Slot().AutoHeight()[Label(TEXT("POWERTRAIN"),10,Muted,true)]
    +SVerticalBox::Slot().AutoHeight().Padding(0,4,0,10)
    [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->PowertrainDescription():TEXT(""));}).Font(Font(12,true)).ColorAndOpacity(Mint).AutoWrapText(true)]
    +SVerticalBox::Slot().AutoHeight()[Label(TEXT("DRIVE SELECTED"),10,Muted,true)]
    +SVerticalBox::Slot().AutoHeight().Padding(0,4,0,14)
    [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->DriveDescription():TEXT(""));}).Font(Font(12,true)).ColorAndOpacity(White).AutoWrapText(true)]
    +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,14)[PressureControls(Vehicle)]
    +SVerticalBox::Slot().AutoHeight()[Label(TEXT("I   TRAIL   /   II   EXPEDITION\nIII   COMPETITION"),10,Mint,true)]
    +SVerticalBox::Slot().AutoHeight().Padding(0,9,0,0)
    [SNew(STextBlock).Text(FText::FromString(TEXT("Changes apply immediately. Each vehicle remembers its build and pressure target."))).Font(Font(10)).ColorAndOpacity(Muted).AutoWrapText(true)];
  return SNew(SHorizontalBox)
    +SHorizontalBox::Slot().AutoWidth().Padding(0,0,20,0)[SNew(SBox).WidthOverride(295)
      [SNew(SBorder).BorderImage(&Panel).Padding(20)[SNew(SScrollBox)+SScrollBox::Slot()[Sheet]]]]
    +SHorizontalBox::Slot().FillWidth(1)
      [SNew(SVerticalBox)
        +SVerticalBox::Slot().AutoHeight().Padding(3,0,0,8)[Label(FString::Printf(TEXT("%d UPGRADE SYSTEMS   /   STOCK + THREE STAGES"),int(TerraSim::PartCount)),11,Mint,true)]
        +SVerticalBox::Slot().FillHeight(1)[SAssignNew(UpgradeScroll,SScrollBox)+SScrollBox::Slot()[Rows]]];
}
void STerraGarage::ShowUpgradePart(int Part){
  if(!Pages.IsValid()||!UpgradeScroll.IsValid()||!UpgradeRows.IsValidIndex(Part))return;
  Page=1;Pages->SetActiveWidgetIndex(1);
  PendingUpgradePart=Part;UpgradeScrollAttempts=8;
  // The final row can grow after a vehicle change. Resolve the end offset
  // after Slate lays out the new descriptions, rather than using old geometry.
  if(Part==TerraSim::PartCount-1)UpgradeScroll->ScrollToEnd();
  else UpgradeScroll->ScrollDescendantIntoView(UpgradeRows[Part],false,EDescendantScrollDestination::Center);
}
void STerraGarage::Tick(const FGeometry& Geometry,const double Time,const float Dt){
  SCompoundWidget::Tick(Geometry,Time,Dt);
  if(Page!=1||!UpgradeScroll.IsValid()||!UpgradeRows.IsValidIndex(PendingUpgradePart))return;
  const auto& R=UpgradeRows[PendingUpgradePart]->GetCachedGeometry();const auto& S=UpgradeScroll->GetCachedGeometry();
  const auto RT=R.LocalToAbsolute(FVector2D::ZeroVector),RB=R.LocalToAbsolute(R.GetLocalSize());
  const auto ST=S.LocalToAbsolute(FVector2D::ZeroVector),SB=S.LocalToAbsolute(S.GetLocalSize());
  if(Vehicle.IsValid()&&Vehicle->AutoTest)UE_LOG(LogTemp,Display,TEXT("TERRA_UPGRADE_SCROLL part=%d remaining=%d rowHeight=%.3f rowTop=%.3f rowBottom=%.3f viewportTop=%.3f viewportBottom=%.3f"),PendingUpgradePart,UpgradeScrollAttempts,R.GetLocalSize().Y,RT.Y,RB.Y,ST.Y,SB.Y);
  if(UpgradeScrollAttempts--<=0){PendingUpgradePart=-1;return;}
  // Auto-wrapped descriptions acquire their final height after the first
  // visible layout. Keep the requested row in view through that short change.
  if(PendingUpgradePart==TerraSim::PartCount-1)UpgradeScroll->ScrollToEnd();
  else UpgradeScroll->ScrollDescendantIntoView(UpgradeRows[PendingUpgradePart],false,EDescendantScrollDestination::Center);
}
