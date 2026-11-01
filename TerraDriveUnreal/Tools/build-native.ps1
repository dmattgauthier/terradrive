param([switch]$Package,[switch]$ImportAssets,[switch]$SkipBuild,[switch]$SkipExport,[switch]$SkipCook,[ValidateRange(1,512)][int]$ImportBatchSize=8,
      [string]$EngineRoot='C:\Program Files\Epic Games\UE_5.8')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$project=Join-Path $projectRoot 'TerraDrive.uproject'
$env:UBA_ROOT=Join-Path $projectRoot 'Saved\UBA'
$env:uebp_LogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
$env:uebp_FinalLogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
if (!$SkipBuild) {
    & "$engineRoot\Engine\Build\BatchFiles\Build.bat" TerraDriveEditor Win64 Development "-Project=$project" -WaitMutex -NoHotReloadFromIDE -NoUBA -MaxParallelActions=2
    if ($LASTEXITCODE) { throw 'Editor compilation failed' }
}
if ($ImportAssets) {
    if (!$SkipExport) {
        & node (Join-Path $PSScriptRoot 'export-source.mjs')
        if ($LASTEXITCODE) { throw 'Source conversion failed' }
    }
    & node (Join-Path $PSScriptRoot 'bake-vehicle-ground-probes.mjs')
    if($LASTEXITCODE){throw 'Vehicle lower-body probe generation failed'}
    & node (Join-Path $PSScriptRoot 'bake-coachwork-collision.mjs')
    if($LASTEXITCODE){throw 'Vehicle coachwork collision generation failed'}
    $importMarker=Join-Path $projectRoot 'Saved\import-complete.json'
    & node (Join-Path $PSScriptRoot 'bake-terrain-transitions.mjs')
    if($LASTEXITCODE){throw 'Terrain transition mask generation failed'}
    # PythonScriptCommandlet interprets backslash escapes (notably the \t in
    # "\terra drive"). Forward slashes preserve paths containing spaces.
    $scriptPath=(Join-Path $PSScriptRoot 'import-assets.py').Replace('\','/')
    $importLog=Join-Path $projectRoot 'Saved\Logs\import-assets.log'
    $started=Get-Date
    $taskImportData=Get-Content -LiteralPath (Join-Path $projectRoot 'SourceAssets/import.json') -Raw|ConvertFrom-Json
    $taskAssetCount=@($taskImportData.assets).Count
    try {
    for($taskStart=0;$taskStart -lt $taskAssetCount;$taskStart+=$ImportBatchSize){
    $taskEnd=[Math]::Min($taskAssetCount,$taskStart+$ImportBatchSize)
    $env:TERRA_IMPORT_START=[string]$taskStart;$env:TERRA_IMPORT_END=[string]$taskEnd
    $taskBatchLog=Join-Path $projectRoot ('Saved/Logs/import-assets-'+$taskStart+'.log')
    $editorArgs=@(('"'+$project+'"'),'-run=pythonscript',('-script="'+$scriptPath+'"'),'-unattended','-nullrhi','-nosplash','-NoSound','-stdout','-FullStdOutLogOutput',('-abslog="'+$taskBatchLog+'"'))
    $editorProcess=Start-Process -FilePath "$engineRoot\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" -ArgumentList $editorArgs -WindowStyle Hidden -PassThru
    # Wait for the commandlet itself. Start-Process -Wait can also wait on
    # persistent compiler/cache descendants after the commandlet has exited.
    $editorProcess.WaitForExit()
    $editorProcess.Refresh()
    if($editorProcess.ExitCode){throw "Asset batch $taskStart failed; inspect $taskBatchLog"}
    if($taskEnd -lt $taskAssetCount){
      $taskBatchMarker=Join-Path $projectRoot ('Saved/import-batch-'+$taskStart+'.json')
      if(!(Test-Path -LiteralPath $taskBatchMarker) -or (Get-Item -LiteralPath $taskBatchMarker).LastWriteTime -lt $started){throw "No fresh batch marker for $taskStart"}
    }
    Write-Output ('Imported mesh batch '+$taskStart+'..'+($taskEnd-1)+' / '+$taskAssetCount)
    }
    } finally {
    Remove-Item Env:TERRA_IMPORT_START,Env:TERRA_IMPORT_END -ErrorAction SilentlyContinue
    }
    if (!(Test-Path -LiteralPath $importMarker) -or (Get-Item -LiteralPath $importMarker).LastWriteTime -lt $started -or !(Test-Path -LiteralPath (Join-Path $projectRoot 'Content\Maps\ProvingGround.umap'))) { throw "Asset import did not produce a fresh completion marker and map. Inspect the batch logs in Saved/Logs." }
}
if ($Package) {
    & node (Join-Path $PSScriptRoot 'garden-geology.mjs')
    if($LASTEXITCODE){throw 'Garden geology cache generation failed'}
    foreach ($required in @('Content\Maps\ProvingGround.umap','Content\NativeData\world.json','Content\NativeData\terrain.bin','Content\NativeData\vehicle-ground-probes.json','Content\NativeData\vehicle-collision.json')) {
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
    $packageStarted=Get-Date
    & "$engineRoot\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun "-project=$project" -noP4 -platform=Win64 -clientconfig=Development -build $cookArgument -stage -pak -iostore -archive -nodebuginfo "-archivedirectory=$projectRoot\Build" -unattended -utf8output '-UbtArgs=-NoUBA -MaxParallelActions=2'
    if ($LASTEXITCODE) { throw 'Packaging failed' }
    if (!$SkipCook) {
        $cookLogs=@(Get-ChildItem -LiteralPath $env:uebp_LogFolder -Filter 'Cook-*.txt' | Where-Object { $_.LastWriteTime -ge $packageStarted })
        if (!$cookLogs.Count) { throw 'Full cook did not leave a fresh shader diagnostic log.' }
        $shaderFailures=@($cookLogs | Select-String -Pattern 'Failed to compile Material|doesn.t have a valid ShaderMap')
        if ($shaderFailures.Count) { throw "Cook substituted invalid material shaders. Inspect $($cookLogs[0].FullName)." }
    }
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'Build\Windows\TerraDrive.exe'))) {
        throw 'AutomationTool returned success but the packaged launcher is missing.'
    }
}
