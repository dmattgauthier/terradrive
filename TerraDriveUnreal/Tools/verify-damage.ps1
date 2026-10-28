param(
    [ValidatePattern('^[a-z0-9-]+$')][string]$Name='damage',
    [ValidateRange(60,600)][int]$TimeoutSeconds=600,
    [ValidateRange(15,90)][int]$StartupTimeoutSeconds=90
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(@(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd,UnrealPak,ShaderCompileWorker,UnrealBuildTool -ErrorAction SilentlyContinue).Count){
    throw 'Close engine and game processes before the isolated damage check.'
}
$taskExe=Join-Path $taskRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
if(!(Test-Path -LiteralPath $taskExe -PathType Leaf)){throw 'The packaged native executable is missing.'}
$taskGpuCommand=Get-Command nvidia-smi -ErrorAction SilentlyContinue
if(!$taskGpuCommand){throw 'NVIDIA temperature monitoring must be available for this guarded native check.'}
$taskOutput=Join-Path $taskRoot 'Saved/Validation'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskReport=Join-Path $taskOutput ($Name+'.json')
$taskLog=Join-Path $taskOutput ($Name+'.log')
$taskTelemetry=Join-Path $taskOutput ($Name+'-gpu.json')
$taskReceipt=Join-Path $taskOutput ($Name+'-receipt.json')
$taskUser=Join-Path $taskOutput ($Name+'-user-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $taskUser -Force | Out-Null
$taskStartedAt=[DateTime]::UtcNow
$taskExeHash=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant()

# UE 5.8 FPaths::CustomUserDirArgument feeds ProjectUserDir and ProjectSavedDir.
# This isolates the engine's GameUserSettings.ini as well as the game's JSON
# garage and graphics settings. The ordinary user files are never rewritten.
$taskUserFiles=@(
    'Saved/garage-builds.json','Saved/graphics-settings.json','Saved/Config/Windows/GameUserSettings.ini',
    'Build/Windows/TerraDrive/Saved/garage-builds.json','Build/Windows/TerraDrive/Saved/graphics-settings.json',
    'Build/Windows/TerraDrive/Saved/Config/Windows/GameUserSettings.ini'
)
$taskBefore=@{}
foreach($taskRelative in $taskUserFiles){
    $taskFile=Join-Path $taskRoot $taskRelative
    $taskBefore[$taskRelative]=if(Test-Path -LiteralPath $taskFile -PathType Leaf){(Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash}else{$null}
}
$taskSamples=[Collections.Generic.List[object]]::new()
function Read-TaskGpu {
    $taskLines=& $taskGpuCommand.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used --format=csv,noheader,nounits
    if($LASTEXITCODE -ne 0){throw 'GPU monitoring failed during the native check.'}
    $taskValid=0
    foreach($taskLine in $taskLines){
        $taskParts=@($taskLine -split ',\s*')
        if($taskParts.Count -ne 4){throw 'GPU monitoring returned an incomplete sample.'}
        $taskCulture=[Globalization.CultureInfo]::InvariantCulture
        $taskSample=[pscustomobject]@{
            elapsed=([DateTime]::UtcNow-$taskStartedAt).TotalSeconds
            temperatureC=[double]::Parse($taskParts[0],$taskCulture)
            utilizationPercent=[double]::Parse($taskParts[1],$taskCulture)
            powerW=[double]::Parse($taskParts[2],$taskCulture)
            memoryMiB=[double]::Parse($taskParts[3],$taskCulture)
        }
        $taskSamples.Add($taskSample);$taskValid++
        if($taskSample.temperatureC -ge 77){throw 'GPU reached the conservative 77 C cutoff.'}
    }
    if(!$taskValid){throw 'No GPU temperature sample was available.'}
}
$taskArgs=@(
    '-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound',
    '-TerraValidate','-TerraCapture','-TerraDamageOnly','-TerraTestFPS=20','-TerraGraphicsMode=2',
    ('-UserDir="'+$taskUser+'"'),('-TerraReport="'+$taskReport+'"'),
    ('-TerraGarage="'+(Join-Path $taskUser 'Saved/garage-builds.json')+'"'),
    ('-TerraGraphics="'+(Join-Path $taskUser 'Saved/graphics-settings.json')+'"'),('-abslog="'+$taskLog+'"')
)
$taskInfo=[Diagnostics.ProcessStartInfo]::new()
$taskInfo.FileName=$taskExe;$taskInfo.Arguments=$taskArgs -join ' '
$taskInfo.WorkingDirectory=Split-Path $taskExe -Parent
$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$taskGame=[Diagnostics.Process]::new();$taskGame.StartInfo=$taskInfo
$taskLaunched=$false;$taskReady=$false;$taskError=$null
try {
    Read-TaskGpu
    if(!$taskGame.Start()){throw 'The packaged game did not start.'}
    $taskLaunched=$true
    while(!$taskGame.WaitForExit(1500)){
        $taskElapsed=([DateTime]::UtcNow-$taskStartedAt).TotalSeconds
        if($taskElapsed -gt $TimeoutSeconds){throw 'Damage validation exceeded its bounded deadline.'}
        if(!$taskReady -and (Test-Path -LiteralPath $taskLog)){
            $taskReady=[bool](Select-String -LiteralPath $taskLog -Pattern 'TERRA_DAMAGE_READY' -Quiet)
        }
        if(!$taskReady -and $taskElapsed -gt $StartupTimeoutSeconds){throw 'The native vehicle suite did not reach its first configured trial before the startup deadline.'}
        Read-TaskGpu
    }
}catch {
    $taskError=$_.Exception.Message
}finally {
    if($taskLaunched -and !$taskGame.HasExited){
        try{$taskGame.Kill($true)}catch{$taskGame.Kill()}
        [void]$taskGame.WaitForExit(5000)
    }
    ConvertTo-Json -InputObject @($taskSamples.ToArray()) -Depth 4 | Set-Content -LiteralPath $taskTelemetry -Encoding UTF8
}
$taskExit=if($taskLaunched -and $taskGame.HasExited){$taskGame.ExitCode}else{$null}
$taskSettingsUnchanged=$true
$taskSettings=@()
foreach($taskRelative in $taskUserFiles){
    $taskFile=Join-Path $taskRoot $taskRelative
    $taskAfter=if(Test-Path -LiteralPath $taskFile -PathType Leaf){(Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash}else{$null}
    $taskSame=$taskBefore[$taskRelative] -eq $taskAfter;$taskSettingsUnchanged=$taskSettingsUnchanged -and $taskSame
    $taskSettings+=@([pscustomobject]@{path=$taskRelative;beforeSHA256=$taskBefore[$taskRelative];afterSHA256=$taskAfter;unchanged=$taskSame})
}
$taskFreshReport=(Test-Path -LiteralPath $taskReport -PathType Leaf) -and (Get-Item -LiteralPath $taskReport).LastWriteTimeUtc -ge $taskStartedAt
$taskFreshLog=(Test-Path -LiteralPath $taskLog -PathType Leaf) -and (Get-Item -LiteralPath $taskLog).LastWriteTimeUtc -ge $taskStartedAt
$taskResult=if($taskFreshReport){Get-Content -LiteralPath $taskReport -Raw | ConvertFrom-Json}else{$null}
$taskTests=if($taskResult -and $null -ne $taskResult.tests){@($taskResult.tests)}else{@()}
$taskFailures=@($taskTests | Where-Object {!$_.pass})
$taskErrors=if($taskFreshLog){@(Select-String -LiteralPath $taskLog -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag|TERRA_DAMAGE_MESH_UNAVAILABLE')}else{@()}
$taskUnique=@($taskTests | ForEach-Object {$_.case} | Sort-Object -Unique).Count
$taskExeUnchanged=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant() -eq $taskExeHash

# Only these explicit files are accepted and copied to the usual capture
# folder. Keep each isolated run as diagnostic evidence, including failures.
$taskNames=[Collections.Generic.List[string]]::new()
foreach($taskIndex in 0..8){foreach($taskPose in @('object','free-run','roof-rolled','roof')){$taskNames.Add(('native-damage-v{0}-{1}.png' -f $taskIndex,$taskPose))}}
foreach($taskBoundary in @('dirt-asphalt','dirt-mud','dirt-rock','dirt-sand','dirt-snow','dirt-wetland','mud-rock')){$taskNames.Add(('native-damage-transition-{0}.png' -f $taskBoundary))}
$taskNames.Add('native-damage-garage-enabled.png');$taskNames.Add('native-damage-garage-free-run.png')
$taskCaptureSource=Join-Path $taskUser 'Saved/Screenshots'
$taskCaptureOutput=Join-Path $taskRoot 'Build/Windows/TerraDrive/Saved/Screenshots'
New-Item -ItemType Directory -Path $taskCaptureOutput -Force | Out-Null
$taskCaptures=@();$taskMissing=@()
foreach($taskFilename in $taskNames){
    $taskImage=Join-Path $taskCaptureSource $taskFilename
    if(!(Test-Path -LiteralPath $taskImage -PathType Leaf) -or (Get-Item -LiteralPath $taskImage).LastWriteTimeUtc -lt $taskStartedAt){$taskMissing+=@($taskFilename);continue}
    $taskStream=[IO.File]::OpenRead($taskImage);$taskHeader=[byte[]]::new(24)
    try{$taskRead=$taskStream.Read($taskHeader,0,24)}finally{$taskStream.Dispose()}
    if($taskRead -ne 24 -or [BitConverter]::ToString($taskHeader[0..7]) -ne '89-50-4E-47-0D-0A-1A-0A'){throw ('Invalid native PNG capture: '+$taskFilename)}
    $taskWidth=[int]$taskHeader[16]*16777216+[int]$taskHeader[17]*65536+[int]$taskHeader[18]*256+[int]$taskHeader[19]
    $taskHeight=[int]$taskHeader[20]*16777216+[int]$taskHeader[21]*65536+[int]$taskHeader[22]*256+[int]$taskHeader[23]
    $taskHash=(Get-FileHash -LiteralPath $taskImage -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskDestination=Join-Path $taskCaptureOutput $taskFilename
    Copy-Item -LiteralPath $taskImage -Destination $taskDestination -Force
    $taskCopied=(Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash.ToLowerInvariant()
    if($taskHash -ne $taskCopied -or $taskWidth -ne 1600 -or $taskHeight -ne 900){throw ('Capture hash or dimensions differ from the native request: '+$taskFilename)}
    $taskCaptures+=@([pscustomobject]@{filename=$taskFilename;path=$taskDestination;isolatedPath=$taskImage;SHA256=$taskHash;width=$taskWidth;height=$taskHeight})
}
$taskPassed=!$taskError -and $taskExit -eq 0 -and $taskFreshReport -and $taskFreshLog -and $taskTests.Count -eq 228 -and $taskUnique -eq 228 -and
    $taskFailures.Count -eq 0 -and $taskErrors.Count -eq 0 -and $taskMissing.Count -eq 0 -and $taskCaptures.Count -eq 45 -and $taskSettingsUnchanged -and $taskExeUnchanged
$taskRecord=[ordered]@{
    version=1;suite='damage';passed=$taskPassed;startedAt=$taskStartedAt.ToString('o');completedAt=[DateTime]::UtcNow.ToString('o')
    executable=$taskExe;executableSHA256=$taskExeHash;executableUnchanged=$taskExeUnchanged;processExitCode=$taskExit
    expectedChecks=228;actualChecks=$taskTests.Count;uniqueChecks=$taskUnique;failures=$taskFailures.Count;renderErrors=$taskErrors.Count
    expectedCaptures=45;captures=$taskCaptures;missingCaptures=$taskMissing
    report=$taskReport;freshReport=$taskFreshReport;log=$taskLog;freshLog=$taskFreshLog;startupReady=$taskReady
    timeoutSeconds=$TimeoutSeconds;startupTimeoutSeconds=$StartupTimeoutSeconds;frameLimit=20;temperatureCutoffC=77
    maxTemperatureC=($taskSamples | Measure-Object -Property temperatureC -Maximum).Maximum;gpuTelemetry=$taskTelemetry
    isolatedUserDirectory=$taskUser;settingsUnchanged=$taskSettingsUnchanged;userSettings=$taskSettings;error=$taskError
}
$taskRecord | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $taskReceipt -Encoding UTF8
if(!$taskPassed){
    $taskFailures | Select-Object case,value,pass | Format-Table -AutoSize | Out-String | Write-Output
    if($taskError){Write-Output $taskError}
    throw ('Damage validation failed: '+$taskTests.Count+'/228 checks, '+$taskCaptures.Count+'/45 fresh captures; receipt '+$taskReceipt)
}
Write-Output ('PASS 228 native damage checks; 45 fresh captures; exit 0; user settings unchanged. Receipt: '+$taskReceipt)
