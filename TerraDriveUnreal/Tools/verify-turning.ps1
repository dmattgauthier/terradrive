param([string]$OutputDirectory='', [int]$TimeoutSeconds=1200)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(@(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue).Count){throw 'Close game/editor before the isolated turning check.'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $projectRoot ('Saved/Validation/turning-'+[Guid]::NewGuid().ToString('N').Substring(0,8))}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$OutputDirectory=(Resolve-Path -LiteralPath $OutputDirectory).Path
$report=Join-Path $OutputDirectory 'result.json';$log=Join-Path $OutputDirectory 'game.log';$captures=Join-Path $OutputDirectory 'Screenshots'
New-Item -ItemType Directory -Path $captures -Force | Out-Null
$arguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1280','-ResY=720','-NoSound','-TerraValidate','-TerraCapture','-TerraTurningOnly','-TerraTestFPS=20','-UseFixedTimeStep','-FPS=20',('-TerraReport="'+$report+'"'),('-TerraCaptureDir="'+$captures+'"'),('-TerraGarage="'+(Join-Path $OutputDirectory 'garage.json')+'"'),('-TerraGraphics="'+(Join-Path $OutputDirectory 'graphics.json')+'"'),('-abslog="'+$log+'"'))
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $projectRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe';$info.Arguments=$arguments -join ' ';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$game=[Diagnostics.Process]::new();$game.StartInfo=$info;$started=Get-Date
if(!$game.Start()){throw 'Native game did not start'}
$gpu=Get-Command nvidia-smi -ErrorAction SilentlyContinue;$samples=[Collections.Generic.List[object]]::new()
try{while(!$game.WaitForExit(1500)){
 if(((Get-Date)-$started).TotalSeconds -gt $TimeoutSeconds){throw 'Full-lock turning check timed out'}
 if($gpu){$line=& $gpu.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits;$parts=@(($line|Select-Object -First 1)-split ',\s*');if($LASTEXITCODE -eq 0 -and $parts.Count -eq 3){$sample=[pscustomobject]@{elapsed=((Get-Date)-$started).TotalSeconds;temperatureC=[double]$parts[0];utilizationPercent=[double]$parts[1];powerW=[double]$parts[2]};$samples.Add($sample);if($sample.temperatureC -ge 77){throw 'GPU reached the 77 C verification cutoff'}}}
}}finally{if(!$game.HasExited){$game.Kill();$game.WaitForExit()};$samples.ToArray()|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $OutputDirectory 'gpu.json') -Encoding UTF8}
if(!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started){throw 'No fresh native turning result'}
$planPath=Join-Path $OutputDirectory 'turning-fixtures.json'
if(!(Test-Path -LiteralPath $planPath) -or (Get-Item -LiteralPath $planPath).LastWriteTime -lt $started){throw 'No fresh turning fixture plan'}
$plan=Get-Content -LiteralPath $planPath -Raw|ConvertFrom-Json
$roster=Get-Content -LiteralPath (Join-Path $projectRoot 'Content/NativeData/vehicle-ground-probes.json') -Raw|ConvertFrom-Json
$expected=(@($roster.vehicles).Count*4+8)*13
if($plan.version -ne 1 -or $plan.vehicles -ne @($roster.vehicles).Count -or $plan.trials -ne @($roster.vehicles).Count*4+8 -or $plan.expectedChecks -ne $expected){throw 'Incomplete turning fixture matrix'}
$result=Get-Content -LiteralPath $report -Raw|ConvertFrom-Json;$failed=@($result.tests|Where-Object {!$_.pass})
$errors=@(Select-String -LiteralPath $log -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
if($game.ExitCode -ne 0 -or $failed.Count -or $errors.Count -or @($result.tests).Count -ne $expected){$failed|Select-Object case,value,pass|Format-Table -AutoSize|Out-String|Write-Output;throw ('Turning verification failed: '+$report)}
Write-Output ('PASS '+$expected+' full-lock native turning checks; exit 0; '+$OutputDirectory)
