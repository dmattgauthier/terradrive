param([string]$Executable='', [int]$TimeoutSeconds=900, [switch]$GroundOnly, [switch]$LockersOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if (!$Executable) { $Executable=Join-Path $projectRoot 'Build\Windows\TerraDrive\Binaries\Win64\TerraDrive.exe' }
if (!(Test-Path -LiteralPath $Executable)) { throw "Packaged executable missing: $Executable" }
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue){throw 'Close game/editor before the isolated native check.'}
$output=Join-Path $projectRoot 'Saved\Validation'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$report=Join-Path $output $(if($GroundOnly){'ground-contact.json'}elseif($LockersOnly){'lockers.json'}else{'native-validation.json'})
$log=Join-Path $output $(if($GroundOnly){'ground-contact.log'}elseif($LockersOnly){'lockers.log'}else{'packaged-game.log'})
$started=Get-Date
$arguments=@('-unattended','-windowed','-RenderOffscreen','-ResX=1280','-ResY=720',
    '-NoSound','-TerraValidate','-TerraCapture','-TerraTestFPS=20',('-TerraReport="'+$report+'"'),
    ('-TerraGarage="'+(Join-Path $output 'validation-garage.json')+'"'),
    ('-abslog="'+$log+'"'))
if($GroundOnly){$arguments+=@('-TerraGroundOnly')}
if($LockersOnly){$arguments+=@('-TerraLockersOnly')}
$startInfo=[System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName=$Executable
$startInfo.Arguments=$arguments -join ' '
$startInfo.UseShellExecute=$false
$startInfo.CreateNoWindow=$true
$startInfo.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
$game=[System.Diagnostics.Process]::new()
$game.StartInfo=$startInfo
if(!$game.Start()){throw 'Native game could not start'}
$gpuCommand=Get-Command nvidia-smi -ErrorAction SilentlyContinue
$samples=[System.Collections.Generic.List[object]]::new()
try {
    while(!$game.WaitForExit(1500)) {
        if(((Get-Date)-$started).TotalSeconds -gt $TimeoutSeconds){throw "Native validation timed out. Inspect $log"}
        if($gpuCommand){
            $line=& $gpuCommand.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits
            $parts=@(($line | Select-Object -First 1) -split ',\s*')
            if($LASTEXITCODE -eq 0 -and $parts.Count -eq 3){
                $sample=[pscustomobject]@{elapsed=((Get-Date)-$started).TotalSeconds;temperatureC=[double]$parts[0];utilizationPercent=[double]$parts[1];powerW=[double]$parts[2]}
                $samples.Add($sample)
                if($sample.temperatureC -ge 77){throw 'GPU temperature reached conservative 77 C validation cutoff'}
            }
        }
    }
} finally {
    if(!$game.HasExited){$game.Kill();$game.WaitForExit()}
    $samples.ToArray() | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $output 'native-gpu-telemetry.json') -Encoding UTF8
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
$minimumChecks=if($GroundOnly){19}elseif($LockersOnly){3}else{286}
if ($gameExit -ne 0 -or $failed.Count -gt 0 -or @($result.tests).Count -lt $minimumChecks) {
    $failed | Format-Table | Out-String | Write-Output
    throw "Native checks failed (exit $gameExit). Inspect $report and $log"
}
Write-Output "PASS $(@($result.tests).Count) packaged native checks. Report: $report"
