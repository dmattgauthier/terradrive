param([switch]$Package,[switch]$ImportAssets,[switch]$SkipBuild,[switch]$SkipExport,[switch]$SkipCook,[ValidateRange(1,512)][int]$ImportBatchSize=8,
      [string]$EngineRoot='C:\Program Files\Epic Games\UE_5.8')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$project=Join-Path $projectRoot 'TerraDrive.uproject'
$env:UBA_ROOT=Join-Path $projectRoot 'Saved\UBA'
$env:uebp_LogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
$env:uebp_FinalLogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
$importMarker=Join-Path $projectRoot 'Saved\import-complete.json'
$cookMarker=Join-Path $projectRoot 'Saved\native-cook-complete.json'
$maskPath=Join-Path $projectRoot 'Content\NativeData\terrain-blend.bin'
$mapPath=Join-Path $projectRoot 'Content\Maps\ProvingGround.umap'

function Get-SourceExportHash {
    $output=@(& node (Join-Path $PSScriptRoot 'verify-source-export.mjs'))
    if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1 -or $output[0] -notmatch '^[0-9a-f]{64}$') { throw 'Native source export verification failed' }
    return $output[0]
}
function Read-BuildReceipt([string]$Path) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        try { Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop }
        catch { throw "Invalid build receipt $Path. Rerun the corresponding import or full cook." }
    }
}
function Get-BuildFileHash([string]$Path) {
    $stream=[IO.File]::OpenRead($Path)
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose(); $stream.Dispose() }
}
function Write-BuildReceipt([string]$Path,$Receipt) {
    $temp="$Path.$PID.tmp"
    try {
        $Receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temp -Encoding UTF8
        Move-Item -LiteralPath $temp -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
    }
}
function Get-CompletedImportHash {
    $sourceHash=Get-SourceExportHash
    $receipt=Read-BuildReceipt $importMarker
    if ($receipt.complete -ne $true -or $receipt.sourceExportSHA256 -ne $sourceHash) {
        throw 'No completed asset import for this source export. Run build-native.ps1 -ImportAssets -SkipExport -Package.'
    }
    if (!(Test-Path -LiteralPath $mapPath -PathType Leaf)) { throw 'The imported Proving Ground map is missing. Rerun -ImportAssets.' }
    if (!(Test-Path -LiteralPath $maskPath -PathType Leaf) -or $receipt.terrainBlendSHA256 -ne (Get-BuildFileHash $maskPath)) {
        throw 'Terrain mask differs from the completed asset import. Run build-native.ps1 -ImportAssets -SkipExport -Package.'
    }
    return (Get-BuildFileHash $importMarker)
}
if ($ImportAssets -and $SkipExport) {
    $exportHash=Get-SourceExportHash
}
if (!$SkipBuild) {
    & "$engineRoot\Engine\Build\BatchFiles\Build.bat" TerraDriveEditor Win64 Development "-Project=$project" -WaitMutex -NoHotReloadFromIDE -NoUBA -MaxParallelActions=2
    if ($LASTEXITCODE) { throw 'Editor compilation failed' }
}
if ($ImportAssets) {
    if (!$SkipExport) {
        & node (Join-Path $PSScriptRoot 'export-source.mjs')
        if ($LASTEXITCODE) { throw 'Source conversion failed' }
        $exportHash=Get-SourceExportHash
    }
    # An interrupted import must invalidate even a receipt for identical inputs.
    if (Test-Path -LiteralPath $importMarker) { Remove-Item -LiteralPath $importMarker }
    if (Test-Path -LiteralPath $cookMarker) { Remove-Item -LiteralPath $cookMarker }
    & node (Join-Path $PSScriptRoot 'bake-vehicle-ground-probes.mjs')
    if($LASTEXITCODE){throw 'Vehicle lower-body probe generation failed'}
    & node (Join-Path $PSScriptRoot 'bake-tire-probes.mjs')
    if($LASTEXITCODE){throw 'Vehicle tire rollover probe generation failed'}
    & node (Join-Path $PSScriptRoot 'bake-coachwork-collision.mjs')
    if($LASTEXITCODE){throw 'Vehicle coachwork collision generation failed'}
    & node (Join-Path $PSScriptRoot 'bake-terrain-transitions.mjs')
    if($LASTEXITCODE){throw 'Terrain transition mask generation failed'}
    $maskHash=Get-BuildFileHash $maskPath
    # PythonScriptCommandlet interprets backslash escapes (notably the \t in
    # "\terra drive"). Forward slashes preserve paths containing spaces.
    $scriptPath=(Join-Path $PSScriptRoot 'import-assets.py').Replace('\','/')
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
    if (!(Test-Path -LiteralPath $importMarker) -or (Get-Item -LiteralPath $importMarker).LastWriteTime -lt $started -or !(Test-Path -LiteralPath $mapPath)) { throw "Asset import did not produce a fresh completion marker and map. Inspect the batch logs in Saved/Logs." }
    $importReceipt=Read-BuildReceipt $importMarker
    if ($importReceipt.complete -ne $true -or $importReceipt.meshes -ne $taskAssetCount -or !$taskAssetCount) { throw 'Asset import completion marker does not match the imported mesh list' }
    if ((Get-SourceExportHash) -ne $exportHash -or (Get-BuildFileHash $maskPath) -ne $maskHash) { throw 'Source export or terrain mask changed during import. Rerun -ImportAssets.' }
    $importReceipt | Add-Member -NotePropertyName sourceExportSHA256 -NotePropertyValue $exportHash
    $importReceipt | Add-Member -NotePropertyName terrainBlendSHA256 -NotePropertyValue $maskHash
    Write-BuildReceipt $importMarker $importReceipt
}
if ($Package) {
    $importHash=Get-CompletedImportHash
    & node (Join-Path $PSScriptRoot 'garden-geology.mjs')
    if($LASTEXITCODE){throw 'Garden geology cache generation failed'}
    foreach ($required in @('Content\NativeData\vehicle-ground-probes.json','Content\NativeData\vehicle-collision.json','Content\NativeData\vehicle-tire-probes.json')) {
        if (!(Test-Path -LiteralPath (Join-Path $projectRoot $required))) {
            throw "Missing $required. Run with -ImportAssets before packaging."
        }
    }
    $cookArgument='-cook'
    if ($SkipCook) {
        $cookReceipt=Read-BuildReceipt $cookMarker
        if ($cookReceipt.assetImportSHA256 -ne $importHash -or !(Test-Path -LiteralPath (Join-Path $projectRoot 'Saved\Cooked\Windows'))) {
            throw '-SkipCook requires a successful prior cook for this asset import. Rerun -Package without -SkipCook.'
        }
        $cookArgument='-skipcook'
    } elseif (Test-Path -LiteralPath $cookMarker) {
        Remove-Item -LiteralPath $cookMarker
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
    if (!$SkipCook) {
        if ((Get-CompletedImportHash) -ne $importHash) { throw 'Asset import changed during packaging. Rerun -Package.' }
        Write-BuildReceipt $cookMarker @{assetImportSHA256=$importHash}
    }
}
