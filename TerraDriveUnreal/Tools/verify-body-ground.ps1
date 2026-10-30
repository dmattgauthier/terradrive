param([switch]$Quick,[switch]$LegacyControl,[string]$OutputDirectory,[int]$TimeoutSeconds=1600)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(@(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue).Count){throw 'Close game/editor before native body-ground verification.'}
if(!$OutputDirectory){$OutputDirectory=Join-Path $projectRoot ('Saved/BodyGround-'+(Get-Date -Format 'yyyy-MM-ddTHH-mm-ss-fff'))}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
if(Test-Path -LiteralPath (Join-Path $OutputDirectory 'receipt.json')){throw 'Preserve the existing result and choose a fresh output directory.'}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$report=Join-Path $OutputDirectory 'result.json';$log=Join-Path $OutputDirectory 'game.log';$captures=Join-Path $OutputDirectory 'Screenshots'
New-Item -ItemType Directory -Path $captures -Force | Out-Null
$arguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-TerraValidate','-TerraCapture','-TerraBodyGroundOnly','-TerraTestFPS=20','-TerraGraphicsMode=2',('-TerraReport="'+$report+'"'),('-TerraCaptureDir="'+$captures+'"'),('-TerraGarage="'+(Join-Path $OutputDirectory 'garage.json')+'"'),('-TerraGraphics="'+(Join-Path $OutputDirectory 'graphics.json')+'"'),('-abslog="'+$log+'"'))
if($Quick){$arguments+='-TerraBodyGroundQuick'}
if($LegacyControl){$arguments+='-TerraLegacyBodyGrip'}
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $projectRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe';$info.Arguments=$arguments -join ' ';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$game=[Diagnostics.Process]::new();$game.StartInfo=$info;$started=Get-Date
$receipt=[ordered]@{mode='BodyGround';quick=[bool]$Quick;legacyControl=[bool]$LegacyControl;started=$started.ToUniversalTime().ToString('o');executableSha256=(Get-FileHash -LiteralPath $info.FileName -Algorithm SHA256).Hash.ToLower();arguments=$arguments;pass=$false}
$gpu=Get-Command nvidia-smi -ErrorAction SilentlyContinue;$samples=[Collections.Generic.List[object]]::new();$problem=$null
try{
 if(!$game.Start()){throw 'Native game did not start'}
 while(!$game.WaitForExit(1500)){
  if(((Get-Date)-$started).TotalSeconds -gt $TimeoutSeconds){throw 'Native body-ground test timed out'}
  if($gpu){$line=& $gpu.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits;$parts=@(($line|Select-Object -First 1)-split ',\s*');if($LASTEXITCODE -eq 0 -and $parts.Count -eq 3){$samples.Add([pscustomobject]@{elapsed=((Get-Date)-$started).TotalSeconds;temperatureC=[double]$parts[0];utilizationPercent=[double]$parts[1];powerW=[double]$parts[2]});if([double]$parts[0] -ge 77){throw 'GPU reached 77 C verification cutoff'}}}
 }
 $receipt.exitCode=$game.ExitCode
 if(!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started){throw 'No fresh native report'}
 $planPath=Join-Path $OutputDirectory 'body-ground-fixtures.json'
 if(!(Test-Path -LiteralPath $planPath) -or (Get-Item -LiteralPath $planPath).LastWriteTime -lt $started){throw 'No fresh native fixture plan'}
 $plan=Get-Content -LiteralPath $planPath -Raw|ConvertFrom-Json
 $expectedTrials=if($Quick){6}else{39}
 if($plan.version -ne 1 -or $plan.vehicles -ne 9 -or @($plan.cases).Count -ne $expectedTrials -or $plan.checksPerTrial -ne 12 -or $plan.expectedChecks -ne 1+$expectedTrials*12 -or $plan.legacyControl -ne [bool]$LegacyControl){throw 'Incomplete native fixture matrix'}
 $result=Get-Content -LiteralPath $report -Raw|ConvertFrom-Json
 $failed=@($result.tests|Where-Object {!$_.pass});$errors=@(Select-String -LiteralPath $log -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
 $receipt.checks=@($result.tests).Count;$receipt.expectedChecks=$plan.expectedChecks;$receipt.failures=$failed;$receipt.errors=@($errors.Line)
 if($game.ExitCode -ne 0 -or $failed.Count -or $errors.Count -or $receipt.checks -ne $plan.expectedChecks){throw ('Native body-ground verification failed: '+$failed.Count+' failed checks; '+$receipt.checks+'/'+$plan.expectedChecks+'; exit '+$game.ExitCode)}
 $receipt.pass=$true
}catch{$problem=$_;$receipt.error=$_.ToString()}finally{
 if($game.Id -and !$game.HasExited){$game.Kill();$game.WaitForExit()}
 $receipt.completed=(Get-Date).ToUniversalTime().ToString('o');$receipt.captureCount=@(Get-ChildItem -LiteralPath $captures -Filter '*.png' -File).Count
 $samples.ToArray()|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $OutputDirectory 'gpu.json') -Encoding UTF8
 $receipt|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $OutputDirectory 'receipt.json') -Encoding UTF8
}
if($problem){throw $problem};Write-Output ('PASS '+$receipt.checks+' native body-ground checks; '+$receipt.captureCount+' captures; exit 0; '+$OutputDirectory)
