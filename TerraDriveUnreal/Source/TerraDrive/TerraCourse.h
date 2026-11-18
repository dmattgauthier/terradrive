#pragma once
#include "CoreMinimal.h"

struct FTerraCourseRun {
  int CleanGates=0, Recoveries=0;
  bool LegClean=true, RecordSaved=false, RecordWriteFailed=false;
};

FString TerraBuildDescription();
