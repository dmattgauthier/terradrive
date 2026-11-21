param([switch]$Package,[switch]$ImportAssets,[switch]$SkipBuild,[switch]$SkipExport,[switch]$SkipCook,[ValidateRange(1,512)][int]$ImportBatchSize=8,
      [string]$EngineRoot,[string]$ArchiveDirectory,
      [switch]$DriveLocalData,[ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$')][string]$BuildLabel,
      [ValidateRange(0,6)][int]$CookShaderWorkers=0)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$project=Join-Path $projectRoot 'TerraDrive.uproject'
if(!$ArchiveDirectory){$ArchiveDirectory=Join-Path $projectRoot 'Build'}
$ArchiveDirectory=[IO.Path]::GetFullPath($ArchiveDirectory)
$drive=[IO.Path]::GetPathRoot($projectRoot)
if(!$EngineRoot){
    $sameDriveEngine=Join-Path $drive 'TerraDriveTools\UE_5.8'
    if(Test-Path -LiteralPath (Join-Path $sameDriveEngine 'Engine\Build\BatchFiles\Build.bat') -PathType Leaf){
        $EngineRoot=$sameDriveEngine
        $DriveLocalData=$true
    } else {
        $EngineRoot='C:\Program Files\Epic Games\UE_5.8'
    }
}
$engineRoot=[IO.Path]::GetFullPath($EngineRoot)
$automationLogDirectory=Join-Path $projectRoot 'Saved\AutomationLogs'
$buildEnvironment=@{
    UBA_ROOT=Join-Path $projectRoot 'Saved\UBA'
    uebp_LogFolder=$automationLogDirectory
    uebp_FinalLogFolder=$automationLogDirectory
}
if($DriveLocalData){
    foreach($path in @($engineRoot,$ArchiveDirectory)){
        if([IO.Path]::GetPathRoot($path) -ne $drive){
            throw "Drive-local packaging needs the engine and output on $drive. Received $path."
        }
    }
    $cache=Join-Path $projectRoot 'Saved\BuildData'
    $variables=@{
        TEMP='Temp'; TMP='Temp'; APPDATA='AppData\Roaming'; LOCALAPPDATA='AppData\Local'
        DOTNET_CLI_HOME='DotNet'; 'UE-LocalDataCachePath'='DerivedDataCache'; TERRA_UNREAL_USER_SETTINGS='UnrealUserSettings'
    }
    foreach($name in $variables.Keys){
        $path=Join-Path $cache $variables[$name]
        [void][IO.Directory]::CreateDirectory($path)
        $buildEnvironment[$name]=$path
    }
}
$editorCacheArgs=@()
$cookerOptions=@()
$uatEditorArgs=@()
$buildArgs=@()
$uatBuildArguments='-NoUBA -MaxParallelActions=2'
if($DriveLocalData){
    $editorCacheArgs=@('-DDC=InstalledNoZenLocalFallback')
    $cookerOptions+='-DDC=InstalledNoZenLocalFallback'
    # A relocated installed engine can carry shared PCHs with absolute paths.
    $buildArgs=@('-NoPCH',("-Log="+(Join-Path $cache 'Editor-build.log')))
    $uatBuildArguments+=' -NoPCH'
    # The script builds the editor separately above. UAT's editor target
    # does not receive game -UbtArgs and can reuse a C:-bound PCH.
    $uatEditorArgs=@('-skipbuildeditor')
}
if($CookShaderWorkers){
    $logical=[Environment]::ProcessorCount
    $reserved=[Math]::Max(2,$logical-$CookShaderWorkers)
    $percentage=[Math]::Floor(100*$reserved/[Math]::Max(1,$logical))
    $cookerOptions+=@("-ini:Engine:[DevOptions.Shaders]:NumUnusedShaderCompilingThreads=$reserved",
        "-ini:Engine:[DevOptions.Shaders]:PercentageUnusedShaderCompilingThreads=$percentage")
}
$cookerCacheArgs=@()
if($cookerOptions.Count){$cookerCacheArgs=@('-AdditionalCookerOptions='+($cookerOptions -join ' '))}
$revision=$null
if($BuildLabel){
    if(!$Package){throw '-BuildLabel requires -Package.'}
    $revision=(& git -C $projectRoot rev-parse HEAD)
    if($LASTEXITCODE -or $revision -notmatch '^[a-f0-9]{40}$'){throw 'Could not identify build source revision.'}
    $changed=@(& git -C $projectRoot status --porcelain --untracked-files=normal)
    if($LASTEXITCODE -or $changed.Count){throw 'Commit the source before packaging a labeled revision.'}
}
$importMarker=Join-Path $projectRoot 'Saved\import-complete.json'
$cookMarker=Join-Path $projectRoot 'Saved\native-cook-complete.json'
$cookPath=Join-Path $projectRoot 'Saved\Cooked\Windows'
$maskPath=Join-Path $projectRoot 'Content\NativeData\terrain-blend.bin'
$mapPath=Join-Path $projectRoot 'Content\Maps\ProvingGround.umap'
$carcassRecipe=Join-Path $PSScriptRoot 'tire-carcass-materials.py'

function New-DriveLocalUnrealHook {
    $sdkRoot=Join-Path $engineRoot 'Engine\Binaries\ThirdParty\DotNet\10.0\win-x64'
    $sdk=Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'sdk') -Directory |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    $refs=Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'packs\Microsoft.NETCore.App.Ref') -Directory |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    $hook=Join-Path $cache 'TerraUnrealBuildSettings.dll'
    $options=@(
        '-nologo','-noconfig','-nostdlib+','-target:library','-deterministic+',
        ('-reference:'+(Join-Path $refs.FullName 'ref\net10.0\System.Runtime.dll')),
        ('-reference:'+(Join-Path $refs.FullName 'ref\net10.0\System.Console.dll')),
        ('-out:'+$hook),(Join-Path $PSScriptRoot 'TerraUnrealBuildSettings.cs')
    )
    & (Join-Path $sdkRoot 'dotnet.exe') exec (Join-Path $sdk.FullName 'Roslyn\bincore\csc.dll') @options | Out-Host
    if($LASTEXITCODE){throw 'Could not compile the drive-local Unreal build settings hook'}
    return $hook
}

function Get-SourceExportHash {
    $output=@(& node (Join-Path $PSScriptRoot 'verify-source-export.mjs'))
    if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1 -or $output[0] -notmatch '^[0-9a-f]{64}$') { throw 'Native source export verification failed' }
    return $output[0]
}
function Get-VehicleCollisionHash {
    $output=@(& node (Join-Path $PSScriptRoot 'verify-baked-vehicle-collision.mjs'))
    if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1 -or $output[0] -notmatch '^[0-9a-f]{64}$') {
        throw 'Vehicle collision bake verification failed. Rerun -ImportAssets.'
    }
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
function Get-CookedTreeHash {
    $directory=Get-Item -LiteralPath $cookPath -ErrorAction SilentlyContinue
    if (!$directory.PSIsContainer -or (Test-Path -LiteralPath (Join-Path $cookPath 'ue.projectstore'))) {
        throw 'A file-backed Windows cook is required. Rerun -Package without -SkipCook.'
    }
    $entries=[Collections.Generic.List[string]]::new()
    foreach ($file in Get-ChildItem -LiteralPath $directory.FullName -Recurse -Force -File) {
        $relative=$file.FullName.Substring($directory.FullName.Length+1).Replace('\','/')
        $entries.Add($relative + ':' + (Get-BuildFileHash $file.FullName))
    }
    if (!$entries.Count) { throw 'The cooked Windows tree is empty. Rerun -Package without -SkipCook.' }
    $entries.Sort([StringComparer]::Ordinal)
    $bytes=[Text.Encoding]::UTF8.GetBytes([string]::Join("`n",$entries.ToArray()))
    $sha=[Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
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
    if (!$receipt.vehicleCollisionSHA256 -or $receipt.vehicleCollisionSHA256 -ne (Get-VehicleCollisionHash)) {
        throw 'Vehicle collision bake differs from the completed asset import. Run build-native.ps1 -ImportAssets -SkipExport -Package.'
    }
    return (Get-BuildFileHash $importMarker)
}
function Restore-BuildEnvironment([hashtable]$Snapshot) {
    foreach($name in $Snapshot.Keys){
        if($null -eq $Snapshot[$name]){
            Remove-Item -LiteralPath ('Env:'+$name) -ErrorAction SilentlyContinue
        } else {
            [Environment]::SetEnvironmentVariable($name,$Snapshot[$name],'Process')
        }
    }
}
function Import-NativeAssets {
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
    $collisionHash=Get-VehicleCollisionHash
    & node (Join-Path $PSScriptRoot 'bake-terrain-transitions.mjs')
    if($LASTEXITCODE){throw 'Terrain transition mask generation failed'}
    $maskHash=Get-BuildFileHash $maskPath
    # PythonScriptCommandlet interprets backslash escapes (notably the \t in
    # "\terra drive"). Forward slashes preserve paths containing spaces.
    $scriptPath=(Join-Path $PSScriptRoot 'import-assets.py').Replace('\','/')
    $started=Get-Date
    $taskImportData=Get-Content -LiteralPath (Join-Path $projectRoot 'SourceAssets/import.json') -Raw|ConvertFrom-Json
    $taskAssetCount=@($taskImportData.assets).Count
    $previousImportEnvironment=@{
        TERRA_IMPORT_START=[Environment]::GetEnvironmentVariable('TERRA_IMPORT_START','Process')
        TERRA_IMPORT_END=[Environment]::GetEnvironmentVariable('TERRA_IMPORT_END','Process')
    }
    try {
        for($taskStart=0;$taskStart -lt $taskAssetCount;$taskStart+=$ImportBatchSize){
            $taskEnd=[Math]::Min($taskAssetCount,$taskStart+$ImportBatchSize)
            $env:TERRA_IMPORT_START=[string]$taskStart;$env:TERRA_IMPORT_END=[string]$taskEnd
            $taskBatchLog=Join-Path $projectRoot ('Saved/Logs/import-assets-'+$taskStart+'.log')
            $editorArgs=@(('"'+$project+'"'),'-run=pythonscript',('-script="'+$scriptPath+'"'),'-unattended','-nullrhi','-nosplash','-NoSound','-stdout','-FullStdOutLogOutput',('-abslog="'+$taskBatchLog+'"'))
            $editorProcess=Start-Process -FilePath "$engineRoot\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" -ArgumentList ($editorArgs+$editorCacheArgs) -WindowStyle Hidden -PassThru
            # Wait for the commandlet itself, without waiting for cache helpers.
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
        Restore-BuildEnvironment $previousImportEnvironment
    }
    if (!(Test-Path -LiteralPath $importMarker) -or (Get-Item -LiteralPath $importMarker).LastWriteTime -lt $started -or !(Test-Path -LiteralPath $mapPath)) { throw "Asset import did not produce a fresh completion marker and map. Inspect the batch logs in Saved/Logs." }
    $importReceipt=Read-BuildReceipt $importMarker
    if ($importReceipt.complete -ne $true -or $importReceipt.meshes -ne $taskAssetCount -or !$taskAssetCount) { throw 'Asset import completion marker does not match the imported mesh list' }
    if ((Get-SourceExportHash) -ne $exportHash -or (Get-BuildFileHash $maskPath) -ne $maskHash) { throw 'Source export or terrain mask changed during import. Rerun -ImportAssets.' }
    if ((Get-VehicleCollisionHash) -ne $collisionHash) { throw 'Vehicle collision bake changed during import. Rerun -ImportAssets.' }
    $importReceipt | Add-Member -NotePropertyName sourceExportSHA256 -NotePropertyValue $exportHash
    $importReceipt | Add-Member -NotePropertyName terrainBlendSHA256 -NotePropertyValue $maskHash
    $importReceipt | Add-Member -NotePropertyName vehicleCollisionSHA256 -NotePropertyValue $collisionHash
    Write-BuildReceipt $importMarker $importReceipt
}
function Build-WindowsPackage {
    $importHash=Get-CompletedImportHash
    $carcassHash=Get-BuildFileHash $carcassRecipe
    $cookReceipt=$null
    try { $cookReceipt=Read-BuildReceipt $cookMarker }
    catch { if ($SkipCook) { throw } }
    $cookArgument='-cook'
    if ($SkipCook) {
        if ($cookReceipt.tireCarcassRecipeSHA256 -ne $carcassHash) {
            throw 'The tire material recipe differs from the completed cook. Rerun -Package without -SkipCook.'
        }
        if ($cookReceipt.assetImportSHA256 -ne $importHash -or !$cookReceipt.cookedTreeSHA256) {
            throw '-SkipCook requires a successful prior cook for this asset import. Rerun -Package without -SkipCook.'
        }
        if ($cookReceipt.cookedTreeSHA256 -ne (Get-CookedTreeHash)) {
            throw 'The cooked Windows tree differs from the completed cook. Rerun -Package without -SkipCook.'
        }
        $cookArgument='-skipcook'
    } else {
        if (Test-Path -LiteralPath $cookMarker) { Remove-Item -LiteralPath $cookMarker }
        if (!$ImportAssets -and ($cookReceipt.tireCarcassRecipeSHA256 -ne $carcassHash -or $cookReceipt.assetImportSHA256 -ne $importHash)) {
            # Refresh the material and its bindings on previously imported tires.
            $recipePath=$carcassRecipe.Replace('\','/')
            $materialLog=Join-Path $projectRoot ('Saved/Logs/tire-carcass-materials-'+(Get-Date -Format 'yyyyMMddTHHmmssfff')+'-'+$PID+'.log')
            $editorArgs=@(('"'+$project+'"'),'-run=pythonscript',('-script="'+$recipePath+'"'),
                '-unattended','-nullrhi','-nosplash','-NoSound','-stdout','-FullStdOutLogOutput',('-abslog="'+$materialLog+'"'))
            $materialStarted=Get-Date
            $editorProcess=Start-Process -FilePath "$engineRoot\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" -ArgumentList ($editorArgs+$editorCacheArgs) -WindowStyle Hidden -PassThru
            $editorProcess.WaitForExit()
            $editorProcess.Refresh()
            $generatedLog=Get-Item -LiteralPath $materialLog -ErrorAction SilentlyContinue
            if ($editorProcess.ExitCode -or !$generatedLog -or $generatedLog.LastWriteTime -lt $materialStarted -or
                !(Select-String -LiteralPath $materialLog -Pattern 'TERRA_TIRE_CARCASS_BINDINGS meshes=[1-9]\d* updated=\d+\s*$' -Quiet)) {
                throw "Tire material refresh failed. Inspect $materialLog."
            }
        }
    }
    & node (Join-Path $PSScriptRoot 'garden-geology.mjs')
    if($LASTEXITCODE){throw 'Garden geology cache generation failed'}
    $windows=Join-Path $ArchiveDirectory 'Windows'
    $profileScript=Join-Path $PSScriptRoot 'Initialize Terra Drive Profile.ps1'
    & $profileScript -PackageDirectory $windows
    $packageStarted=Get-Date
    & "$engineRoot\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun "-project=$project" -noP4 -platform=Win64 -clientconfig=Development -build $cookArgument -stage -pak -iostore -archive -nodebuginfo "-archivedirectory=$ArchiveDirectory" -unattended -utf8output "-UbtArgs=$uatBuildArguments" @cookerCacheArgs @uatEditorArgs
    if ($LASTEXITCODE) { throw 'Packaging failed' }
    if (!$SkipCook) {
        $cookLogs=@(Get-ChildItem -LiteralPath $env:uebp_LogFolder -Filter 'Cook-*.txt' | Where-Object { $_.LastWriteTime -ge $packageStarted })
        if (!$cookLogs.Count) { throw 'Full cook did not leave a fresh shader diagnostic log.' }
        $shaderFailures=@($cookLogs | Select-String -Pattern 'Failed to compile Material|doesn.t have a valid ShaderMap')
        if ($shaderFailures.Count) { throw "Cook substituted invalid material shaders. Inspect $($cookLogs[0].FullName)." }
    }
    if (!(Test-Path -LiteralPath (Join-Path $ArchiveDirectory 'Windows\TerraDrive.exe'))) {
        throw 'AutomationTool returned success but the packaged launcher is missing.'
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Start Terra Drive.cmd'),$profileScript -Destination $windows
    $buildInfo=Join-Path $windows 'TerraDrive\Content\NativeData\build-info.json'
    if($BuildLabel){
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($buildInfo))
        Write-BuildReceipt $buildInfo @{
            label=$BuildLabel; revision=$revision; assetImportSHA256=$importHash
            executableSHA256=(Get-BuildFileHash (Join-Path $windows 'TerraDrive\Binaries\Win64\TerraDrive.exe'))
        }
    } elseif(Test-Path -LiteralPath $buildInfo -PathType Leaf){
        Remove-Item -LiteralPath $buildInfo
    }
    if (!$SkipCook) {
        if ((Get-CompletedImportHash) -ne $importHash) { throw 'Asset import changed during packaging. Rerun -Package.' }
        if ((Get-BuildFileHash $carcassRecipe) -ne $carcassHash) { throw 'Tire material recipe changed during packaging. Rerun -Package.' }
        Write-BuildReceipt $cookMarker @{assetImportSHA256=$importHash; tireCarcassRecipeSHA256=$carcassHash; cookedTreeSHA256=(Get-CookedTreeHash)}
    }
}

$previousBuildEnvironment=@{}
try {
    foreach($name in $buildEnvironment.Keys){
        $previousBuildEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
        [Environment]::SetEnvironmentVariable($name,$buildEnvironment[$name],'Process')
    }
    if($DriveLocalData -and (!$SkipBuild -or $Package)){
        $hook=New-DriveLocalUnrealHook
        $previousBuildEnvironment['DOTNET_STARTUP_HOOKS']=$env:DOTNET_STARTUP_HOOKS
        $env:DOTNET_STARTUP_HOOKS=(@($hook,$env:DOTNET_STARTUP_HOOKS)|Where-Object {$_}) -join [IO.Path]::PathSeparator
    }
    if ($ImportAssets -and $SkipExport) {
        $exportHash=Get-SourceExportHash
    }
    if (!$SkipBuild) {
        & "$engineRoot\Engine\Build\BatchFiles\Build.bat" TerraDriveEditor Win64 Development "-Project=$project" -WaitMutex -NoHotReloadFromIDE -NoUBA -MaxParallelActions=2 @buildArgs
        if ($LASTEXITCODE) { throw 'Editor compilation failed' }
    }
    if ($ImportAssets) { Import-NativeAssets }
    if ($Package) { Build-WindowsPackage }
} finally {
    Restore-BuildEnvironment $previousBuildEnvironment
}
