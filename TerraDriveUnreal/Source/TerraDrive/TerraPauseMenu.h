#pragma once
#include "CoreMinimal.h"
#include "TerraControls.h"
#include "Widgets/SCompoundWidget.h"
class ATerraVehicle;
class SWidgetSwitcher;
class SScrollBox;

class STerraPauseMenu : public SCompoundWidget {
public:
  SLATE_BEGIN_ARGS(STerraPauseMenu){} SLATE_ARGUMENT(ATerraVehicle*,Vehicle) SLATE_END_ARGS()
  void Construct(const FArguments& Args);
  virtual void Tick(const FGeometry&,double CurrentTime,float DeltaTime)override;
  virtual bool SupportsKeyboardFocus()const override{return true;}
  virtual FReply OnPreviewKeyDown(const FGeometry&,const FKeyEvent&)override;
  virtual FReply OnKeyDown(const FGeometry&,const FKeyEvent&)override;
  virtual FReply OnPreviewMouseButtonDown(const FGeometry&,const FPointerEvent&)override;
  void ShowPage(int Index);
  int ActivePage()const{return Page;}
  void BeginRebind(TerraControls::Action Action);
  bool CaptureBinding(FKey Key);
  bool IsRebinding()const{return WaitingForBinding;}
  TerraControls::Action PendingAction()const{return BindingAction;}
  FString BindingMessage()const{return Status;}
  void RequestExit();
  bool ExitWasRequested()const{return ExitRequested;}
  TSharedPtr<SWidget> ControlRow(TerraControls::Action A)const{return Rows.IsValidIndex(int(A))?Rows[int(A)]:nullptr;}
  TSharedPtr<SScrollBox> ControlsScrollBox()const{return ControlsScroll;}
private:
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TSharedPtr<SWidgetSwitcher> Pages;
  TSharedPtr<SScrollBox> ControlsScroll;
  TArray<TSharedPtr<SWidget>> Rows;
  bool WaitingForBinding=false,ExitRequested=false;
  TerraControls::Action BindingAction=TerraControls::Action::Count;
  int Page=0;
  FString Status=TEXT("Select a control, then press its new key. Changes save immediately.");
  TSharedRef<SWidget> HomePage();
  TSharedRef<SWidget> ControlsPage();
};
