param([ValidateSet('Detail','Movement','Winter','Art')][string]$Mode='Detail',[int]$TimeoutSeconds=600,[switch]$FullTextureDiagnostic)
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
# Keep the short coasting fixtures' observation density independent of render
# stalls. The 20 FPS cap still limits GPU load; only the test simulation clock
# is fixed. Player driving does not use this switch.
if($Mode -eq 'Movement'){$arguments+='-TerraMomentumOnly';$arguments+='-UseFixedTimeStep';$arguments+='-FPS=20'}
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
$minimum=if($Mode -eq 'Detail'){15}else{46}
$expected=$null
if($Mode -in @('Art','Movement')){
    $roster=Get-Content -LiteralPath (Join-Path $projectRoot 'Content/NativeData/vehicle-ground-probes.json') -Raw | ConvertFrom-Json
    $vehicleCount=@($roster.vehicles).Count
    if($vehicleCount -lt 1){throw 'The generated vehicle fixture roster is empty'}
    if($Mode -eq 'Art'){
        # One native automotive-material assertion and all ten views per
        # actual exported body. Require every named case as well as the count.
        $expected=$vehicleCount*11
        $caseNames=@($result.tests.case)
        for($vehicle=0;$vehicle -lt $vehicleCount;$vehicle++){
            if(('Vehicle {0} cooked body uses Epic automotive paint and trim' -f $vehicle) -notin $caseNames){throw ('Missing automotive-material result for vehicle '+$vehicle)}
            for($view=0;$view -lt 10;$view++){if(('Vehicle {0} body renders in close photo view {1}' -f $vehicle,$view) -notin $caseNames){throw ('Missing native art view '+$vehicle+':'+$view)}}
        }
    }else{
        $planPath=Join-Path $output 'momentum-fixtures.json'
        if(!(Test-Path -LiteralPath $planPath) -or (Get-Item -LiteralPath $planPath).LastWriteTime -lt $started){throw 'No fresh momentum fixture plan'}
        $plan=Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
        $coverage=@($plan.riseVehicles | Sort-Object -Unique)
        $planValid=$plan.version -eq 1 -and $plan.vehicleCount -eq $vehicleCount -and $plan.boundaryTrialCount -eq 7 -and @($plan.boundaries).Count -eq 7 -and @($plan.riseVehicles).Count -eq $vehicleCount -and $coverage.Count -eq $vehicleCount
        for($vehicle=0;$vehicle -lt $vehicleCount;$vehicle++){$planValid=$planValid -and $vehicle -in $coverage}
        $expected=[int]$plan.boundaryTrialCount*[int]$plan.checksPerBoundary+$vehicleCount*[int]$plan.checksPerRiseVehicle+[int]$plan.barrierChecks
        if(!$planValid -or $plan.expectedChecks -ne $expected){throw 'Momentum fixture plan does not cover every exported vehicle and original terrain boundary'}
    }
}
$countValid=if($null -ne $expected){@($result.tests).Count -eq $expected}else{@($result.tests).Count -ge $minimum}
$errors=@(Select-String -LiteralPath $log -Pattern 'Fatal error|Assertion failed|doesn.t have a valid ShaderMap|LogProceduralComponent: Error|missing usage flag')
if($gameExit -ne 0 -or $failed.Count -or $errors.Count -or !$countValid){$failed | Format-Table | Out-String | Write-Output;throw ('Native '+$Mode+' verification failed, exit '+$gameExit+': '+$report+'; checks '+@($result.tests).Count+'/'+$expected)}
Write-Output ('PASS '+$Mode+' '+@($result.tests).Count+' native checks; fresh report and exit 0')
