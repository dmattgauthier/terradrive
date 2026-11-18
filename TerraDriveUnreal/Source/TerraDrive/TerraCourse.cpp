#include "TerraCourse.h"
#include "TerraPauseMenu.h"
#include "TerraVehicle.h"
#include "HAL/FileManager.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace {
FString RecordsPath(){return FPaths::ProjectSavedDir()/TEXT("course-bests.json");}

TSharedPtr<FJsonObject> ReadObject(const FString& Path){
  FString Text;
  TSharedPtr<FJsonObject> Root;
  if(FFileHelper::LoadFileToString(Text,*Path))
    FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Root);
  return Root;
}
}

FString TerraBuildDescription(){
  static const FString Description=[] {
    const auto Info=ReadObject(FPaths::ProjectContentDir()/TEXT("NativeData/build-info.json"));
    FString Label,Revision;
    if(Info&&Info->TryGetStringField(TEXT("label"),Label)&&Info->TryGetStringField(TEXT("revision"),Revision))
      return Label+TEXT("  /  ")+Revision.Left(8);
    return FString();
  }();
  return Description;
}

FString ATerraVehicle::CourseRecordKey(int Index)const{
  if(!Terrain||!Terrain->Routes.IsValidIndex(Index)||!Spec)return {};
  return Terrain->Routes[Index].Name+TEXT(" / ")+Spec->GetStringField(TEXT("id"));
}

void ATerraVehicle::LoadCourseRecords(){
  CourseRecords.Reset();
  const auto Root=ReadObject(RecordsPath());
  const TSharedPtr<FJsonObject>* Times=nullptr;
  double Version=0;
  if(!Root||!Root->TryGetNumberField(TEXT("version"),Version)||Version!=1||
     !Root->TryGetObjectField(TEXT("bestSeconds"),Times)||!Times||!*Times)return;
  for(const auto& Pair:(*Times)->Values){
    double Seconds=0;
    if(Pair.Value&&Pair.Value->TryGetNumber(Seconds)&&FMath::IsFinite(Seconds)&&Seconds>0)
      CourseRecords.Add(FString(*Pair.Key),Seconds);
  }
}

bool ATerraVehicle::SaveCourseRecords()const{
  auto Times=MakeShared<FJsonObject>();
  for(const auto& Pair:CourseRecords)Times->SetNumberField(Pair.Key,Pair.Value);
  auto Root=MakeShared<FJsonObject>();
  Root->SetNumberField(TEXT("version"),1);
  Root->SetObjectField(TEXT("bestSeconds"),Times);
  FString Text;
  if(!FJsonSerializer::Serialize(Root,TJsonWriterFactory<>::Create(&Text)))return false;
  const FString Path=RecordsPath(),Temp=Path+TEXT(".tmp");
  IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path),true);
  return FFileHelper::SaveStringToFile(Text,*Temp)&&IFileManager::Get().Move(*Path,*Temp,true,true);
}

double ATerraVehicle::CourseBest(int Index)const{
  return CourseRecords.FindRef(CourseRecordKey(Index));
}

void ATerraVehicle::CompleteCourse(const FTerraRoute& Route){
  Notice=Route.Name+TEXT(" complete");
  if(AutoTest&&!FParse::Param(FCommandLine::Get(),TEXT("TerraCourseOnly")))return;
  const FString Key=CourseRecordKey(RouteIndex);
  const double Previous=CourseRecords.FindRef(Key);
  if(!Key.IsEmpty()&&Course.CleanGates==Route.Gates.Num()&&Course.Recoveries==0&&
     RouteTime>0&&(Previous<=0||RouteTime<Previous)){
    CourseRecords.Add(Key,double(RouteTime));
    Course.RecordSaved=SaveCourseRecords();
    Course.RecordWriteFailed=!Course.RecordSaved;
    if(Course.RecordWriteFailed){
      if(Previous>0)CourseRecords.Add(Key,Previous);
      else CourseRecords.Remove(Key);
    }
  }
  SetPauseMenu(true);
  if(PauseMenuWidget)PauseMenuWidget->ShowPage(STerraPauseMenu::CourseResultsPageIndex);
}
