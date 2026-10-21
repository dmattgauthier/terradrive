#pragma once
#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
class ATerraVehicle;
class SWidgetSwitcher;

class STerraGarage : public SCompoundWidget {
public:
  SLATE_BEGIN_ARGS(STerraGarage) {} SLATE_ARGUMENT(ATerraVehicle*, Vehicle) SLATE_END_ARGS()
  void Construct(const FArguments &Args);
  virtual bool SupportsKeyboardFocus() const override { return true; }
  virtual FReply OnKeyDown(const FGeometry&, const FKeyEvent &Event) override;
  virtual FReply OnPreviewKeyDown(const FGeometry& Geometry, const FKeyEvent &Event) override;
private:
  TWeakObjectPtr<ATerraVehicle> Vehicle;
  TSharedPtr<SWidgetSwitcher> Pages;
  int Page = 0;
  TSharedRef<SWidget> VehiclePage();
  TSharedRef<SWidget> UpgradePage();
  TSharedRef<SWidget> UpgradeRow(int Part);
  TSharedRef<SWidget> Metric(const FString &Name, TAttribute<FText> Value);
};
