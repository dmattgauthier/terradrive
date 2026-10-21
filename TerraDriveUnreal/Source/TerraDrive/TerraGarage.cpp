#include "TerraGarage.h"
#include "TerraVehicle.h"
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
const TCHAR* ShortNames[]={TEXT("WRANGLER"),TEXT("BRONCO"),TEXT("CIVIC"),TEXT("SPRINTER"),TEXT("HUMMER EV")};
const TCHAR* Roles[]={TEXT("RUBICON  /  TECHNICAL CRAWLER"),TEXT("BADLANDS  /  ALL-TERRAIN"),
 TEXT("SPORT  /  LIGHT & AGILE"),TEXT("2500  /  EXPEDITION VAN"),TEXT("3X SUV  /  ELECTRIC TORQUE")};
const TCHAR* Notes[]={TEXT("Solid axles, low range and front/rear lockers.\nA deliberate line is your best tool."),
 TEXT("Independent front suspension and locking axles.\nBuilt for speed between the obstacles."),
 TEXT("Lightweight front-wheel drive.\nFind the smooth line and keep momentum."),
 TEXT("Long wheelbase and rear-wheel drive.\nManage clearance and choose wide approaches."),
 TEXT("Electric all-wheel drive and rear steering.\nImmediate torque meets substantial weight.")};
}
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
            .OnClicked_Lambda([this]{Page=1;Pages->SetActiveWidgetIndex(1);return FReply::Handled();})[Label(TEXT("02   UPGRADES"),13,White,true)]]]
        +SVerticalBox::Slot().FillHeight(1).Padding(28,0)
        [SAssignNew(Pages,SWidgetSwitcher)
          +SWidgetSwitcher::Slot()[VehiclePage()]
          +SWidgetSwitcher::Slot()[UpgradePage()]]
        +SVerticalBox::Slot().AutoHeight().Padding(28,16,28,22)
        [SNew(SBorder).BorderImage(&Panel).Padding(18,12)
          [SNew(SHorizontalBox)
            +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center)
            [SNew(SVerticalBox)
              +SVerticalBox::Slot().AutoHeight()[Label(TEXT("YOUR GARAGE. YOUR SETUP."),12,Mint,true)]
              +SVerticalBox::Slot().AutoHeight().Padding(0,4)[Label(TEXT("All stages available  /  Saved per vehicle  /  Tab or Esc to drive"),11,Muted)]]
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
}
FReply STerraGarage::OnKeyDown(const FGeometry&,const FKeyEvent &Event) {
  if(Event.GetKey()==EKeys::Tab||Event.GetKey()==EKeys::Escape){
    if(Vehicle.IsValid())Vehicle->SetGarage(false);
    return FReply::Handled();
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
  List->AddSlot().AutoHeight().Padding(4,0,0,12)[Label(TEXT("CHOOSE YOUR VEHICLE"),12,Mint,true)];
  for(int I=0;I<5;++I) {
    List->AddSlot().AutoHeight().Padding(0,0,0,8)
    [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(18,15))
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
    +SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(322)[List]]
    +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Bottom).Padding(20)
      [SNew(SBorder).BorderImage(&Panel).Padding(14)
        [Label(TEXT("Live vehicle preview"),11,Mint)]]
    +SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(285)
      [SNew(SBorder).BorderImage(&Panel).Padding(24)
        [SNew(SVerticalBox)
          +SVerticalBox::Slot().AutoHeight()[Label(TEXT("READY FOR THE NEXT LINE"),10,Mint,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,12,0,14)
          [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->VehicleName:TEXT(""));}).Font(Font(23,true)).ColorAndOpacity(White).AutoWrapText(true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,18)
          [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Notes[Vehicle.IsValid()?Vehicle->VehicleIndex:0]);}).Font(Font(12)).ColorAndOpacity(Muted).AutoWrapText(true)]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("OUTPUT"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f hp"),Vehicle.IsValid()?Vehicle->PowerHP():0));}))]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("MASS"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f kg"),Vehicle.IsValid()?Vehicle->Mass:0));}))]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("TIRE DIAMETER"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.1f in"),Vehicle.IsValid()?Vehicle->TireDiameter():0));}))]
          +SVerticalBox::Slot().FillHeight(1)[SNew(SSpacer)]
          +SVerticalBox::Slot().AutoHeight()
          [SNew(SButton).ButtonStyle(&ButtonStyle()).ContentPadding(FMargin(12,10)).ButtonColorAndOpacity(FLinearColor(.18,.3,.24))
            .OnClicked_Lambda([this]{Page=1;Pages->SetActiveWidgetIndex(1);return FReply::Handled();})[Label(TEXT("BUILD THIS VEHICLE   >"),12,Mint,true)]]
        ]]];
}
TSharedRef<SWidget> STerraGarage::UpgradeRow(int Part) {
  auto Stages=SNew(SHorizontalBox);
  const TCHAR* Names[]={TEXT("STOCK"),TEXT("I"),TEXT("II"),TEXT("III")};
  for(int S=0;S<4;++S){
    Stages->AddSlot().AutoWidth().Padding(3,0)
    [SNew(SBox).WidthOverride(S==0?64:46).HeightOverride(34)
      [SNew(SButton).ButtonStyle(&ButtonStyle()).HAlign(HAlign_Center).VAlign(VAlign_Center)
        .IsEnabled_Lambda([this,Part]{return Vehicle.IsValid()&&(Part!=TerraSim::Electrical||Vehicle->HasElectrical());})
        .ButtonColorAndOpacity_Lambda([this,Part,S]{return Vehicle.IsValid()&&Vehicle->UpgradeStage(Part)==S?FLinearColor(.28,.49,.34):FLinearColor(.07,.10,.11);})
        .OnClicked_Lambda([this,Part,S]{if(Vehicle.IsValid())Vehicle->SetUpgrade(Part,S);return FReply::Handled();})
        [Label(Names[S],11,White,true)]]];
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
        [SNew(STextBlock).Text_Lambda([this,Part]{return FText::FromString(Vehicle.IsValid()?Vehicle->UpgradeEffect(Part):TEXT(""));}).Font(Font(10,true)).ColorAndOpacity(Mint)]]
      +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(12,0)[Stages]];
}
TSharedRef<SWidget> STerraGarage::UpgradePage() {
  auto Rows=SNew(SVerticalBox);
  for(int I=0;I<TerraSim::PartCount;++I) Rows->AddSlot().AutoHeight().Padding(0,0,0,5)[UpgradeRow(I)];
  return SNew(SHorizontalBox)
    +SHorizontalBox::Slot().AutoWidth().Padding(0,0,20,0)[SNew(SBox).WidthOverride(295)
      [SNew(SBorder).BorderImage(&Panel).Padding(24)
        [SNew(SVerticalBox)
          +SVerticalBox::Slot().AutoHeight()[Label(TEXT("THE BUILD SHEET"),11,Mint,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,12,0,22)
          [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->VehicleName:TEXT(""));}).Font(Font(24,true)).ColorAndOpacity(White).AutoWrapText(true)]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("POWER"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f hp"),Vehicle.IsValid()?Vehicle->PowerHP():0));}))]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("TIRE GRIP"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("+%.0f%%"),Vehicle.IsValid()?(Vehicle->GripMultiplier()-1)*100:0));}))]
          +SVerticalBox::Slot().AutoHeight()[Metric(TEXT("RUNNING MASS"),TAttribute<FText>::CreateLambda([this]{return FText::FromString(FString::Printf(TEXT("%.0f kg"),Vehicle.IsValid()?Vehicle->Mass:0));}))]
          +SVerticalBox::Slot().FillHeight(1)[SNew(SSpacer)]
          +SVerticalBox::Slot().AutoHeight()[Label(TEXT("I    TRAIL\nII   EXPEDITION\nIII  COMPETITION"),12,Mint,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,14,0,0)
          [SNew(STextBlock).Text(FText::FromString(TEXT("Changes apply immediately.\nChoose stock at any time.\nEach vehicle remembers its build."))).Font(Font(11)).ColorAndOpacity(Muted).AutoWrapText(true)]
        ]]]
    +SHorizontalBox::Slot().FillWidth(1)
      [SNew(SScrollBox)+SScrollBox::Slot()[Rows]];
}
