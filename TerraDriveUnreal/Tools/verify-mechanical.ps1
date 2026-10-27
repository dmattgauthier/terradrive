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
# Four migration/persistence checks; six x eight capability checks; 24 x
# ten stationary hardware/physics checks; 18 stage-growth and six x four spin checks.
$taskExpected=334
$taskFailures=@($taskResult.tests | Where-Object {!$_.pass});$taskErrors=@(Select-String -LiteralPath $taskLog -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
if($taskExit -ne 0 -or $taskFailures.Count -or $taskErrors.Count -or $taskResult.tests.Count -ne $taskExpected){$taskFailures | Select-Object case,value,pass | Format-Table -AutoSize | Out-String | Write-Output;throw ('Mechanical check failed: '+$taskReport+'; exit '+$taskExit+'; checks '+$taskResult.tests.Count+'/'+$taskExpected)}
Write-Output ('PASS '+$taskResult.tests.Count+' native mechanical checks; exit 0')
