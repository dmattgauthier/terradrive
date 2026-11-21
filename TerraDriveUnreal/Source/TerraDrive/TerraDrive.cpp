#include "Modules/ModuleManager.h"
#include "HAL/PlatformProcess.h"
#include "HAL/PlatformTime.h"
#include "Misc/CoreDelegates.h"
#include "ProfilingDebugging/TraceAuxiliary.h"
#include "Trace/Trace.h"

namespace {

void CloseTraceBeforeEngineExit()
{
    if (!FTraceAuxiliary::IsConnected())
    {
        return;
    }

    // Stop queues the close. Let the writer flush the file before engine
    // teardown. Update also supports captures using -notracethreading.
    const double Deadline = FPlatformTime::Seconds() + 2.0;
    bool bStopRequested = false;
    do
    {
        if (!bStopRequested)
        {
            bStopRequested = FTraceAuxiliary::Stop();
        }
        UE::Trace::Update();
        if (!FTraceAuxiliary::IsConnected())
        {
            UE_LOG(LogTemp, Display, TEXT("TERRA_TRACE_CLOSED before engine exit"));
            return;
        }
        FPlatformProcess::SleepNoStats(0.005f);
    } while (FPlatformTime::Seconds() < Deadline);

    UE_LOG(LogTemp, Error, TEXT("TERRA_TRACE_CLOSE_TIMEOUT before engine exit"));
}

class FTerraDriveModule final : public FDefaultGameModuleImpl
{
    FDelegateHandle TraceExit;

public:
    void StartupModule() override
    {
        TraceExit = FCoreDelegates::OnEnginePreExit.AddStatic(&CloseTraceBeforeEngineExit);
    }

    void ShutdownModule() override
    {
        FCoreDelegates::OnEnginePreExit.Remove(TraceExit);
    }
};

}

IMPLEMENT_PRIMARY_GAME_MODULE(FTerraDriveModule, TerraDrive, "TerraDrive");
