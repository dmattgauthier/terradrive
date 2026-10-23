param([string]$Executable='', [int]$TimeoutSeconds=900, [switch]$GroundOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if (!$Executable) { $Executable=Join-Path $projectRoot 'Build\Windows\TerraDrive\Binaries\Win64\TerraDrive.exe' }
if (!(Test-Path -LiteralPath $Executable)) { throw "Packaged executable missing: $Executable" }
$output=Join-Path $projectRoot 'Saved\Validation'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$report=Join-Path $output $(if($GroundOnly){'ground-contact.json'}else{'native-validation.json'})
$log=Join-Path $output $(if($GroundOnly){'ground-contact.log'}else{'packaged-game.log'})
$started=Get-Date
$arguments=@('-unattended','-windowed','-RenderOffscreen','-ResX=1280','-ResY=720',
    '-NoSound','-TerraValidate','-TerraCapture',('-TerraReport="'+$report+'"'),
    ('-TerraGarage="'+(Join-Path $output 'validation-garage.json')+'"'),
    ('-abslog="'+$log+'"'))
if($GroundOnly){$arguments+=@('-TerraGroundOnly','-ExecCmds="t.MaxFPS 20"')}
$startInfo=[System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName=$Executable
$startInfo.Arguments=$arguments -join ' '
$startInfo.UseShellExecute=$false
$startInfo.CreateNoWindow=$true
$startInfo.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
$game=[System.Diagnostics.Process]::new()
$game.StartInfo=$startInfo
if(!$game.Start()){throw 'Native game could not start'}
if (!$game.WaitForExit($TimeoutSeconds*1000)) {
    $game.Kill()
    throw "Native validation timed out. Inspect $log"
}
$gameExit=$game.ExitCode
if($null -eq $gameExit){throw 'Native process exit code is unavailable'}
if (!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started) {
    throw "Game did not write a fresh validation report (exit $gameExit). Inspect $log"
}
$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
$renderErrors=@(Select-String -LiteralPath $log -Pattern 'LogProceduralComponent: Error|Fatal error|Assertion failed|doesn.t have a valid ShaderMap')
if($renderErrors.Count){throw "Native mesh/render diagnostics failed. Inspect $log"}
$failed=@($result.tests | Where-Object { !$_.pass })
$minimumChecks=if($GroundOnly){19}else{286}
if ($gameExit -ne 0 -or $failed.Count -gt 0 -or @($result.tests).Count -lt $minimumChecks) {
    $failed | Format-Table | Out-String | Write-Output
    throw "Native checks failed (exit $gameExit). Inspect $report and $log"
}
Write-Output "PASS $(@($result.tests).Count) packaged native checks. Report: $report"
