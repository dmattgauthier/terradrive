param(
 [ValidateSet('EnergyLock','Interface','ElectricPressure','Mechanical')][string]$Mode='EnergyLock',
 [string]$OutputDirectory='',
 [int]$TimeoutSeconds=1200
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd,UnrealPak,ShaderCompileWorker -ErrorAction SilentlyContinue){throw 'Close game/editor before native validation.'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $taskRoot ('Saved/EnergyValidation-'+$Mode+'-'+(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ssZ'))}
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath (Join-Path $taskOutput 'receipt.json')){throw 'Existing evidence is preserved; choose a fresh output directory.'}
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskReport=Join-Path $taskOutput 'result.json';$taskCaptures=Join-Path $taskOutput 'Screenshots'
New-Item -ItemType Directory -Path $taskCaptures -Force | Out-Null
$taskExe=Join-Path $taskRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
$taskFlags=@{
 EnergyLock='-TerraEnergyLockOnly';Interface='-TerraInterfaceOnly';ElectricPressure='-TerraElectricPressureOnly';Mechanical='-TerraMechanicalOnly'
}
$taskArguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1280','-ResY=720','-NoSound','-NoTrace','-TerraValidate','-TerraCapture','-TerraTestFPS=20','-TerraGraphicsMode=0',$taskFlags[$Mode],
 ('-TerraReport="'+$taskReport+'"'),('-TerraCaptureDir="'+$taskCaptures+'"'),('-TerraGarage="'+(Join-Path $taskOutput 'garage.json')+'"'),
 ('-TerraGraphics="'+(Join-Path $taskOutput 'graphics.json')+'"'),('-TerraControls="'+(Join-Path $taskOutput 'controls.json')+'"'),('-UserDir="'+(Join-Path $taskOutput 'User')+'"'),('-abslog="'+(Join-Path $taskOutput 'game.log')+'"'),
 '-ini:Engine:[/Script/Engine.Engine]:bUseFixedFrameRate=True','-ini:Engine:[/Script/Engine.Engine]:FixedFrameRate=20.0')
$taskStart=Get-Date
$taskReceipt=[ordered]@{mode=$Mode;started=$taskStart.ToUniversalTime().ToString('o');executableSha256=(Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash.ToLower();arguments=$taskArguments;simulationClock='paced fixed 20 Hz; functional acceptance, not a real-time throughput measurement';pass=$false}
$taskInfo=[Diagnostics.ProcessStartInfo]::new();$taskInfo.FileName=$taskExe;$taskInfo.Arguments=$taskArguments -join ' ';$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true;$taskInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$taskGame=[Diagnostics.Process]::new();$taskGame.StartInfo=$taskInfo
$taskSamples=[Collections.Generic.List[object]]::new();$taskGPU=Get-Command nvidia-smi -ErrorAction Stop;$taskProblem=$null
try{
 if(!$taskGame.Start()){throw 'Game did not start'}
 while(!$taskGame.WaitForExit(1500)){
  if(((Get-Date)-$taskStart).TotalSeconds -gt $TimeoutSeconds){throw 'Native test timed out'}
  $taskLine=& $taskGPU.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used --format=csv,noheader,nounits
  $taskParts=@(($taskLine|Select-Object -First 1)-split ',\s*')
  if($LASTEXITCODE -ne 0 -or $taskParts.Count -ne 4){throw 'GPU telemetry unavailable'}
  $taskSample=[pscustomobject]@{elapsedSeconds=((Get-Date)-$taskStart).TotalSeconds;temperatureC=[double]$taskParts[0];utilizationPercent=[double]$taskParts[1];powerW=[double]$taskParts[2];memoryMiB=[double]$taskParts[3]}
  $taskSamples.Add($taskSample)
  if($taskSample.temperatureC -ge 77){throw 'GPU reached the 77 C cutoff'}
 }
 $taskReceipt.exitCode=$taskGame.ExitCode
 if(!(Test-Path -LiteralPath $taskReport) -or (Get-Item -LiteralPath $taskReport).LastWriteTime -lt $taskStart){throw 'No fresh native result'}
 $taskResult=Get-Content -LiteralPath $taskReport -Raw|ConvertFrom-Json
 $taskFailed=@($taskResult.tests|Where-Object {!$_.pass})
 $taskReceipt.checks=@($taskResult.tests).Count;$taskReceipt.failed=$taskFailed
 $taskExpected=@{EnergyLock=135;Interface=140;ElectricPressure=280;Mechanical=557}[$Mode]
 if($taskGame.ExitCode -ne 0 -or $taskResult.engine -ne '5.8.3' -or $taskFailed.Count -or $taskReceipt.checks -ne $taskExpected){throw 'Native acceptance failed; inspect the preserved report'}
 $taskReceipt.pass=$true
}catch{$taskProblem=$_;if(!$taskGame.HasExited){$taskGame.Kill();$taskGame.WaitForExit()};$taskReceipt.problem=$_.Exception.Message}
finally{
 $taskReceipt.elapsedSeconds=((Get-Date)-$taskStart).TotalSeconds
 $taskReceipt.peakTemperatureC=($taskSamples|Measure-Object temperatureC -Maximum).Maximum
 $taskSamples|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $taskOutput 'gpu.json') -Encoding utf8
 $taskReceipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $taskOutput 'receipt.json') -Encoding utf8
}
Write-Output ($Mode+': '+$taskReceipt.checks+' checks; pass='+$taskReceipt.pass+'; peak GPU '+$taskReceipt.peakTemperatureC+' C; '+$taskOutput)
if($taskProblem){throw $taskProblem}
