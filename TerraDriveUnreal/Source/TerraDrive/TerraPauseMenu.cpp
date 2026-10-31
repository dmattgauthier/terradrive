#include "TerraPauseMenu.h"
#include "TerraVehicle.h"
#include "TerraGarage.h"
#include "TerraGraphics.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "Misc/App.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWidgetSwitcher.h"
#include "Widgets/Text/STextBlock.h"

namespace {
const FLinearColor White(.94f,.96f,.94f),Muted(.63f,.71f,.70f),Mint(.58f,.88f,.69f),Ink(.025f,.045f,.047f,.97f);
const FSlateRoundedBoxBrush Panel(Ink,16.f),Card(FLinearColor::White,7.f);
FSlateFontInfo Font(int Size,bool Bold=false){return FCoreStyle::GetDefaultFontStyle(Bold?"Bold":"Regular",Size);}
TSharedRef<STextBlock> Label(const FString& Text,int Size=14,FLinearColor Color=White,bool Bold=false){return SNew(STextBlock).Text(FText::FromString(Text)).Font(Font(Size,Bold)).ColorAndOpacity(Color).AutoWrapText(true);}
const FButtonStyle& Style(){static FButtonStyle S=FButtonStyle().SetNormal(FSlateRoundedBoxBrush(FLinearColor::White,7.f)).SetHovered(FSlateRoundedBoxBrush(FLinearColor(1.18f,1.18f,1.18f),7.f)).SetPressed(FSlateRoundedBoxBrush(FLinearColor(.73f,.85f,.80f),7.f)).SetNormalPadding(FMargin(0)).SetPressedPadding(FMargin(0));return S;}
}

void STerraPauseMenu::Construct(const FArguments& Args){
  Vehicle=Args._Vehicle;
  SetCanTick(true);
  auto Navigation=SNew(SVerticalBox);
  auto Add=[&](const FString& Text,int Index,TFunction<FReply()> Click){
    Navigation->AddSlot().AutoHeight().Padding(0,0,0,10)
      [SNew(SButton).ButtonStyle(&Style()).ContentPadding(FMargin(18,15)).HAlign(HAlign_Left)
        .ButtonColorAndOpacity_Lambda([this,Index]{return Page==Index?FLinearColor(.19f,.35f,.27f):FLinearColor(.085f,.14f,.14f);})
        .OnClicked_Lambda([Click]{return Click();})[Label(Text,15,White,true)]];
  };
  Add(TEXT("RESUME"),-1,[this]{if(Vehicle.IsValid())Vehicle->SetPauseMenu(false);return FReply::Handled();});
  Navigation->AddSlot().AutoHeight().Padding(0,0,0,10)
    [SNew(SButton).ButtonStyle(&Style()).ContentPadding(FMargin(18,15)).HAlign(HAlign_Left).ButtonColorAndOpacity(FLinearColor(.085f,.14f,.14f))
      .IsEnabled_Lambda([this]{return Vehicle.IsValid()&&(Vehicle->Garage||FMath::Abs(Vehicle->Speed)<.5f);})
      .ToolTipText(FText::FromString(TEXT("Stop the vehicle before entering the garage.")))
      .OnClicked_Lambda([this]{if(Vehicle.IsValid()){Vehicle->SetPauseMenu(false);Vehicle->SetGarage(true);}return FReply::Handled();})[Label(TEXT("GARAGE"),15,White,true)]];
  Add(TEXT("CONTROLS"),1,[this]{ShowPage(1);return FReply::Handled();});
  Add(TEXT("GRAPHICS"),2,[this]{ShowPage(2);return FReply::Handled();});
  Add(TEXT("EXIT GAME"),-2,[this]{RequestExit();return FReply::Handled();});
  Navigation->AddSlot().FillHeight(1);
  Navigation->AddSlot().AutoHeight()[Label(TEXT("Esc  Back / resume\nYour driving session is paused."),12,Muted)];
  ChildSlot[SNew(SBorder).BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush")).BorderBackgroundColor(FLinearColor(.008f,.014f,.018f,.78f)).Padding(0)
    [SNew(SScaleBox).Stretch(EStretch::ScaleToFit)
      [SNew(SBox).WidthOverride(1240).HeightOverride(690)
        [SNew(SBorder).BorderImage(&Panel).Padding(28)
          [SNew(SVerticalBox)
            +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,20)
            [SNew(SHorizontalBox)
              +SHorizontalBox::Slot().FillWidth(1)[SNew(SVerticalBox)
                +SVerticalBox::Slot().AutoHeight()[Label(TEXT("TERRA DRIVE"),13,Mint,true)]
                +SVerticalBox::Slot().AutoHeight().Padding(0,5,0,0)[Label(TEXT("PAUSED"),29,White,true)]]
              +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center).HAlign(HAlign_Right)
              [SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Vehicle.IsValid()?Vehicle->VehicleName:TEXT(""));}).Font(Font(16,true)).ColorAndOpacity(Muted)]]
            +SVerticalBox::Slot().FillHeight(1)
            [SNew(SHorizontalBox)
              +SHorizontalBox::Slot().AutoWidth().Padding(0,0,24,0)[SNew(SBox).WidthOverride(226)[Navigation]]
              +SHorizontalBox::Slot().FillWidth(1)
              [SAssignNew(Pages,SWidgetSwitcher)
                +SWidgetSwitcher::Slot()[HomePage()]
                +SWidgetSwitcher::Slot()[ControlsPage()]
                +SWidgetSwitcher::Slot()[STerraGarage::GraphicsPage()]]]]]]]];
}
TSharedRef<SWidget> STerraPauseMenu::HomePage(){
  return SNew(SBorder).BorderImage(&Card).BorderBackgroundColor(FLinearColor(.055f,.095f,.095f)).Padding(28)
    [SNew(SVerticalBox)
      +SVerticalBox::Slot().AutoHeight()[Label(TEXT("TAKE A BREATHER"),22,Mint,true)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,18,0,0)[Label(TEXT("Resume your run, tune your setup in the garage, or adjust the game to suit you."),18)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,22,0,0)[Label(TEXT("CONTROLS"),12,Mint,true)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,7,0,0)[Label(TEXT("Choose your keyboard bindings. The status bar uses your current keys. Arrow keys, Tab and the standard gamepad controls remain available."),15,Muted)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,22,0,0)[Label(TEXT("GRAPHICS"),12,Mint,true)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,7,0,0)[Label(TEXT("Choose a rendering preset. Changes apply immediately and are saved."),15,Muted)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,22,0,0)[Label(TEXT("GARAGE"),12,Mint,true)]
      +SVerticalBox::Slot().AutoHeight().Padding(0,7,0,0)[Label(TEXT("Available once the vehicle has stopped. Your vehicle selection and upgrades are saved separately from the keyboard layout."),15,Muted)]];
}
TSharedRef<SWidget> STerraPauseMenu::ControlsPage(){
  auto List=SNew(SVerticalBox);Rows.SetNum(TerraControls::Count);
  for(int I=0;I<TerraControls::Count;++I){
    const auto A=TerraControls::Action(I);
    auto Row=SNew(SBorder).BorderImage(&Card).BorderBackgroundColor(FLinearColor(.055f,.095f,.095f)).Padding(12,9)
      [SNew(SHorizontalBox)
        +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center)
        [SNew(SVerticalBox)
          +SVerticalBox::Slot().AutoHeight()[Label(TerraControls::Title(A),14,White,true)]
          +SVerticalBox::Slot().AutoHeight().Padding(0,3,12,0)[Label(TerraControls::AlternateDescription(A),11,Muted)]]
        +SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
        [SNew(SBox).WidthOverride(145)
          [SNew(SButton).ButtonStyle(&Style()).ContentPadding(FMargin(12,10)).HAlign(HAlign_Center)
            .ButtonColorAndOpacity_Lambda([this,A]{return WaitingForBinding&&BindingAction==A?FLinearColor(.28f,.40f,.25f):FLinearColor(.14f,.23f,.21f);})
            .OnClicked_Lambda([this,A]{BeginRebind(A);return FReply::Handled();})
            [SNew(STextBlock).Text_Lambda([this,A]{return FText::FromString(WaitingForBinding&&BindingAction==A?TEXT("PRESS A KEY"):Vehicle.IsValid()?Vehicle->ControlLabel(A):TEXT(""));}).Font(Font(14,true)).ColorAndOpacity(Mint)]]]];
    Rows[I]=Row;List->AddSlot().AutoHeight().Padding(0,0,0,6)[Row];
  }
  return SNew(SVerticalBox)
    +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,10)
    [SNew(SHorizontalBox)
      +SHorizontalBox::Slot().FillWidth(1).VAlign(VAlign_Center)[Label(TEXT("KEYBOARD & CAMERA"),20,Mint,true)]
      +SHorizontalBox::Slot().AutoWidth()
      [SNew(SButton).ButtonStyle(&Style()).ButtonColorAndOpacity(FLinearColor(.14f,.23f,.21f)).ContentPadding(FMargin(13,10))
        .OnClicked_Lambda([this]{WaitingForBinding=false;BindingAction=TerraControls::Action::Count;Status=Vehicle.IsValid()&&Vehicle->ResetControls()?TEXT("Default controls restored and saved."):TEXT("Could not save defaults; previous controls kept.");return FReply::Handled();})[Label(TEXT("RESET DEFAULTS"),11,White,true)]]]
    +SVerticalBox::Slot().AutoHeight().Padding(0,0,0,12)
    [SNew(SBox).MinDesiredHeight(44)[SNew(STextBlock).Text_Lambda([this]{return FText::FromString(Status);}).Font(Font(12)).ColorAndOpacity(Muted).AutoWrapText(true)]]
    +SVerticalBox::Slot().FillHeight(1)[SAssignNew(ControlsScroll,SScrollBox)+SScrollBox::Slot()[List]];
}
void STerraPauseMenu::ShowPage(int Index){
  Page=FMath::Clamp(Index,0,2);WaitingForBinding=false;BindingAction=TerraControls::Action::Count;
  if(Pages.IsValid())Pages->SetActiveWidgetIndex(Page);
}
void STerraPauseMenu::Tick(const FGeometry& Geometry,double CurrentTime,float DeltaTime){
  SCompoundWidget::Tick(Geometry,CurrentTime,DeltaTime);
  // Slate still ticks while the world is paused. Reapply the menu/background
  // cap after a graphics preset changes t.MaxFPS, without rewriting settings.
  TerraGraphics::Tick(true,!(Vehicle.IsValid()&&Vehicle->AutoTest)&&!FApp::HasFocus());
}
void STerraPauseMenu::BeginRebind(TerraControls::Action A){
  if(!TerraControls::ValidAction(A))return;
  if(Page!=1)ShowPage(1);
  BindingAction=A;WaitingForBinding=true;
  Status=FString::Printf(TEXT("Press a new key for %s. Esc cancels. Existing assignments are kept if a key conflicts."),TerraControls::Title(A));
  FSlateApplication::Get().SetKeyboardFocus(AsShared());
  if(ControlsScroll.IsValid()&&Rows.IsValidIndex(int(A)))ControlsScroll->ScrollDescendantIntoView(Rows[int(A)],false);
}
bool STerraPauseMenu::CaptureBinding(FKey Key){
  if(!WaitingForBinding)return false;
  if(Key==EKeys::Escape){WaitingForBinding=false;BindingAction=TerraControls::Action::Count;Status=TEXT("Binding change canceled. Your controls are unchanged.");return false;}
  if(!Vehicle.IsValid())return false;
  FString Error;const auto Action=BindingAction;
  if(!Vehicle->RebindControl(Action,Key,Error)){Status=Error;return false;}
  WaitingForBinding=false;BindingAction=TerraControls::Action::Count;
  Status=FString::Printf(TEXT("%s: %s. Saved."),TerraControls::Title(Action),*Vehicle->ControlLabel(Action));return true;
}
FReply STerraPauseMenu::OnPreviewKeyDown(const FGeometry&,const FKeyEvent& E){
  if(WaitingForBinding){
    if(!E.IsRepeat()){
      if(E.IsControlDown()||E.IsAltDown()||E.IsCommandDown())Status=TEXT("Choose one key without Ctrl, Alt or Windows modifiers.");
      else CaptureBinding(E.GetKey());
    }
    return FReply::Handled();
  }
  if(E.GetKey()==EKeys::Escape){if(Page!=0)ShowPage(0);else if(Vehicle.IsValid())Vehicle->SetPauseMenu(false);return FReply::Handled();}
  return FReply::Unhandled();
}
FReply STerraPauseMenu::OnKeyDown(const FGeometry& G,const FKeyEvent& E){return OnPreviewKeyDown(G,E);}
FReply STerraPauseMenu::OnPreviewMouseButtonDown(const FGeometry&,const FPointerEvent& E){
  if(!WaitingForBinding)return FReply::Unhandled();
  CaptureBinding(E.GetEffectingButton());return FReply::Handled();
}
void STerraPauseMenu::RequestExit(){
  ExitRequested=true;
  if(Vehicle.IsValid()&&!Vehicle->AutoTest)if(auto* PC=Cast<APlayerController>(Vehicle->GetController()))PC->ConsoleCommand(TEXT("quit"));
}
