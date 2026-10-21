param([string]$Executable='', [int]$TimeoutSeconds=600)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if (!$Executable) { $Executable=Join-Path $projectRoot 'Build\Windows\TerraDrive\Binaries\Win64\TerraDrive.exe' }
if (!(Test-Path -LiteralPath $Executable)) { throw "Packaged executable missing: $Executable" }
$output=Join-Path $projectRoot 'Saved\Validation'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$report=Join-Path $output 'native-validation.json'
$log=Join-Path $output 'packaged-game.log'
$started=Get-Date
$arguments=@('-unattended','-windowed','-RenderOffscreen','-ResX=1280','-ResY=720',
    '-NoSound','-TerraValidate','-TerraCapture',('-TerraReport="'+$report+'"'),
    ('-abslog="'+$log+'"'))
$game=Start-Process -FilePath $Executable -ArgumentList $arguments -WindowStyle Hidden -PassThru
if (!$game.WaitForExit($TimeoutSeconds*1000)) {
    $game.Kill()
    throw "Native validation timed out. Inspect $log"
}
$game.Refresh()
if (!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started) {
    throw "Game did not write a fresh validation report (exit $($game.ExitCode)). Inspect $log"
}
$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
$failed=@($result.tests | Where-Object { !$_.pass })
if ($game.ExitCode -ne 0 -or $failed.Count -gt 0 -or @($result.tests).Count -lt 140) {
    $failed | Format-Table | Out-String | Write-Output
    throw "Native checks failed (exit $($game.ExitCode)). Inspect $report and $log"
}
Write-Output "PASS $(@($result.tests).Count) packaged native checks. Report: $report"
