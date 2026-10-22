#include "TerraVehicle.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

void ATerraVehicle::ConfigureLamps(){
  BrakeLamps.Empty();ReverseLamps.Empty();Body->EmptyOverrideMaterials();
  if(!Spec.IsValid())return;
  const TArray<TSharedPtr<FJsonValue>> *List=nullptr;
  if(!Spec->TryGetArrayField(TEXT("lamps"),List))return;
  for(const auto &Entry:*List){
    const auto Lamp=Entry->AsObject();
    const FString Name=Lamp->GetStringField(TEXT("material"));
    for(int Slot=0;Slot<Body->GetNumMaterials();++Slot){
      auto *Material=Body->GetMaterial(Slot);
      if(Material&&Material->GetName()==Name){
        auto *Dynamic=Body->CreateDynamicMaterialInstance(Slot);
        if(Lamp->GetStringField(TEXT("role"))==TEXT("brake"))BrakeLamps.Add(Dynamic);
        else ReverseLamps.Add(Dynamic);
      }
    }
  }
  UpdateLamps();
}
void ATerraVehicle::UpdateLamps(){
  BrakeLampLevel=!Garage&&Brake>.05f?5.f:0.f;
  ReverseLampLevel=!Garage&&Direction<0?4.f:0.f;
  for(auto Lamp:BrakeLamps)Lamp->SetScalarParameterValue(TEXT("TerraLamp"),BrakeLampLevel);
  for(auto Lamp:ReverseLamps)Lamp->SetScalarParameterValue(TEXT("TerraLamp"),ReverseLampLevel);
}
