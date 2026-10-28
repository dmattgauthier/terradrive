#pragma once
#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
class ATerraVehicle;
class SWidgetSwitcher;
class SScrollBox;

class STerraGarage : public SCompoundWidget {
public:
  SLATE_BEGIN_ARGS(STerraGarage) {} SLATE_ARGUMENT(ATerraVehicle*, Vehicle) SLATE_END_ARGS()
  void Construct(const FArguments &Args);
  virtual bool SupportsKeyboardFocus() const override { return true; }
  virtual FReply OnKeyDown(const FGeometry&, const FKeyEvent &Event) override;
  virtual FReply OnPreviewKeyDown(const FGeometry& Geometry, const FKeyEvent &Event) override;
  void ShowUpgradePart(int Part);
  TSharedPtr<SWidget> UpgradePartWidget(int Part) const { return UpgradeRows.IsValidIndex(Part)?UpgradeRows[Part]:nullptr; }
  TSharedPtr<SScrollBox> UpgradePartScrollBox() const { return UpgradeScroll; }
private:
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TSharedPtr<SWidgetSwitcher> Pages;
  TSharedPtr<SScrollBox> UpgradeScroll;
  TArray<TSharedPtr<SWidget>> UpgradeRows;
  int Page = 0;
  TSharedRef<SWidget> VehiclePage();
  TSharedRef<SWidget> UpgradePage();
  TSharedRef<SWidget> GraphicsPage();
  TSharedRef<SWidget> UpgradeRow(int Part);
  TSharedRef<SWidget> Metric(const FString &Name, TAttribute<FText> Value);
};
