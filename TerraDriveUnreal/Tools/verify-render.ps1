param([ValidateSet('Rocks','Cool','Balanced','QualitySmoke','Transitions')][string]$Mode='Rocks',[int]$StopTemperature=77)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$executable=Join-Path $projectRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue){throw 'Close game/editor before the isolated rendering check.'}
$output=Join-Path $projectRoot 'Saved/Validation'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$report=Join-Path $output ('render-'+$Mode+'.json')
$log=Join-Path $output ('render-'+$Mode+'.log')
$telemetry=Join-Path $output ('gpu-'+$Mode+'.json')
$preset=if($Mode -eq 'QualitySmoke'){2}elseif($Mode -eq 'Balanced'){1}else{0}
$flag=if($Mode -eq 'Rocks'){'-TerraRenderOnly'}elseif($Mode -eq 'Transitions'){'-TerraTransitionsOnly'}else{'-TerraPerfOnly'}
$limit=if($Mode -in @('Rocks','QualitySmoke','Transitions')){20}else{60}
$started=Get-Date
$arguments=@('-unattended','-windowed','-RenderOffscreen','-ResX=1920','-ResY=1080','-NoSound','-TerraValidate','-TerraCapture',$flag,
  ('-TerraTestFPS='+$limit),('-TerraGraphicsMode='+$preset),('-TerraReport="'+$report+'"'),('-abslog="'+$log+'"'),
  ('-TerraGarage="'+(Join-Path $output 'render-garage.json')+'"'),('-TerraGraphics="'+(Join-Path $output 'render-settings.json')+'"'))
$info=[System.Diagnostics.ProcessStartInfo]::new()
$info.FileName=$executable;$info.Arguments=$arguments -join ' ';$info.UseShellExecute=$false
$info.CreateNoWindow=$true;$info.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
$game=[System.Diagnostics.Process]::new();$game.StartInfo=$info
$samples=[System.Collections.Generic.List[object]]::new()
$gpuCommand=Get-Command nvidia-smi -ErrorAction SilentlyContinue
$aborted=''
try {
  if(!$game.Start()){throw 'Native rendering check did not start'}
  while(!$game.WaitForExit(1000)){
    if($gpuCommand){
      $line=& $gpuCommand.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used --format=csv,noheader,nounits
      $parts=@(($line | Select-Object -First 1) -split ',\s*')
      if($LASTEXITCODE -eq 0 -and $parts.Count -eq 4){
        $sample=[pscustomobject]@{elapsed=((Get-Date)-$started).TotalSeconds;temperatureC=[double]$parts[0];utilizationPercent=[double]$parts[1];powerW=[double]$parts[2];memoryMiB=[double]$parts[3]}
        $samples.Add($sample)
        if($sample.temperatureC -ge $StopTemperature){$aborted='GPU temperature reached conservative test cutoff';break}
      }
    }
    if(((Get-Date)-$started).TotalSeconds -gt 160){$aborted='Native rendering check timed out';break}
  }
} finally {
  if(!$game.HasExited){$game.Kill();$game.WaitForExit()}
  [pscustomobject]@{mode=$Mode;started=$started.ToUniversalTime().ToString('o');stopTemperatureC=$StopTemperature;aborted=$aborted;samples=@($samples.ToArray())} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $telemetry -Encoding UTF8
}
if($aborted){throw $aborted}
if($game.ExitCode -ne 0){throw ('Native check exit '+$game.ExitCode)}
if(!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started){throw 'No fresh native report'}
$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
$failed=@($result.tests | Where-Object {!$_.pass})
$minimum=if($Mode -eq 'Rocks'){69}elseif($Mode -eq 'Transitions'){53}else{16}
if($failed.Count -or @($result.tests).Count -lt $minimum){$failed | ConvertTo-Json;throw 'Native render checks failed'}
if(Select-String -LiteralPath $log -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error') {throw 'Native rendering diagnostics failed'}
if($Mode -eq 'Rocks'){
  $images=@(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'Build/Windows/TerraDrive/Saved/Screenshots') -Filter 'native-rock-*-view-*.png' | Where-Object {$_.LastWriteTime -ge $started})
  if($images.Count -ne 44){throw ('Expected 44 fresh rock views, got '+$images.Count)}
}
if($Mode -eq 'Transitions'){
  $images=@(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'Build/Windows/TerraDrive/Saved/Screenshots') -Filter 'native-transition-*-view-*.png' | Where-Object {$_.LastWriteTime -ge $started})
  if($images.Count -ne 14){throw ('Expected 14 fresh terrain boundary views, got '+$images.Count)}
}
Write-Output ('PASS '+$Mode+': '+@($result.tests).Count+' native checks; exit 0; telemetry '+$telemetry)
