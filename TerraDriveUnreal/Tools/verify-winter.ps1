param([ValidateSet('Detail','Movement','Winter','Art')][string]$Mode='Detail',[int]$TimeoutSeconds=240,[switch]$FullTextureDiagnostic)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue){throw 'Close game/editor before this isolated native check.'}
$output=Join-Path $projectRoot 'Saved/Validation'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$report=Join-Path $output ('winter-'+$Mode+'.json')
$log=Join-Path $output ('winter-'+$Mode+'.log')
$started=Get-Date
$arguments=@('-unattended','-windowed','-ForceRes','-RenderOffscreen','-ResX=1600','-ResY=900','-NoSound','-TerraValidate','-TerraCapture','-TerraTestFPS=20',
    ('-TerraReport="'+$report+'"'),('-TerraGarage="'+(Join-Path $output 'winter-test-garage.json')+'"'),
    ('-TerraGraphics="'+(Join-Path $output 'winter-test-graphics.json')+'"'),('-abslog="'+$log+'"'))
if($Mode -eq 'Detail'){$arguments+='-TerraTerrainDetailOnly'}
if($Mode -in @('Detail','Winter')){$arguments+='-TerraGraphicsMode=2'}
if($Mode -eq 'Movement'){$arguments+='-TerraMomentumOnly'}
if($Mode -eq 'Winter'){$arguments+='-TerraWinterOnly';$TimeoutSeconds=420}
if($Mode -eq 'Art'){$arguments+='-TerraModelHeroOnly';$arguments+='-TerraGraphicsMode=2'}
if($FullTextureDiagnostic){$arguments+='-ExecCmds="r.Streaming.FullyLoadUsedTextures 1"'}
$info=[System.Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $projectRoot 'Build/Windows/TerraDrive/Binaries/Win64/TerraDrive.exe'
$info.Arguments=$arguments -join ' ';$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
$game=[System.Diagnostics.Process]::new();$game.StartInfo=$info
if(!$game.Start()){throw 'Native game could not start'}
$gpuCommand=Get-Command nvidia-smi -ErrorAction SilentlyContinue
$samples=[System.Collections.Generic.List[object]]::new()
try{
    while(!$game.WaitForExit(1500)){
        if(((Get-Date)-$started).TotalSeconds -gt $TimeoutSeconds){throw ('Native '+$Mode+' validation timed out: '+$log)}
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
    $samples.ToArray() | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $output ('winter-gpu-'+$Mode+'.json')) -Encoding UTF8
}
$gameExit=$game.ExitCode
if($null -eq $gameExit){throw 'Native process exit code unavailable'}
if(!(Test-Path -LiteralPath $report) -or (Get-Item -LiteralPath $report).LastWriteTime -lt $started){throw ('No fresh native report: '+$log)}
$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
$failed=@($result.tests | Where-Object {!$_.pass})
$minimum=if($Mode -eq 'Detail'){15}elseif($Mode -eq 'Art'){42}elseif($Mode -eq 'Movement'){84}else{46}
$errors=@(Select-String -LiteralPath $log -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error')
if($gameExit -ne 0 -or $failed.Count -or $errors.Count -or @($result.tests).Count -lt $minimum){$failed | Format-Table | Out-String | Write-Output;throw ('Native '+$Mode+' verification failed, exit '+$gameExit+': '+$report)}
Write-Output ('PASS '+$Mode+' '+@($result.tests).Count+' native checks; fresh report and exit 0')
