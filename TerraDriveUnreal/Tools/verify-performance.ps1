# Real-time terrain performance comparison; requires the packaged native build.
param([ValidatePattern('^[a-z0-9-]+$')][string]$Name='quarry',
 [ValidateRange(10,45)][int]$Cap=30,[ValidateRange(0,2)][int]$Quality=0,[switch]$Legacy,[switch]$Trace,
 [ValidateRange(1280,1920)][int]$Width=1280,[ValidateRange(720,1080)][int]$Height=720,[string]$OutputRoot='')
$ErrorActionPreference='Stop'
$project22=Split-Path $PSScriptRoot -Parent
# Each invocation keeps its own receipts, isolated settings and captures.
if(!$OutputRoot){$OutputRoot=Join-Path $project22 ('Saved/Performance/'+[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ssZ'))}
$root22=[IO.Path]::GetFullPath($OutputRoot)
if(@(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd,ShaderCompileWorker,UnrealPak,UnrealInsights -ErrorAction SilentlyContinue).Count){throw 'Serialize native jobs'}
$out22=Join-Path $root22 $Name
if(Test-Path -LiteralPath $out22){throw 'Preserve existing evidence and use another name'}
New-Item -ItemType Directory -Path (Join-Path $out22 'Screenshots') -Force|Out-Null
$exe22=Join-Path $project22 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
$args22=@('-unattended','-windowed','-ForceRes','-RenderOffscreen',('-ResX='+$Width),('-ResY='+$Height),'-NoSound',
 '-TerraValidate','-TerraQuarryPerformanceOnly','-TerraCapture',('-TerraTestFPS='+$Cap),('-TerraGraphicsMode='+$Quality),
 ('-UserDir="'+(Join-Path $out22 'User')+'"'),('-TerraReport="'+(Join-Path $out22 'result.json')+'"'),
 ('-TerraCaptureDir="'+(Join-Path $out22 'Screenshots')+'"'),('-TerraGarage="'+(Join-Path $out22 'garage.json')+'"'),
 ('-TerraGraphics="'+(Join-Path $out22 'graphics.json')+'"'),('-TerraControls="'+(Join-Path $out22 'controls.json')+'"'),
 ('-abslog="'+(Join-Path $out22 'game.log')+'"'))
if($Legacy){$args22+=@('-TerraLegacySoilMeshLayout','-TerraLegacySoilReset','-TerraLegacySoilLeafEdges')}
if($Trace){$args22+=@('-statnamedevents','-trace=cpu,frame,log,bookmark,region,task',('-tracefile="'+(Join-Path $out22 'cpu.utrace')+'"'))}else{$args22+='-NoTrace'}
$source22=@(Get-ChildItem -LiteralPath (Join-Path $project22 'Source') -Recurse -File | Sort-Object FullName | ForEach-Object {
 [pscustomobject]@{path=$_.FullName.Substring($project22.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()}})
$player22=@{}
foreach($relative22 in @('Saved/garage-builds.json','Saved/graphics-settings.json','Saved/controls-settings.json','Saved/Config/Windows/GameUserSettings.ini',
 'Build/Windows/TerraDrive/Saved/garage-builds.json','Build/Windows/TerraDrive/Saved/graphics-settings.json','Build/Windows/TerraDrive/Saved/controls-settings.json','Build/Windows/TerraDrive/Saved/Config/Windows/GameUserSettings.ini')){
 $file22=Join-Path $project22 $relative22
 $player22[$relative22]=if(Test-Path -LiteralPath $file22){(Get-FileHash -LiteralPath $file22 -Algorithm SHA256).Hash}else{$null}
}
$start22=[DateTime]::UtcNow
$receipt22=[ordered]@{purpose='Real-time stock Urus quarry benchmark with functional guards';started=$start22.ToString('o');
 executableSha256=(Get-FileHash -LiteralPath $exe22 -Algorithm SHA256).Hash.ToLower();arguments=$args22;source=$source22;
 cap=$Cap;quality=$Quality;resolution=@($Width,$Height);trace=[bool]$Trace;legacyLayout=[bool]$Legacy;fixedClock=$false;pass=$false}
$pi22=[Diagnostics.ProcessStartInfo]::new();$pi22.FileName=$exe22;$pi22.Arguments=$args22 -join ' '
$pi22.WorkingDirectory=Split-Path $exe22 -Parent;$pi22.UseShellExecute=$false;$pi22.CreateNoWindow=$true;$pi22.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$game22=[Diagnostics.Process]::new();$game22.StartInfo=$pi22;$samples22=[Collections.Generic.List[object]]::new();$problem22=$null
try{
 if(!$game22.Start()){throw 'Game launch failed'}
 while(!$game22.WaitForExit(1000)){
  if(([DateTime]::UtcNow-$start22).TotalSeconds -gt 240){throw 'Bounded benchmark deadline exceeded'}
  $line22=& nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used --format=csv,noheader,nounits
  if($LASTEXITCODE){throw 'GPU telemetry unavailable'}
  $p22=@(($line22|Select-Object -First 1)-split ',\s*');if($p22.Count -ne 4){throw 'Incomplete GPU telemetry'}
  $game22.Refresh()
  $sample22=[pscustomobject]@{elapsed=([DateTime]::UtcNow-$start22).TotalSeconds;temperatureC=[double]$p22[0];
   utilizationPercent=[double]$p22[1];powerW=[double]$p22[2];gpuMemoryMiB=[double]$p22[3];
   processPrivateMiB=$game22.PrivateMemorySize64/1MB;processWorkingSetMiB=$game22.WorkingSet64/1MB;cpuSeconds=$game22.TotalProcessorTime.TotalSeconds}
  $samples22.Add($sample22);if($sample22.temperatureC -ge 77){throw 'Sampled GPU temperature reached 77 C cutoff'}
 }
 $receipt22.exitCode=$game22.ExitCode
 if($game22.ExitCode -ne 0){throw ('Benchmark process exited '+$game22.ExitCode)}
 $result22=Get-Content -LiteralPath (Join-Path $out22 'result.json') -Raw|ConvertFrom-Json
 $receipt22.checks=@($result22.tests).Count;$receipt22.failures=@($result22.tests|Where-Object {!$_.pass})
 if($receipt22.failures.Count -or $receipt22.checks -ne 14){throw 'A benchmark functional guard failed'}
 $metric22=Get-Content -LiteralPath (Join-Path $out22 'quarry-performance.json') -Raw|ConvertFrom-Json
 if($metric22.fixedClock -or $metric22.sharedSections -eq [bool]$Legacy){throw 'Unexpected benchmark clock or layout'}
 $errors22=@(Select-String -LiteralPath (Join-Path $out22 'game.log') -Pattern 'Fatal error|Assertion failed|Ensure condition failed|LogOutputDevice: Error|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
 if($errors22.Count){throw 'Native engine errors occurred'}
 $receipt22.pass=$true
}catch{$problem22=$_;$receipt22.error=$_.ToString()}finally{
 if($game22.Id -and !$game22.HasExited){$game22.Kill();$game22.WaitForExit()}
 $receipt22.playerSettingsUnchanged=$true
 foreach($relative22 in $player22.Keys){
  $file22=Join-Path $project22 $relative22
  $hash22=if(Test-Path -LiteralPath $file22){(Get-FileHash -LiteralPath $file22 -Algorithm SHA256).Hash}else{$null}
  if($hash22 -ne $player22[$relative22]){$receipt22.playerSettingsUnchanged=$false;$receipt22.pass=$false;if(!$problem22){$problem22='Player settings changed during verification'}}
 }
 $receipt22.ended=[DateTime]::UtcNow.ToString('o');$receipt22.seconds=([DateTime]::UtcNow-$start22).TotalSeconds
 $receipt22.captures=@(Get-ChildItem -LiteralPath (Join-Path $out22 'Screenshots') -File -Filter '*.png').Count
 ConvertTo-Json -InputObject @($samples22.ToArray()) -Depth 5 | Set-Content -LiteralPath (Join-Path $out22 'telemetry.json') -Encoding UTF8
 $receipt22|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $out22 'receipt.json') -Encoding UTF8
}
if($problem22){throw $problem22}
Write-Output ('BENCHMARK COMPLETE '+$out22+' fps='+$metric22.averageFPS+' p95MS='+$metric22.p95FrameMS+' distanceFt='+$metric22.distanceFt)
