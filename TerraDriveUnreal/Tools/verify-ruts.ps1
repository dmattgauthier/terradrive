param([int]$TimeoutSeconds=240,[switch]$DrivenOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue){throw 'Close game/editor before this isolated native check.'}
$output=Join-Path $projectRoot 'Saved/Validation'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$suffix=if($DrivenOnly){'ruts-driven'}else{'ruts'}
$report=Join-Path $output ($suffix+'.json')
$log=Join-Path $output ($suffix+'.log')
$started=Get-Date
$arguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-TerraValidate','-TerraCapture','-TerraTestFPS=20','-TerraGraphicsMode=2','-TerraRutOnly',
    ('-TerraReport="'+$report+'"'),('-TerraGarage="'+(Join-Path $output 'rut-test-garage.json')+'"'),
    ('-TerraGraphics="'+(Join-Path $output 'rut-test-graphics.json')+'"'),('-abslog="'+$log+'"'))
if($DrivenOnly){$arguments+='-TerraRutDriveOnly'}
$info=[System.Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $projectRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
$info.Arguments=$arguments -join ' ';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
$game=[System.Diagnostics.Process]::new();$game.StartInfo=$info
if(!$game.Start()){throw 'Native game could not start'}
$gpuCommand=Get-Command nvidia-smi -ErrorAction SilentlyContinue
$samples=[System.Collections.Generic.List[object]]::new()
try{
    while(!$game.WaitForExit(1500)){
        if(((Get-Date)-$started).TotalSeconds -gt $TimeoutSeconds){throw ('Native rut validation timed out: '+$log)}
        if($gpuCommand){
            $line=& $gpuCommand.Source --query-gpu=temperature.gpu,utilization.gpu,power.draw,memory.used --format=csv,noheader,nounits
            $parts=@(($line | Select-Object -First 1) -split ',\s*')
            if($LASTEXITCODE -eq 0 -and $parts.Count -eq 4){
                $sample=[pscustomobject]@{elapsed=((Get-Date)-$started).TotalSeconds;temperatureC=[double]$parts[0];utilizationPercent=[double]$parts[1];powerW=[double]$parts[2];memoryMiB=[double]$parts[3]}
                $samples.Add($sample)
                if($sample.temperatureC -ge 77){throw 'GPU reached the conservative 77 C validation cutoff'}
            }
        }
    }
}finally{
    if(!$game.HasExited){$game.Kill();$game.WaitForExit()}
    $samples.ToArray() | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $output ($suffix+'-gpu.json')) -Encoding UTF8
}
$gameExit=$game.ExitCode
if($null -eq $gameExit){throw 'Native process exit code unavailable'}
if(!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started){throw ('No fresh native report: '+$log)}
$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
$failed=@($result.tests | Where-Object {!$_.pass})
$errors=@(Select-String -LiteralPath $log -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error')
$expected=if($DrivenOnly){16}else{101}
if($gameExit -ne 0 -or $failed.Count -or $errors.Count -or @($result.tests).Count -ne $expected){$failed | Format-Table | Out-String | Write-Output;throw ('Native rut verification failed, exit '+$gameExit+': '+$report)}
if(!$DrivenOnly){foreach($surface in @('firm-dirt','mud','snow','wet-grass','sand','loose-dirt')){
    foreach($view in @('oblique','profile')){
        $capture=Join-Path $projectRoot ('Build/Windows/TerraDrive/Saved/Screenshots/native-rut-'+$surface+'-'+$view+'.png')
        if(!(Test-Path -LiteralPath $capture) -or (Get-Item -LiteralPath $capture).LastWriteTime -lt $started){throw ('Missing fresh native rut capture: '+$capture)}
    }
}}
foreach($surface in @('mud','snow')){
    foreach($view in @('oblique','profile')){
        $capture=Join-Path $projectRoot ('Build/Windows/TerraDrive/Saved/Screenshots/native-rut-driven-'+$surface+'-'+$view+'.png')
        if(!(Test-Path -LiteralPath $capture) -or (Get-Item -LiteralPath $capture).LastWriteTime -lt $started){throw ('Missing fresh actual-drive rut capture: '+$capture)}
    }
}
$captureCount=if($DrivenOnly){4}else{16}
Write-Output ('PASS Ruts '+@($result.tests).Count+' native checks; '+$captureCount+' fresh captures, fresh report and exit 0')
