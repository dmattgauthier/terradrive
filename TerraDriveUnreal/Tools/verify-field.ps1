param([string]$Name='field',[int]$TimeoutSeconds=900,[switch]$PhysicsOnly,[string]$SavedBuild='')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue){throw 'Close the game/editor before this isolated native check.'}
$output=Join-Path $projectRoot ('Saved/Validation/'+$Name)
if(Test-Path -LiteralPath (Join-Path $output 'receipt.json')){throw 'This verification already has evidence. Choose another Name.'}
New-Item -ItemType Directory -Path (Join-Path $output 'Screenshots') -Force|Out-Null
$report=Join-Path $output 'result.json';$log=Join-Path $output 'game.log'
$arguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-NoTrace','-TerraValidate','-TerraFieldOnly','-TerraCapture','-TerraTestFPS=20','-TerraGraphicsMode=2',
 ('-TerraReport="'+$report+'"'),('-TerraCaptureDir="'+(Join-Path $output 'Screenshots')+'"'),('-TerraGarage="'+(Join-Path $output 'garage.json')+'"'),
 ('-TerraGraphics="'+(Join-Path $output 'graphics.json')+'"'),('-TerraControls="'+(Join-Path $output 'controls.json')+'"'),('-UserDir="'+(Join-Path $output 'User')+'"'),('-abslog="'+$log+'"'))
if($PhysicsOnly){$arguments+='-TerraFieldPhysicsOnly'}
if($SavedBuild){$arguments+=('-TerraPerfBuild="'+(Resolve-Path -LiteralPath $SavedBuild).ProviderPath+'"')}
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $projectRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
$info.Arguments=$arguments -join ' ';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$game=[Diagnostics.Process]::new();$game.StartInfo=$info;$started=Get-Date;$problem=$null
$receipt=[ordered]@{started=$started.ToUniversalTime().ToString('o');executableSha256=(Get-FileHash -LiteralPath $info.FileName -Algorithm SHA256).Hash.ToLower();arguments=$arguments;pass=$false}
$gpu=Get-Command nvidia-smi -ErrorAction SilentlyContinue;$samples=[Collections.Generic.List[object]]::new()
try{
 if(!$game.Start()){throw 'Native game did not start'}
 while(!$game.WaitForExit(1500)){
  if(((Get-Date)-$started).TotalSeconds -gt $TimeoutSeconds){throw 'Field verification timed out'}
  if($gpu){$line=& $gpu.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used --format=csv,noheader,nounits;$p=@(($line|Select-Object -First 1)-split ',\s*');if($LASTEXITCODE -eq 0 -and $p.Count -eq 4){$sample=[pscustomobject]@{elapsed=((Get-Date)-$started).TotalSeconds;temperatureC=[double]$p[0];utilizationPercent=[double]$p[1];powerW=[double]$p[2];memoryMiB=[double]$p[3]};$samples.Add($sample);if($sample.temperatureC -ge 77){throw 'GPU reached the 77 C cutoff'}}}
 }
 $receipt.exitCode=$game.ExitCode
 if(!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started){throw 'No fresh native result'}
 $result=Get-Content -LiteralPath $report -Raw|ConvertFrom-Json;$failed=@($result.tests|Where-Object {!$_.pass});$receipt.checks=@($result.tests).Count;$receipt.failures=$failed
 $expected=if($PhysicsOnly){96}else{145}
 if($game.ExitCode -ne 0 -or $failed.Count -or $receipt.checks -ne $expected){throw ('Native field verification failed: '+$failed.Count+' checks; exit '+$game.ExitCode)}
 if(Select-String -LiteralPath $log -Pattern 'Fatal error|Assertion failed|Ensure condition failed|LogOutputDevice: Error|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag'){throw 'Native field log contains an engine/material error'}
 $receipt.pass=$true
}catch{$problem=$_;$receipt.error=$_.ToString()}finally{
 if($game.Id -and !$game.HasExited){$game.Kill();$game.WaitForExit()}
 $receipt.completed=(Get-Date).ToUniversalTime().ToString('o');$receipt.captureCount=@(Get-ChildItem -LiteralPath (Join-Path $output 'Screenshots') -Filter '*.png').Count
 $samples.ToArray()|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $output 'gpu.json') -Encoding UTF8
 $receipt|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $output 'receipt.json') -Encoding UTF8
}
if($problem){throw $problem};Write-Output ('PASS field '+$receipt.checks+' checks, '+$receipt.captureCount+' captures')
