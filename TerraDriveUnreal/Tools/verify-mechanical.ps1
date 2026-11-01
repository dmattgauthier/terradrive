param([string]$Name='mechanical',[int]$TimeoutSeconds=900)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(@(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd,UnrealPak,ShaderCompileWorker -ErrorAction SilentlyContinue).Count){throw 'Close engine processes before the isolated mechanical check'}
if($Name -notmatch '^[a-z0-9-]+$'){throw 'Use a simple report name'}
$taskOut=Join-Path $taskRoot 'Saved/Validation';New-Item -ItemType Directory -Path $taskOut -Force | Out-Null
$taskReport=Join-Path $taskOut ($Name+'.json');$taskLog=Join-Path $taskOut ($Name+'.log');$taskStart=Get-Date
$taskArgs=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-TerraValidate','-TerraCapture','-TerraMechanicalOnly','-TerraTestFPS=20','-TerraGraphicsMode=2',('-TerraReport="'+$taskReport+'"'),('-TerraGarage="'+(Join-Path $taskOut 'mechanical-test-garage.json')+'"'),('-TerraGraphics="'+(Join-Path $taskOut 'mechanical-test-graphics.json')+'"'),('-abslog="'+$taskLog+'"'))
$taskInfo=[Diagnostics.ProcessStartInfo]::new();$taskInfo.FileName=Join-Path $taskRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe';$taskInfo.Arguments=$taskArgs -join ' ';$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$taskGame=[Diagnostics.Process]::new();$taskGame.StartInfo=$taskInfo;if(!$taskGame.Start()){throw 'Game did not start'}
$taskGpu=Get-Command nvidia-smi -ErrorAction SilentlyContinue;$taskSamples=[Collections.Generic.List[object]]::new()
try{while(!$taskGame.WaitForExit(1500)){
 if(((Get-Date)-$taskStart).TotalSeconds -gt $TimeoutSeconds){throw 'Mechanical check timed out'}
 if($taskGpu){$taskLine=& $taskGpu.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits;$taskParts=@(($taskLine | Select-Object -First 1) -split ',\s*');if($LASTEXITCODE -eq 0 -and $taskParts.Count -eq 3){$taskSample=[pscustomobject]@{elapsed=((Get-Date)-$taskStart).TotalSeconds;temperatureC=[double]$taskParts[0];utilizationPercent=[double]$taskParts[1];powerW=[double]$taskParts[2]};$taskSamples.Add($taskSample);if($taskSample.temperatureC -ge 77){throw 'GPU reached the conservative 77 C cutoff'}}}
}}finally{if(!$taskGame.HasExited){$taskGame.Kill();$taskGame.WaitForExit()};$taskSamples.ToArray() | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $taskOut ($Name+'-gpu.json')) -Encoding UTF8}
$taskExit=$taskGame.ExitCode
if($null -eq $taskExit){throw 'Native process exit code unavailable'}
if(!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStart){throw 'No fresh mechanical report'}
$taskResult=Get-Content -LiteralPath $taskReport -Raw | ConvertFrom-Json
# The native validator writes its exact vehicle/stage matrix before testing.
# Requiring a fresh plan prevents a partial run or an old packaged executable
# from satisfying a smaller historical count.
$taskPlanPath=Join-Path $taskOut 'mechanical-fixtures.json'
if(!(Test-Path -LiteralPath $taskPlanPath) -or (Get-Item -LiteralPath $taskPlanPath).LastWriteTime -lt $taskStart){throw 'No fresh mechanical fixture plan'}
$taskPlan=Get-Content -LiteralPath $taskPlanPath -Raw | ConvertFrom-Json
$taskRoster=Get-Content -LiteralPath (Join-Path $taskRoot 'Content/NativeData/vehicle-ground-probes.json') -Raw | ConvertFrom-Json
$taskVehicleCount=@($taskRoster.vehicles).Count
$taskPlanValid=$taskPlan.version -eq 1 -and $taskVehicleCount -gt 0 -and $taskPlan.vehicleCount -eq $taskVehicleCount -and $taskPlan.partCount -eq 13 -and $taskPlan.portalStages -eq 4 -and $taskPlan.migrationChecks -eq 5 -and $taskPlan.persistenceChecks -eq 2 -and $taskPlan.capabilityChecksPerVehicle -eq 8 -and $taskPlan.growthChecksPerVehicle -eq 3 -and $taskPlan.spinChecksPerVehicle -eq 4 -and $taskPlan.stationaryChecksPerTrial -eq 10 -and @($taskPlan.trials).Count -eq $taskVehicleCount*$taskPlan.portalStages
$taskCoverage=[Collections.Generic.HashSet[string]]::new()
foreach($taskTrial in $taskPlan.trials){
 $taskPlanValid=$taskPlanValid -and $taskTrial.vehicle -ge 0 -and $taskTrial.vehicle -lt $taskVehicleCount -and $taskTrial.stage -ge 0 -and $taskTrial.stage -lt $taskPlan.portalStages
 [void]$taskCoverage.Add(('{0}:{1}' -f $taskTrial.vehicle,$taskTrial.stage))
}
$taskExpected=[int]$taskPlan.migrationChecks+[int]$taskPlan.persistenceChecks+$taskVehicleCount*([int]$taskPlan.capabilityChecksPerVehicle+[int]$taskPlan.growthChecksPerVehicle+[int]$taskPlan.spinChecksPerVehicle)+@($taskPlan.trials).Count*[int]$taskPlan.stationaryChecksPerTrial
if(!$taskPlanValid -or $taskCoverage.Count -ne $taskVehicleCount*$taskPlan.portalStages -or $taskPlan.expectedChecks -ne $taskExpected){throw 'Mechanical fixture plan does not cover the complete generated roster and portal-stage matrix'}
$taskFailures=@($taskResult.tests | Where-Object {!$_.pass});$taskErrors=@(Select-String -LiteralPath $taskLog -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
if($taskExit -ne 0 -or $taskFailures.Count -or $taskErrors.Count -or $taskResult.tests.Count -ne $taskExpected){$taskFailures | Select-Object case,value,pass | Format-Table -AutoSize | Out-String | Write-Output;throw ('Mechanical check failed: '+$taskReport+'; exit '+$taskExit+'; checks '+$taskResult.tests.Count+'/'+$taskExpected)}
Write-Output ('PASS '+$taskResult.tests.Count+' native mechanical checks; exit 0')
