param([ValidateSet('SixWheel','Art','UrusArt','Quarry','Interface','Mechanical','ElectricPressure','Rollover','Ruts','Garden','Transitions','Detail','Movement','RutTransitions','Perimeter')][string]$Mode='SixWheel',[string]$OutputDirectory='',[int]$TimeoutSeconds=1800,[ValidateRange(-1,9)][int]$RolloverQuickVehicle=-1,[string]$PackageDirectory='',[switch]$QuarrySurvey)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'staged-package-content.ps1')
if($RolloverQuickVehicle -ge 0 -and $Mode -ne 'Rollover'){throw '-RolloverQuickVehicle requires Rollover mode.'}
if($QuarrySurvey -and $Mode -ne 'Quarry'){throw '-QuarrySurvey requires Quarry mode.'}
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
$taskQuality=if($Mode -in @('Art','UrusArt','Quarry','Garden','Ruts','Transitions','Detail','RutTransitions')){2}else{0}
$taskArguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-NoTrace','-TerraValidate','-TerraCapture','-TerraTestFPS=20',('-TerraGraphicsMode='+$taskQuality),$taskFlags[$Mode],
 ('-TerraReport="'+$taskReport+'"'),('-TerraCaptureDir="'+$taskCaptures+'"'),('-TerraGarage="'+(Join-Path $taskOutput 'garage.json')+'"'),('-TerraGraphics="'+(Join-Path $taskOutput 'graphics.json')+'"'),('-TerraControls="'+(Join-Path $taskOutput 'controls.json')+'"'),('-UserDir="'+(Join-Path $taskOutput 'User')+'"'),('-abslog="'+(Join-Path $taskOutput 'game.log')+'"'),
 '-ini:Engine:[/Script/Engine.Engine]:bUseFixedFrameRate=True','-ini:Engine:[/Script/Engine.Engine]:FixedFrameRate=20.0')
if($QuarrySurvey){$taskArguments+='-TerraQuarrySurvey'}
if($Mode -eq 'Rollover'){$taskArguments+='-TerraExpectCoachworkCollision'}
if($RolloverQuickVehicle -ge 0){$taskArguments+=@('-TerraRolloverQuick',('-TerraRolloverQuickVehicle='+$RolloverQuickVehicle))}
$taskExecutableHash=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLowerInvariant()
$taskContent=@(Get-StagedPackageContent -PackageDirectory $taskPackage)
$taskStart=Get-Date
$taskReceipt=[ordered]@{mode=$Mode;started=$taskStart.ToUniversalTime().ToString('o');
 packageDirectory=$taskPackage;executableSha256=$taskExecutableHash;stagedContent=$taskContent;
 arguments=$taskArguments;simulationClock='paced fixed20Hz functional verification';pass=$false}
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
 if(!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStart){throw 'No fresh native result'}
 $taskResult=Get-Content -LiteralPath $taskReport -Raw|ConvertFrom-Json;$taskFailed=@($taskResult.tests|Where-Object {!$_.pass})
 $taskReceipt.checks=@($taskResult.tests).Count;$taskReceipt.failed=$taskFailed
 $taskExpected=@{SixWheel=35;Garden=10;Art=110;UrusArt=7;Quarry=16;Interface=140;Mechanical=557;ElectricPressure=280;Rollover=513;Ruts=117;Transitions=53;Detail=15;Movement=120;RutTransitions=64;Perimeter=5}[$Mode]
 if($QuarrySurvey){$taskExpected+=9}
 if($RolloverQuickVehicle -ge 0){
  $taskExpected=81
  $taskPlan=Get-Content -LiteralPath (Join-Path $taskOutput 'rollover-fixtures.json') -Raw|ConvertFrom-Json
  $taskKeys=@($taskPlan.cases|ForEach-Object {('{0}:{1}:{2}' -f $_.vehicle,$_.zone,$_.roll)}|Sort-Object -Unique)
  if(!$taskPlan.quick -or $taskPlan.quickVehicle -ne $RolloverQuickVehicle -or $taskPlan.expectedChecks -ne 81 -or @($taskPlan.cases).Count -ne 10 -or $taskKeys.Count -ne 10 -or @($taskPlan.cases|Where-Object {$_.vehicle -ne $RolloverQuickVehicle}).Count){throw 'Focused rollover fixture coverage is incomplete.'}
 }
 if($taskGame.ExitCode -ne 0 -or $taskResult.engine -ne '5.8.3' -or $taskFailed.Count -or $taskReceipt.checks -lt 1 -or ($taskExpected -and $taskReceipt.checks -ne $taskExpected)){throw 'Native acceptance failed; inspect preserved report'}
 $taskExpectedCaptures=@()
 if($Mode -eq 'SixWheel'){$taskExpectedCaptures=@('sixwheel-locked-motion.png','g63-squared-garage.png','sixwheel-mud-ruts.png','sixwheel-ev-drive-1.png','sixwheel-ev-drive-2.png','sixwheel-ev-drive-3.png')}
 if($Mode -eq 'Garden'){$taskExpectedCaptures=@('garden-main-outcrop.png','garden-detached-blocks.png','garden-ledge-silhouette.png','garden-stone-close.png','garden-articulation-line.png')}
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
 if($Mode -eq 'Art'){foreach($taskVehicle in 0..9){foreach($taskView in 0..9){$taskExpectedCaptures+=('native-vehicle-'+$taskVehicle+'-hero-'+$taskView+'.png')}}}
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
  if($taskPlan.vehicleCount -ne 10 -or $taskVehicles.Count -ne 10 -or $taskPlan.boundaryTrialCount -ne 7 -or @($taskPlan.boundaries).Count -ne 7 -or $taskPlan.expectedChecks -ne 120){throw 'Movement fixture coverage is incomplete.'}
  foreach($taskVehicle in 0..9){if($taskVehicle -notin $taskVehicles){throw 'Movement fixture omitted a vehicle.'}}
 }
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
