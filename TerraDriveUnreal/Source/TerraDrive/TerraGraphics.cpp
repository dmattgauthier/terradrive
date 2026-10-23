#include "TerraGraphics.h"
#include "HAL/IConsoleManager.h"
#include "HAL/FileManager.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace TerraGraphics {
namespace {
int Mode=0;
int TestLimit=0;
float AppliedLimit=-1;
FString SettingsPath;
const int Rates[]={30,45,60};
void CVar(const TCHAR *Key,float Value){
  if(auto *C=IConsoleManager::Get().FindConsoleVariable(Key)) C->Set(Value,ECVF_SetByCode);
}
}
int Preset(){return Mode;}
const TCHAR *Name(){return Mode==0?TEXT("COOL  /  30 FPS"):Mode==1?TEXT("BALANCED  /  45 FPS"):TEXT("QUALITY  /  60 FPS");}
bool Save(const FString &Path){
  const FString Temp=Path+TEXT(".tmp");
  IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path),true);
  const FString Json=FString::Printf(TEXT("{\"version\":1,\"preset\":%d}\n"),Mode);
  return FFileHelper::SaveStringToFile(Json,*Temp)&&IFileManager::Get().Move(*Path,*Temp,true,true);
}
bool Load(const FString &Path){
  FString Json;TSharedPtr<FJsonObject> Object;double Value=-1,Version=0;
  if(!FFileHelper::LoadFileToString(Json,*Path)||!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json),Object)||!Object.IsValid()||
    !Object->TryGetNumberField(TEXT("version"),Version)||Version!=1||!Object->TryGetNumberField(TEXT("preset"),Value)||
    !FMath::IsFinite(Value)||Value<0||Value>2||Value!=FMath::FloorToDouble(Value))return false;
  Select(int(Value),false);return true;
}
void Select(int NewMode,bool Persist){
  Mode=FMath::Clamp(NewMode,0,2);
  // Keep textures and deformable terrain intact. Limit pixels, screen-space
  // lighting and shadow filtering rather than removing physical obstacles.
  CVar(TEXT("r.ScreenPercentage"),Mode==0?75:Mode==1?85:100);
  CVar(TEXT("r.SSGI.Quality"),Mode==2?2:1);
  CVar(TEXT("r.DynamicGlobalIlluminationMethod"),Mode==2?2:0);
  CVar(TEXT("r.SSR.Quality"),Mode==0?0:Mode==1?1:2);
  CVar(TEXT("r.Shadow.MaxResolution"),Mode==0?1024:Mode==1?1536:2048);
  CVar(TEXT("r.Shadow.CSM.MaxCascades"),Mode==0?2:3);
  CVar(TEXT("r.Shadow.DistanceScale"),Mode==0?.55f:Mode==1?.75f:1.f);
  CVar(TEXT("r.TSR.History.ScreenPercentage"),100);
  CVar(TEXT("r.VSync"),0);
  AppliedLimit=-1;
  Tick(false,false);
  if(Persist&&!SettingsPath.IsEmpty()&&!Save(SettingsPath))UE_LOG(LogTemp,Warning,TEXT("TERRA_GRAPHICS settings could not be saved"));
  UE_LOG(LogTemp,Display,TEXT("TERRA_GRAPHICS mode=%d name=%s"),Mode,Name());
}
float FrameLimit(bool Garage,bool Background){
  float Limit=Background?15:Garage?FMath::Min(Rates[Mode],20):Rates[Mode];
  return TestLimit>0?FMath::Min(Limit,float(TestLimit)):Limit;
}
void Tick(bool Garage,bool Background){
  const float Limit=FrameLimit(Garage,Background);
  if(Limit!=AppliedLimit){CVar(TEXT("t.MaxFPS"),Limit);AppliedLimit=Limit;}
}
void Initialize(){
  Mode=0;TestLimit=0;SettingsPath=FPaths::ProjectSavedDir()/TEXT("graphics-settings.json");
  const bool Test=FParse::Param(FCommandLine::Get(),TEXT("TerraValidate"));
  // All validation settings are isolated, including tests launched outside the wrappers.
  if(Test)SettingsPath=FPaths::ProjectSavedDir()/TEXT("Validation/graphics-settings.json");
  FParse::Value(FCommandLine::Get(),TEXT("TerraGraphics="),SettingsPath);
  if(Test){TestLimit=20;FParse::Value(FCommandLine::Get(),TEXT("TerraTestFPS="),TestLimit);TestLimit=FMath::Clamp(TestLimit,10,60);}
  Select(0,false);Load(SettingsPath);
  int Override=-1;if(FParse::Value(FCommandLine::Get(),TEXT("TerraGraphicsMode="),Override))Select(Override,false);
  Tick(false,false);
}
}
