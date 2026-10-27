param([int]$TimeoutSeconds=240)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(@(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd,UnrealPak,ShaderCompileWorker -ErrorAction SilentlyContinue).Count){throw 'Close engine processes before the isolated debris check'}
$taskOut=Join-Path $taskRoot 'Saved/Validation';New-Item -ItemType Directory -Path $taskOut -Force | Out-Null
$taskReport=Join-Path $taskOut 'spray.json';$taskLog=Join-Path $taskOut 'spray.log';$taskStart=Get-Date
$taskArgs=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-TerraValidate','-TerraCapture','-TerraSprayOnly','-TerraTestFPS=20','-TerraGraphicsMode=2',('-TerraReport="'+$taskReport+'"'),('-TerraGarage="'+(Join-Path $taskOut 'spray-test-garage.json')+'"'),('-TerraGraphics="'+(Join-Path $taskOut 'spray-test-graphics.json')+'"'),('-abslog="'+$taskLog+'"'))
$taskInfo=[Diagnostics.ProcessStartInfo]::new();$taskInfo.FileName=Join-Path $taskRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe';$taskInfo.Arguments=$taskArgs -join ' ';$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$taskGame=[Diagnostics.Process]::new();$taskGame.StartInfo=$taskInfo;if(!$taskGame.Start()){throw 'Game did not start'}
$taskGpu=Get-Command nvidia-smi -ErrorAction SilentlyContinue;$taskSamples=[Collections.Generic.List[object]]::new()
try{while(!$taskGame.WaitForExit(1500)){
 if(((Get-Date)-$taskStart).TotalSeconds -gt $TimeoutSeconds){throw 'Debris check timed out'}
 if($taskGpu){$taskLine=& $taskGpu.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits;$taskParts=@(($taskLine | Select-Object -First 1) -split ',\s*');if($LASTEXITCODE -eq 0 -and $taskParts.Count -eq 3){$taskSample=[pscustomobject]@{elapsed=((Get-Date)-$taskStart).TotalSeconds;temperatureC=[double]$taskParts[0];utilizationPercent=[double]$taskParts[1];powerW=[double]$taskParts[2]};$taskSamples.Add($taskSample);if($taskSample.temperatureC -ge 77){throw 'GPU reached the conservative 77 C cutoff'}}}
}}finally{if(!$taskGame.HasExited){$taskGame.Kill();$taskGame.WaitForExit()};$taskSamples.ToArray() | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $taskOut 'spray-gpu.json') -Encoding UTF8}
if(!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStart){throw 'No fresh debris report'}
$taskResult=Get-Content -LiteralPath $taskReport -Raw | ConvertFrom-Json
$taskFailures=@($taskResult.tests | Where-Object {!$_.pass});$taskErrors=@(Select-String -LiteralPath $taskLog -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
if($taskGame.ExitCode -ne 0 -or $taskFailures.Count -or $taskErrors.Count -or $taskResult.tests.Count -ne 44){$taskFailures | Select-Object case,value,pass | Format-Table -AutoSize | Out-String | Write-Output;throw ('Debris check failed: '+$taskReport)}
foreach($taskName in @('grass','mud','snow','sand','gravel','water')){
 $taskCapture=Join-Path $taskRoot ('Build/Windows/TerraDrive/Saved/Screenshots/native-ejection-'+$taskName+'.png')
 if(!(Test-Path -LiteralPath $taskCapture) -or (Get-Item -LiteralPath $taskCapture).LastWriteTime -lt $taskStart){throw ('Missing fresh debris capture '+$taskCapture)}
}
Write-Output ('PASS '+$taskResult.tests.Count+' native debris checks; six fresh captures; exit 0')
