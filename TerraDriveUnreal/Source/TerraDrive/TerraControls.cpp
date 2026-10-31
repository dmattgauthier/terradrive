#include "TerraControls.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace TerraControls {
namespace {
struct Definition {const TCHAR* Name;const TCHAR* Title;FKey Key;const TCHAR* Alternate;};
const Definition& Def(Action A) {
  static const Definition D[]={
    {TEXT("forward"),TEXT("Accelerate / forward"),EKeys::W,TEXT("Up arrow / gamepad right trigger")},
    {TEXT("reverse"),TEXT("Brake / select reverse"),EKeys::S,TEXT("Down arrow / gamepad left trigger")},
    {TEXT("steerLeft"),TEXT("Steer left"),EKeys::A,TEXT("Left arrow / gamepad left stick")},
    {TEXT("steerRight"),TEXT("Steer right"),EKeys::D,TEXT("Right arrow / gamepad left stick")},
    {TEXT("holdBrake"),TEXT("Hold brake"),EKeys::SpaceBar,TEXT("Gamepad bottom face button")},
    {TEXT("garage"),TEXT("Open / close garage"),EKeys::V,TEXT("Tab is always available")},
    {TEXT("recover"),TEXT("Recover / restart challenge"),EKeys::R,TEXT("")},
    {TEXT("nextChallenge"),TEXT("Next challenge"),EKeys::J,TEXT("")},
    {TEXT("tracks"),TEXT("Fit / remove tracks"),EKeys::T,TEXT("Stop before changing running gear")},
    {TEXT("fourDrive"),TEXT("Select two / four-wheel drive"),EKeys::F,TEXT("Selectable drivetrains only")},
    {TEXT("lowRange"),TEXT("Select low / high range"),EKeys::L,TEXT("Stop before shifting")},
    {TEXT("frontLock"),TEXT("Front differential lock"),EKeys::U,TEXT("When fitted")},
    {TEXT("rearLock"),TEXT("Rear differential lock"),EKeys::Z,TEXT("When fitted")},
    {TEXT("centerLock"),TEXT("Center differential lock"),EKeys::I,TEXT("When fitted")},
    {TEXT("pressureUp"),TEXT("Raise tire pressure"),EKeys::Equals,TEXT("Numpad + also raises target 2 PSI")},
    {TEXT("pressureDown"),TEXT("Lower tire pressure"),EKeys::Hyphen,TEXT("Numpad - also lowers target 2 PSI")},
    {TEXT("crawl"),TEXT("Crawl throttle (hold)"),EKeys::LeftShift,TEXT("Hold while accelerating")},
    {TEXT("descentAssist"),TEXT("Descent assist"),EKeys::K,TEXT("Supported vehicles")},
    {TEXT("rain"),TEXT("Toggle rain"),EKeys::P,TEXT("")},
    {TEXT("resetTerrain"),TEXT("Reset terrain / repair vehicle"),EKeys::BackSpace,TEXT("Clears session ground disturbance")},
    {TEXT("winchAttach"),TEXT("Attach / release winch"),EKeys::X,TEXT("")},
    {TEXT("winchReel"),TEXT("Reel winch (hold)"),EKeys::Q,TEXT("")},
    {TEXT("cameraOrbit"),TEXT("Orbit camera (hold + mouse)"),EKeys::RightMouseButton,TEXT("This action also accepts a mouse button")},
    {TEXT("cameraNear"),TEXT("Near / chase camera"),EKeys::C,TEXT("")},
    {TEXT("region1"),TEXT("Region 1"),EKeys::One,TEXT("")},
    {TEXT("region2"),TEXT("Region 2"),EKeys::Two,TEXT("")},
    {TEXT("region3"),TEXT("Region 3"),EKeys::Three,TEXT("")},
    {TEXT("region4"),TEXT("Region 4"),EKeys::Four,TEXT("")},
    {TEXT("region5"),TEXT("Region 5"),EKeys::Five,TEXT("")},
    {TEXT("region6"),TEXT("Region 6"),EKeys::Six,TEXT("")},
    {TEXT("region7"),TEXT("Terrain park challenge"),EKeys::Seven,TEXT("")},
    {TEXT("region8"),TEXT("Region 8"),EKeys::Eight,TEXT("")},
    {TEXT("region9"),TEXT("Rock challenge"),EKeys::Nine,TEXT("")}
  };
  static_assert(UE_ARRAY_COUNT(D)==Count,"Every control needs a definition");
  return D[FMath::Clamp(int(A),0,Count-1)];
}
bool ReservedForOtherAction(Action A,FKey Key) {
  if(Key==EKeys::Escape||Key==EKeys::AnyKey||Key.IsTouch())return true;
  if(Key==EKeys::Tab)return A!=Action::Garage;
  if(Key==EKeys::Up)return A!=Action::Forward;
  if(Key==EKeys::Down)return A!=Action::Reverse;
  if(Key==EKeys::Left)return A!=Action::SteerLeft;
  if(Key==EKeys::Right)return A!=Action::SteerRight;
  if(Key==EKeys::Add)return A!=Action::PressureUp;
  if(Key==EKeys::Subtract)return A!=Action::PressureDown;
  // These keys are owned by Windows and cannot reliably reach the game.
  return Key==EKeys::LeftCommand||Key==EKeys::RightCommand;
}
}
bool ValidAction(Action A){return int(A)>=0&&int(A)<Count;}
const TCHAR* Name(Action A){return ValidAction(A)?Def(A).Name:TEXT("");}
const TCHAR* Title(Action A){return ValidAction(A)?Def(A).Title:TEXT("");}
const TCHAR* AlternateDescription(Action A){return ValidAction(A)?Def(A).Alternate:TEXT("");}
FKey DefaultKey(Action A){return ValidAction(A)?Def(A).Key:EKeys::Invalid;}
FString KeyLabel(FKey K) {
  if(K==EKeys::SpaceBar)return TEXT("Space");
  if(K==EKeys::LeftShift)return TEXT("Shift");
  if(K==EKeys::RightShift)return TEXT("R Shift");
  if(K==EKeys::LeftControl)return TEXT("Ctrl");
  if(K==EKeys::RightControl)return TEXT("R Ctrl");
  if(K==EKeys::LeftAlt)return TEXT("Alt");
  if(K==EKeys::RightAlt)return TEXT("R Alt");
  if(K==EKeys::BackSpace)return TEXT("Bksp");
  if(K==EKeys::PageUp)return TEXT("PgUp");
  if(K==EKeys::PageDown)return TEXT("PgDn");
  if(K==EKeys::Equals||K==EKeys::Add)return TEXT("+");
  if(K==EKeys::Hyphen||K==EKeys::Subtract)return TEXT("-");
  if(K==EKeys::LeftMouseButton)return TEXT("LMB");
  if(K==EKeys::RightMouseButton)return TEXT("RMB");
  if(K==EKeys::MiddleMouseButton)return TEXT("MMB");
  if(K==EKeys::ThumbMouseButton)return TEXT("Mouse 4");
  if(K==EKeys::ThumbMouseButton2)return TEXT("Mouse 5");
  return K.IsValid()?K.GetDisplayName().ToString():TEXT("Unbound");
}
void Bindings::Reset(){for(int I=0;I<Count;++I)Keys[I]=DefaultKey(Action(I));}
FKey Bindings::Key(Action A)const{return ValidAction(A)?Keys[int(A)]:EKeys::Invalid;}
bool Bindings::Assign(Action A,FKey K,FString& Error) {
  if(!ValidAction(A)||!K.IsValid()||K.IsGamepadKey()||K.IsAnalog()){
    Error=TEXT("Choose a keyboard key; gamepad axes keep their standard controls.");return false;
  }
  if(K.IsMouseButton()&&A!=Action::CameraOrbit){Error=TEXT("Mouse buttons can be assigned to camera orbit only.");return false;}
  if(ReservedForOtherAction(A,K)){Error=TEXT("That key is reserved for Pause, a fixed alternate control, or Windows.");return false;}
  for(int I=0;I<Count;++I)if(I!=int(A)&&Keys[I]==K){Error=FString::Printf(TEXT("%s is already assigned to %s."),*KeyLabel(K),Title(Action(I)));return false;}
  Keys[int(A)]=K;Error.Empty();return true;
}
bool Bindings::Save(const FString& Path)const {
  auto Root=MakeShared<FJsonObject>();Root->SetNumberField(TEXT("version"),1);
  auto Map=MakeShared<FJsonObject>();for(int I=0;I<Count;++I)Map->SetStringField(Name(Action(I)),Keys[I].ToString());
  Root->SetObjectField(TEXT("bindings"),Map);FString Json;
  if(!FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Json)))return false;
  IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path),true);const FString Temp=Path+TEXT(".tmp");
  return FFileHelper::SaveStringToFile(Json,*Temp)&&IFileManager::Get().Move(*Path,*Temp,true,true);
}
bool Bindings::Load(const FString& Path) {
  FString Json;TSharedPtr<FJsonObject> Root;double Version=0;
  if(!FFileHelper::LoadFileToString(Json,*Path)||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Root)||!Root.IsValid()||
    !Root->TryGetNumberField(TEXT("version"),Version)||Version!=1)return false;
  const TSharedPtr<FJsonObject>* Map=nullptr;
  if(!Root->TryGetObjectField(TEXT("bindings"),Map)||!Map||!Map->IsValid()||(*Map)->Values.Num()!=Count)return false;
  Bindings Loaded;FKey Proposed[Count];
  for(int I=0;I<Count;++I){FString KeyName;if(!(*Map)->TryGetStringField(Name(Action(I)),KeyName))return false;Proposed[I]=FKey(FName(*KeyName));}
  // Validate as a whole so saved key swaps do not conflict with default keys.
  for(int I=0;I<Count;++I){
    const FKey K=Proposed[I];const Action A=Action(I);
    if(!K.IsValid()||K.IsGamepadKey()||K.IsAnalog()||(K.IsMouseButton()&&A!=Action::CameraOrbit)||ReservedForOtherAction(A,K))return false;
    for(int J=0;J<I;++J)if(Proposed[J]==K)return false;
    Loaded.Keys[I]=K;
  }
  *this=Loaded;return true;
}
}
