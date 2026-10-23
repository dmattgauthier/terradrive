# Close native art inspection for all six stock vehicles. Uses an isolated save.
param()
$Mode='ModelHeroOnly'
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$gameFile=Join-Path $taskRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
$validationDir=Join-Path $taskRoot 'Saved/Validation'
$reportFile=Join-Path $validationDir ('focused-'+$Mode+'.json')
$logFile=Join-Path $validationDir ('focused-'+$Mode+'.log')
$garageFile=Join-Path $validationDir 'focused-garage.json'
$started=Get-Date
$arguments=@('-unattended','-windowed','-RenderOffscreen','-ResX=1280','-ResY=720','-NoSound','-ExecCmds="t.MaxFPS 20"','-TerraValidate','-TerraCapture',('-Terra'+$Mode),('-TerraReport="'+$reportFile+'"'),('-abslog="'+$logFile+'"'),('-TerraGarage="'+$garageFile+'"'))
$startInfo=[System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName=$gameFile
$startInfo.Arguments=$arguments -join ' '
$startInfo.UseShellExecute=$false
$startInfo.CreateNoWindow=$true
$startInfo.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
$gameProcess=[System.Diagnostics.Process]::new()
$gameProcess.StartInfo=$startInfo
if(!$gameProcess.Start()){throw 'Native game could not start'}
if(!$gameProcess.WaitForExit(240000)){$gameProcess.Kill();throw 'Focused inspection timed out'}
$gameExit=$gameProcess.ExitCode
if($null -eq $gameExit){throw 'Focused process exit code unavailable'}
if(!(Test-Path -LiteralPath $reportFile) -or (Get-Item -LiteralPath $reportFile).LastWriteTime -lt $started){throw 'No fresh focused report'}
$report=Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json
$failed=@($report.tests | Where-Object {!$_.pass})
if($gameExit -ne 0 -or $failed.Count){$failed | ConvertTo-Json;throw ('Focused run failed, exit '+$gameExit+': '+$logFile)}
if(@($report.tests).Count -ne 42){throw 'Expected 42 all-model rendering checks'}
foreach($vehicle in 0..5){
 for($i=0;$i -lt 6;$i++){
  $capture=Join-Path $taskRoot ('Build/Windows/TerraDrive/Saved/Screenshots/native-vehicle-'+$vehicle+'-hero-'+$i+'.png')
  if(!(Test-Path -LiteralPath $capture) -or (Get-Item -LiteralPath $capture).LastWriteTime -lt $started){throw ('Missing fresh hero view '+$i)}
 }
}
Write-Output ('PASS native model art; '+@($report.tests).Count+' checks; fresh report and exit 0')

