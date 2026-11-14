param([ValidateSet('SixWheel','Art','UrusArt','Quarry','Interface','Mechanical','ElectricPressure','Rollover','Ruts','Garden','Transitions','Detail','Movement','RutTransitions','Perimeter','Challenges','Expanded','Recovery','GraveRecovery','RolloverPerformance')][string]$Mode='SixWheel',[string]$OutputDirectory='',[int]$TimeoutSeconds=1800,[ValidateRange(-1,11)][int]$RolloverQuickVehicle=-1,[string]$PackageDirectory='',[switch]$QuarrySurvey,[ValidateRange(0,11)][int]$PerformanceVehicle=10,[ValidateRange(0,3)][int]$TireSizeStage=0,[switch]$LegacyRolledTires,[switch]$ContactDiagnostics,[ValidateRange(-1,11)][int]$ArtVehicle=-1,[string]$SavedBuild='')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'staged-package-content.ps1')
if($RolloverQuickVehicle -ge 0 -and $Mode -ne 'Rollover'){throw '-RolloverQuickVehicle requires Rollover mode.'}
if($ArtVehicle -ge 0 -and $Mode -ne 'Art'){throw '-ArtVehicle requires Art mode.'}
if($QuarrySurvey -and $Mode -ne 'Quarry'){throw '-QuarrySurvey requires Quarry mode.'}
if($SavedBuild -and $Mode -ne 'RolloverPerformance'){throw '-SavedBuild requires RolloverPerformance mode.'}
if(($TireSizeStage -gt 0 -or $LegacyRolledTires) -and $Mode -notin @('Rollover','RolloverPerformance')){throw 'Tire rollover options require a rollover mode.'}
$taskRoot=Split-Path $PSScriptRoot -Parent
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd,UnrealPak,ShaderCompileWorker -ErrorAction SilentlyContinue){throw 'Close game/editor before native validation.'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $taskRoot ('Saved/FidelityValidation-'+$Mode+'-'+(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ssZ'))}
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
if((Test-Path -LiteralPath $taskOutput) -and @(Get-ChildItem -LiteralPath $taskOutput -Force).Count){throw 'Preserve existing evidence; choose a new output directory.'}
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskReport=Join-Path $taskOutput 'result.json';$taskCaptures=Join-Path $taskOutput 'Screenshots'
New-Item -ItemType Directory -Path $taskCaptures -Force | Out-Null
if(!$PackageDirectory){$PackageDirectory=Join-Path $taskRoot 'Build/Windows'}
$taskPackage=(Resolve-Path -LiteralPath $PackageDirectory).ProviderPath
$taskExe=Join-Path $taskPackage 'TerraDrive/Binaries/Win64/TerraDrive.exe'
$taskFlags=@{SixWheel='-TerraSixWheelOnly';Art='-TerraModelHeroOnly';UrusArt='-TerraHeroOnly';Quarry='-TerraTrailOnly';Interface='-TerraInterfaceOnly';Mechanical='-TerraMechanicalOnly';ElectricPressure='-TerraElectricPressureOnly';Rollover='-TerraRolloverOnly';Ruts='-TerraRutOnly';Garden='-TerraGardenOnly';Transitions='-TerraTransitionsOnly';Detail='-TerraTerrainDetailOnly';Movement='-TerraMomentumOnly'}
$taskFlags.RutTransitions='-TerraRutTransitionOnly'
$taskFlags.Perimeter='-TerraPerimeterOnly'
$taskFlags.Challenges='-TerraChallengesOnly'
$taskFlags.Expanded='-TerraExpandedOnly'
$taskFlags.Recovery='-TerraRecoveryOnly'
$taskFlags.GraveRecovery='-TerraGraveRecoveryOnly'
$taskFlags.RolloverPerformance='-TerraRolloverPerformanceOnly'
$taskQuality=if($Mode -in @('Art','UrusArt','Quarry','Garden','Ruts','Transitions','Detail','RutTransitions','Expanded')){2}else{0}
$taskArguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-NoTrace','-TerraValidate','-TerraCapture','-TerraTestFPS=20',('-TerraGraphicsMode='+$taskQuality),$taskFlags[$Mode],
 ('-TerraReport="'+$taskReport+'"'),('-TerraCaptureDir="'+$taskCaptures+'"'),('-TerraGarage="'+(Join-Path $taskOutput 'garage.json')+'"'),('-TerraGraphics="'+(Join-Path $taskOutput 'graphics.json')+'"'),('-TerraControls="'+(Join-Path $taskOutput 'controls.json')+'"'),('-UserDir="'+(Join-Path $taskOutput 'User')+'"'),('-abslog="'+(Join-Path $taskOutput 'game.log')+'"'),
 '-ini:Engine:[/Script/Engine.Engine]:bUseFixedFrameRate=True','-ini:Engine:[/Script/Engine.Engine]:FixedFrameRate=20.0')
if($Mode -eq 'RolloverPerformance'){$taskArguments=@($taskArguments|Where-Object {$_ -notlike '-ini:Engine:*'});$taskArguments+=('-TerraPerfVehicle='+$PerformanceVehicle)}
if($SavedBuild){$taskArguments+=('-TerraPerfBuild="'+(Resolve-Path -LiteralPath $SavedBuild).ProviderPath+'"')}
if($QuarrySurvey){$taskArguments+='-TerraQuarrySurvey'}
if($ArtVehicle -ge 0){$taskArguments+=('-TerraModelHeroVehicle='+$ArtVehicle)}
if($Mode -in @('Rollover','RolloverPerformance')){$taskArguments+=('-TerraRolloverTireSize='+$TireSizeStage)}
if($LegacyRolledTires){$taskArguments+='-TerraLegacyRolledTires'}
if($ContactDiagnostics){$taskArguments+=@('-TerraRolledTireDiagnostics','-TerraUprightSupportDiagnostics')}
if($Mode -eq 'Rollover'){$taskArguments+='-TerraExpectCoachworkCollision'}
if($RolloverQuickVehicle -ge 0){$taskArguments+=@('-TerraRolloverQuick',('-TerraRolloverQuickVehicle='+$RolloverQuickVehicle))}
$taskExecutableHash=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant()
$taskContent=@(Get-StagedPackageContent -PackageDirectory $taskPackage)
$taskStart=Get-Date
$taskReceipt=[ordered]@{mode=$Mode;started=$taskStart.ToUniversalTime().ToString('o');
 packageDirectory=$taskPackage;executableSha256=$taskExecutableHash;stagedContent=$taskContent;
 arguments=$taskArguments;simulationClock=$(if($Mode -eq 'RolloverPerformance'){'real elapsed time; 20 FPS render cap; normal physics'}else{'paced fixed20Hz functional verification'});pass=$false}
$taskInfo=[Diagnostics.ProcessStartInfo]::new();$taskInfo.FileName=$taskExe;$taskInfo.Arguments=$taskArguments -join ' ';$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$taskGame=[Diagnostics.Process]::new();$taskGame.StartInfo=$taskInfo
$taskStarted=$false
$taskSamples=[Collections.Generic.List[object]]::new();$taskGPU=Get-Command nvidia-smi -ErrorAction Stop;$taskProblem=$null
try{
 if(!$taskGame.Start()){throw 'Game did not start'}
 $taskStarted=$true
 while(!$taskGame.WaitForExit(1500)){
  if(((Get-Date)-$taskStart).TotalSeconds -gt $TimeoutSeconds){throw 'Native test timed out'}
  $taskLine=& $taskGPU.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used --format=csv,noheader,nounits
  $taskParts=@(($taskLine|Select-Object -First 1)-split ',\s*')
  if($LASTEXITCODE -ne 0 -or $taskParts.Count -ne 4){throw 'GPU telemetry unavailable'}
  $taskSample=[pscustomobject]@{elapsedSeconds=((Get-Date)-$taskStart).TotalSeconds;temperatureC=[double]$taskParts[0];utilizationPercent=[double]$taskParts[1];powerW=[double]$taskParts[2];memoryMiB=[double]$taskParts[3]};$taskSamples.Add($taskSample)
  if($taskSample.temperatureC -ge 77){throw 'GPU reached the77C cutoff'}
 }
 $taskReceipt.exitCode=$taskGame.ExitCode
 $taskLog=Join-Path $taskOutput 'game.log'
 if(!(Test-Path -LiteralPath $taskLog) -or (Get-Item -LiteralPath $taskLog).LastWriteTime -lt $taskStart){throw 'No fresh native runtime log'}
 # An exit-zero fixture can still contain an ensure or a failed material.
 # Preserve the actual lines in the receipt instead of accepting silent fallback.
 $taskRuntimePattern='Fatal error|Assertion failed|Ensure condition failed|Handled ensure|Log[A-Za-z0-9_]+:\s*(?:Fatal|Error):|does(?:n.t| not) have a valid ShaderMap|missing usage flag|Failed to compile Material|Failed to find shader|(?:Missing|Invalid|Null) (?:cached )?ShaderMap|Default Material will be used|GPU Crashed|DXGI_ERROR_DEVICE_(?:REMOVED|HUNG|RESET)'
 $taskRuntimeErrors=@(Select-String -LiteralPath $taskLog -Pattern $taskRuntimePattern)
 $taskReceipt.runtimeErrorCount=$taskRuntimeErrors.Count
 $taskReceipt.runtimeErrors=@($taskRuntimeErrors|Select-Object -First 40|ForEach-Object {[pscustomobject]@{line=$_.LineNumber;message=$_.Line}})
 if($taskRuntimeErrors.Count){throw 'Native runtime logged an error, ensure, shader/material failure or GPU fault; inspect receipt and game.log'}
 if(!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStart){throw 'No fresh native result'}
 $taskResult=Get-Content -LiteralPath $taskReport -Raw|ConvertFrom-Json;$taskFailed=@($taskResult.tests|Where-Object {!$_.pass})
 $taskReceipt.checks=@($taskResult.tests).Count;$taskReceipt.failed=$taskFailed
 $taskExpected=@{SixWheel=35;Garden=10;Art=132;UrusArt=7;Quarry=16;Interface=156;Mechanical=707;ElectricPressure=280;Rollover=685;Ruts=117;Transitions=53;Detail=15;Movement=145;RutTransitions=64;Perimeter=5;Challenges=22;Expanded=286;Recovery=48;GraveRecovery=34;RolloverPerformance=59}[$Mode]
 if($SavedBuild){$taskExpected+=9} # One saved-profile check per real-time pose.
 if($QuarrySurvey){$taskExpected+=9}
 if($ArtVehicle -ge 0){$taskExpected=11}
 if($Mode -eq 'Rollover'){
  $taskQuick=$RolloverQuickVehicle -ge 0
  $taskExpected=if($taskQuick){91}else{685}
  $taskPlanPath=Join-Path $taskOutput 'rollover-fixtures.json'
  if(!(Test-Path -LiteralPath $taskPlanPath) -or (Get-Item -LiteralPath $taskPlanPath).LastWriteTime -lt $taskStart){throw 'No fresh rollover fixture plan'}
  $taskPlan=Get-Content -LiteralPath $taskPlanPath -Raw|ConvertFrom-Json
  $taskRolloverCases=@($taskPlan.cases)
  $taskRequired=[Collections.Generic.HashSet[string]]::new()
  $taskVehicles=if($taskQuick){@($RolloverQuickVehicle)}else{@(0..11)}
  foreach($taskVehicle in $taskVehicles){foreach($taskZone in @(1,0)){foreach($taskRoll in @(-90,90,180)){[void]$taskRequired.Add(('{0}:{1}:{2}' -f $taskVehicle,$taskZone,$taskRoll))}}}
  $taskExtraVehicle=if($taskQuick){$RolloverQuickVehicle}else{3}
  foreach($taskRoll in @(-55,55,-110,110)){[void]$taskRequired.Add(('{0}:0:{1}' -f $taskExtraVehicle,$taskRoll))}
  $taskActual=[Collections.Generic.HashSet[string]]::new()
  foreach($taskCase in $taskRolloverCases){[void]$taskActual.Add(('{0}:{1}:{2}' -f $taskCase.vehicle,$taskCase.zone,$taskCase.roll))}
  $taskPlanValid=$taskPlan.version -eq 1 -and $taskPlan.vehicleCount -eq 12 -and $taskPlan.quick -eq $taskQuick -and $taskPlan.coachworkCollisionRequired -eq $true -and $taskPlan.performanceMeasured -eq $false -and $taskPlan.checksPerPose -eq 9 -and $taskPlan.tireSizeStage -eq $TireSizeStage -and $taskPlan.expectedChecks -eq $taskExpected
  if($taskQuick){$taskPlanValid=$taskPlanValid -and $taskPlan.quickVehicle -eq $RolloverQuickVehicle}
  if(!$taskPlanValid -or $taskRolloverCases.Count -ne $taskRequired.Count -or !$taskActual.SetEquals($taskRequired)){throw 'Rollover fixture coverage does not match the complete requested pose matrix'}
 }
 if($taskGame.ExitCode -ne 0 -or $taskResult.engine -ne '5.8.3' -or $taskFailed.Count -or $taskReceipt.checks -lt 1 -or ($taskExpected -and $taskReceipt.checks -ne $taskExpected)){throw 'Native acceptance failed; inspect preserved report'}
 $taskExpectedCaptures=@()
 if($Mode -eq 'Rollover'){
  foreach($taskCase in $taskRolloverCases){$taskSign=if($taskCase.roll -lt 0){'m'}else{'p'};$taskExpectedCaptures+=('native-rollover-v{0}-z{1}-{2}{3}.png' -f $taskCase.vehicle,$taskCase.zone,$taskSign,[Math]::Abs([int]$taskCase.roll))}
 }
 if($Mode -eq 'SixWheel'){$taskExpectedCaptures=@('sixwheel-locked-motion.png','g63-squared-garage.png','sixwheel-mud-ruts.png','sixwheel-ev-drive-1.png','sixwheel-ev-drive-2.png','sixwheel-ev-drive-3.png')}
 if($Mode -eq 'Garden'){$taskExpectedCaptures=@('garden-main-outcrop.png','garden-detached-blocks.png','garden-ledge-silhouette.png','garden-stone-close.png','garden-articulation-line.png')}
 if($Mode -eq 'Challenges'){$taskExpectedCaptures+=@('terrain-challenges-menu.png');foreach($course in 0..2){foreach($view in @('obstacle','finish')){$taskExpectedCaptures+=('terrain-challenge-'+$course+'-'+$view+'.png')}}}
 if($Mode -eq 'Perimeter'){
  $taskExpectedCaptures=@('perimeter-finish.png')
  foreach($taskSector in 0..10){$taskExpectedCaptures+=('perimeter-sector-{0:00}.png' -f $taskSector)}
 }
 if($Mode -in @('UrusArt','Quarry')){foreach($taskView in 0..5){$taskExpectedCaptures+=('native-urus-hero-'+$taskView+'.png')}}
 if($Mode -eq 'Quarry'){$taskExpectedCaptures+=@('native-urus-quarry-driving.png','native-slate-rim-trail.png')}
 if($QuarrySurvey){
  $taskExpectedCaptures+='native-urus-hero-6.png'
  foreach($taskSector in 1..6){$taskExpectedCaptures+=('native-slate-rim-sector-{0:00}.png' -f $taskSector)}
 }
 if($Mode -eq 'Art'){$taskArtVehicles=if($ArtVehicle -ge 0){@($ArtVehicle)}else{@(0..11)};foreach($taskVehicle in $taskArtVehicles){foreach($taskView in 0..9){$taskExpectedCaptures+=('native-vehicle-'+$taskVehicle+'-hero-'+$taskView+'.png')}}}
 if($Mode -eq 'Expanded'){$taskExpectedCaptures+=@('native-granite-entry-oblique.png','native-granite-entry-close.png','expanded-tire-garage-2.png','expanded-tire-garage-10.png','expanded-tire-garage-11.png');foreach($taskVehicle in 0..11){$taskExpectedCaptures+=('expanded-largest-tires-'+$taskVehicle+'.png');$taskExpectedCaptures+=('expanded-recovered-'+$taskVehicle+'.png')}}
 if($Mode -eq 'RolloverPerformance'){foreach($taskZone in @(0,2,6)){foreach($taskRoll in @(0,90,180)){$taskExpectedCaptures+=('roll-perf-v'+$PerformanceVehicle+'-z'+$taskZone+'-r'+$taskRoll+'.png')}}}
 if($Mode -eq 'Recovery'){foreach($taskCase in 0..3){foreach($taskPose in @('before','after')){$taskExpectedCaptures+=('native-recovery-'+$taskCase+'-'+$taskPose+'.png')}}}
 if($Mode -eq 'Ruts'){
  foreach($taskSurface in @('firm-dirt','mud','snow','wet-grass','sand','loose-dirt','driven-mud','driven-snow')){foreach($taskView in @('oblique','profile')){$taskExpectedCaptures+=('native-rut-'+$taskSurface+'-'+$taskView+'.png')}}
 }
 if($Mode -eq 'Transitions'){
  foreach($taskPair in @('dirt-asphalt','dirt-mud','dirt-wetland','dirt-rock','dirt-sand','dirt-snow','mud-rock')){foreach($taskView in 0..1){$taskExpectedCaptures+=('native-transition-'+$taskPair+'-view-'+$taskView+'.png')}}
 }
 if($Mode -eq 'RutTransitions'){
  foreach($taskPair in @('dirt-asphalt','dirt-mud','dirt-wetland','dirt-rock','dirt-sand','dirt-snow','mud-rock')){foreach($taskView in @('oblique','profile')){$taskExpectedCaptures+=('native-rut-transition-'+$taskPair+'-'+$taskView+'.png')}}
 }
 if($Mode -eq 'Detail'){foreach($taskView in @('snow-drifts-wide','snow-scan-close','snow-slush-edge','snowbanks','meadow-wide','meadow-close')){$taskExpectedCaptures+=('native-detail-'+$taskView+'.png')}}
 if($Mode -eq 'Movement'){
  $taskPlan=Get-Content -LiteralPath (Join-Path $taskOutput 'momentum-fixtures.json') -Raw|ConvertFrom-Json
  $taskVehicles=@($taskPlan.riseVehicles|Sort-Object -Unique)
  if($taskPlan.vehicleCount -ne 12 -or $taskVehicles.Count -ne 12 -or $taskPlan.boundaryTrialCount -ne 7 -or @($taskPlan.boundaries).Count -ne 7 -or $taskPlan.expectedChecks -ne 145){throw 'Movement fixture coverage is incomplete.'}
  foreach($taskVehicle in 0..11){if($taskVehicle -notin $taskVehicles){throw 'Movement fixture omitted a vehicle.'}}
 }
 if($Mode -eq 'GraveRecovery'){foreach($taskCase in 0..2){foreach($taskPose in @('before','after')){$taskExpectedCaptures+=('grave-recovery-'+$taskCase+'-'+$taskPose+'.png')}}}
 foreach($taskName in $taskExpectedCaptures){
  $taskImage=Join-Path $taskCaptures $taskName
  if(!(Test-Path -LiteralPath $taskImage)){throw ('Missing native capture '+$taskName)}
  $taskBytes=[IO.File]::ReadAllBytes($taskImage)
  if($taskBytes.Length -lt 24 -or [BitConverter]::ToString($taskBytes[0..7]) -ne '89-50-4E-47-0D-0A-1A-0A'){throw ('Invalid PNG capture '+$taskName)}
 }
 $taskReceipt.captures=@(Get-ChildItem -LiteralPath $taskCaptures -Filter '*.png').Count
 if($taskReceipt.captures -lt 1){throw 'Native run produced no screenshot evidence'}
 $taskReceipt.pass=$true
}catch{$taskProblem=$_;$taskReceipt.problem=$_.Exception.Message;if($taskStarted -and !$taskGame.HasExited){$taskGame.Kill();$taskGame.WaitForExit()}}
finally{
 $taskReceipt.elapsedSeconds=((Get-Date)-$taskStart).TotalSeconds;$taskReceipt.peakTemperatureC=($taskSamples|Measure-Object temperatureC -Maximum).Maximum
 $taskSamples|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $taskOutput 'gpu.json') -Encoding utf8
 $taskReceipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $taskOutput 'receipt.json') -Encoding utf8
}
Write-Output ($Mode+': '+$taskReceipt.checks+' checks; pass='+$taskReceipt.pass+'; peak GPU '+$taskReceipt.peakTemperatureC+' C; '+$taskOutput)
if($taskProblem){throw $taskProblem}
