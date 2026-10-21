param([switch]$Package,[switch]$ImportAssets,[switch]$SkipBuild,[switch]$SkipExport,[switch]$SkipCook,
      [string]$EngineRoot='C:\Program Files\Epic Games\UE_5.8')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$project=Join-Path $projectRoot 'TerraDrive.uproject'
$env:UBA_ROOT=Join-Path $projectRoot 'Saved\UBA'
$env:uebp_LogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
$env:uebp_FinalLogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
if (!$SkipBuild) {
    & "$engineRoot\Engine\Build\BatchFiles\Build.bat" TerraDriveEditor Win64 Development "-Project=$project" -WaitMutex -NoHotReloadFromIDE -NoUBA
    if ($LASTEXITCODE) { throw 'Editor compilation failed' }
}
if ($ImportAssets) {
    if (!$SkipExport) {
        & node (Join-Path $PSScriptRoot 'export-source.mjs')
        if ($LASTEXITCODE) { throw 'Source conversion failed' }
    }
    $importMarker=Join-Path $projectRoot 'Saved\import-complete.json'
    # PythonScriptCommandlet interprets backslash escapes (notably the \t in
    # "\terra drive"). Forward slashes preserve paths containing spaces.
    $scriptPath=(Join-Path $PSScriptRoot 'import-assets.py').Replace('\','/')
    $importLog=Join-Path $projectRoot 'Saved\Logs\import-assets.log'
    $started=Get-Date
    $editorArgs=@(('"'+$project+'"'),'-run=pythonscript',('-script="'+$scriptPath+'"'),'-unattended','-nullrhi','-nosplash','-NoSound','-stdout','-FullStdOutLogOutput',('-abslog="'+$importLog+'"'))
    $editorProcess=Start-Process -FilePath "$engineRoot\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" -ArgumentList $editorArgs -WindowStyle Hidden -PassThru
    # Wait for the commandlet itself. Start-Process -Wait can also wait on
    # persistent compiler/cache descendants after the commandlet has exited.
    $editorProcess.WaitForExit()
    $editorProcess.Refresh()
    if ($editorProcess.ExitCode -or !(Test-Path -LiteralPath $importMarker) -or (Get-Item -LiteralPath $importMarker).LastWriteTime -lt $started -or !(Test-Path -LiteralPath (Join-Path $projectRoot 'Content\Maps\ProvingGround.umap'))) { throw "Asset import did not produce a fresh completion marker and map. Inspect $importLog. If Unreal creates no log, run the editor outside the restricted process sandbox." }
}
if ($Package) {
    foreach ($required in @('Content\Maps\ProvingGround.umap','Content\NativeData\world.json','Content\NativeData\terrain.bin')) {
        if (!(Test-Path -LiteralPath (Join-Path $projectRoot $required))) {
            throw "Missing $required. Run with -ImportAssets before packaging."
        }
    }
    $cookArgument='-cook'
    if ($SkipCook) {
        if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'Saved\Cooked\Windows'))) {
            throw '-SkipCook requires a successful prior cook. Omit it after changing content or rendering settings.'
        }
        $cookArgument='-skipcook'
    }
    & "$engineRoot\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun "-project=$project" -noP4 -platform=Win64 -clientconfig=Development -build $cookArgument -stage -pak -iostore -archive "-archivedirectory=$projectRoot\Build" -unattended -utf8output '-UbtArgs=-NoUBA'
    if ($LASTEXITCODE) { throw 'Packaging failed' }
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'Build\Windows\TerraDrive.exe'))) {
        throw 'AutomationTool returned success but the packaged launcher is missing.'
    }
}
