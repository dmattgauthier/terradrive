param([switch]$Quick,[ValidateRange(0,9)][int]$QuickVehicle=3,[switch]$AllowLegacyProxy,[switch]$MeasurePerformance,[string]$FixtureFile='',[string]$Name='rollover',[int]$TimeoutSeconds=900)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(@(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd,UnrealPak,ShaderCompileWorker -ErrorAction SilentlyContinue).Count){throw 'Close engine processes before the isolated rollover check'}
if($Name -notmatch '^[a-z0-9-]+$'){throw 'Use a simple report name'}
$taskOut=Join-Path $taskRoot 'Saved/Validation';New-Item -ItemType Directory -Path $taskOut -Force | Out-Null
$taskReport=Join-Path $taskOut ($Name+'.json');$taskLog=Join-Path $taskOut ($Name+'.log');$taskStart=Get-Date
$taskArgs=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-TerraValidate','-TerraCapture','-TerraRolloverOnly','-TerraTestFPS=20','-TerraGraphicsMode=2',('-TerraReport="'+$taskReport+'"'),('-TerraGarage="'+(Join-Path $taskOut 'rollover-test-garage.json')+'"'),('-TerraGraphics="'+(Join-Path $taskOut 'rollover-test-graphics.json')+'"'),('-abslog="'+$taskLog+'"'))
if($Quick){$taskArgs+=@('-TerraRolloverQuick',('-TerraRolloverQuickVehicle='+$QuickVehicle))}
if($MeasurePerformance){$taskArgs+='-TerraRolloverMeasurePerformance'}
if(!$AllowLegacyProxy){$taskArgs+='-TerraExpectCoachworkCollision'}
if($FixtureFile){$taskFixture=(Resolve-Path -LiteralPath $FixtureFile).ProviderPath;$taskArgs+=('-TerraCoachworkData="'+$taskFixture+'"')}
$taskInfo=[Diagnostics.ProcessStartInfo]::new();$taskInfo.FileName=Join-Path $taskRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe';$taskInfo.Arguments=$taskArgs -join ' ';$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$taskGame=[Diagnostics.Process]::new();$taskGame.StartInfo=$taskInfo;if(!$taskGame.Start()){throw 'Game did not start'}
$taskGpu=Get-Command nvidia-smi -ErrorAction SilentlyContinue;$taskSamples=[Collections.Generic.List[object]]::new()
try{while(!$taskGame.WaitForExit(1500)){
 if(((Get-Date)-$taskStart).TotalSeconds -gt $TimeoutSeconds){throw 'Rollover check timed out'}
 if($taskGpu){$taskLine=& $taskGpu.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits;$taskParts=@(($taskLine | Select-Object -First 1) -split ',\s*');if($LASTEXITCODE -eq 0 -and $taskParts.Count -eq 3){$taskSample=[pscustomobject]@{elapsed=((Get-Date)-$taskStart).TotalSeconds;temperatureC=[double]$taskParts[0];utilizationPercent=[double]$taskParts[1];powerW=[double]$taskParts[2]};$taskSamples.Add($taskSample);if($taskSample.temperatureC -ge 77){throw 'GPU reached the conservative 77 C cutoff'}}}
}}finally{if(!$taskGame.HasExited){$taskGame.Kill();$taskGame.WaitForExit()};$taskSamples.ToArray() | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $taskOut ($Name+'-gpu.json')) -Encoding UTF8}
$taskExit=$taskGame.ExitCode
if(!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStart){throw 'No fresh rollover report'}
$taskResult=Get-Content -LiteralPath $taskReport -Raw | ConvertFrom-Json
$taskPlanPath=Join-Path $taskOut 'rollover-fixtures.json'
if(!(Test-Path -LiteralPath $taskPlanPath) -or (Get-Item -LiteralPath $taskPlanPath).LastWriteTime -lt $taskStart){throw 'No fresh rollover fixture plan'}
$taskPlan=Get-Content -LiteralPath $taskPlanPath -Raw | ConvertFrom-Json
$taskRoster=Get-Content -LiteralPath (Join-Path $taskRoot 'Content/NativeData/vehicle-collision.json') -Raw | ConvertFrom-Json
$taskVehicleCount=@($taskRoster.vehicles).Count
$taskPoseCount=if($Quick){10}else{$taskVehicleCount*6+4}
$taskChecksPerPose=$(if($AllowLegacyProxy){6}else{8})+$(if($MeasurePerformance){1}else{0})
$taskExpected=1+$taskPoseCount*$taskChecksPerPose
$taskPlanValid=$taskPlan.version -eq 1 -and $taskVehicleCount -gt 0 -and $taskPlan.vehicleCount -eq $taskVehicleCount -and $taskPlan.quick -eq [bool]$Quick -and $taskPlan.coachworkCollisionRequired -eq (!$AllowLegacyProxy) -and $taskPlan.checksPerPose -eq $taskChecksPerPose -and @($taskPlan.cases).Count -eq $taskPoseCount
$taskCoverage=[Collections.Generic.HashSet[string]]::new()
foreach($taskCase in $taskPlan.cases){
 $taskPlanValid=$taskPlanValid -and $taskCase.vehicle -ge 0 -and $taskCase.vehicle -lt $taskVehicleCount -and $taskCase.zone -in @(0,1) -and $taskCase.roll -in @(-110,-90,-55,55,90,110,180)
 if($Quick){$taskPlanValid=$taskPlanValid -and $taskCase.vehicle -eq $QuickVehicle -and $taskPlan.quickVehicle -eq $QuickVehicle}
 [void]$taskCoverage.Add(('{0}:{1}:{2}' -f $taskCase.vehicle,$taskCase.zone,$taskCase.roll))
}
if(!$taskPlanValid -or $taskCoverage.Count -ne $taskPoseCount -or $taskPlan.expectedChecks -ne $taskExpected){throw 'Rollover fixture plan does not match the complete requested pose matrix'}
$taskFailures=@($taskResult.tests | Where-Object {!$_.pass});$taskErrors=@(Select-String -LiteralPath $taskLog -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
if($taskExit -ne 0 -or $taskFailures.Count -or $taskErrors.Count -or $taskResult.tests.Count -ne $taskExpected){$taskFailures | Select-Object case,value,pass | Format-Table -AutoSize | Out-String | Write-Output;throw ('Rollover check failed: '+$taskReport)}
Write-Output ('PASS '+$taskResult.tests.Count+' native rollover checks; exit 0')
