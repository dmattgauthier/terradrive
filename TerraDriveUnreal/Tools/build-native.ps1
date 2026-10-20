param([switch]$Package,[switch]$ImportAssets)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$engineRoot='C:\Program Files\Epic Games\UE_5.8'
$project=Join-Path $projectRoot 'TerraDrive.uproject'
$env:UBA_ROOT=Join-Path $projectRoot 'Saved\UBA'
$env:uebp_LogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
$env:uebp_FinalLogFolder=Join-Path $projectRoot 'Saved\AutomationLogs'
& "$engineRoot\Engine\Build\BatchFiles\Build.bat" TerraDriveEditor Win64 Development "-Project=$project" -WaitMutex -NoHotReloadFromIDE -NoUBA
if ($LASTEXITCODE) { throw 'Editor compilation failed' }
if ($ImportAssets) {
    & node (Join-Path $PSScriptRoot 'export-source.mjs')
    if ($LASTEXITCODE) { throw 'Source conversion failed' }
    $importMarker=Join-Path $projectRoot 'Saved\import-complete.json'
    $editorArgs=@(('"'+$project+'"'),'-run=pythonscript',('-script="'+$PSScriptRoot+'\import-assets.py"'),'-unattended','-nullrhi','-nosplash','-NoSound','-stdout','-FullStdOutLogOutput')
    $editorProcess=Start-Process -FilePath "$engineRoot\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" -ArgumentList $editorArgs -WindowStyle Hidden -Wait -PassThru
    if ($editorProcess.ExitCode -or !(Test-Path -LiteralPath $importMarker) -or !(Test-Path -LiteralPath (Join-Path $projectRoot 'Content\Maps\ProvingGround.umap'))) { throw 'Asset import did not produce the expected map and completion marker. Check the editor log; exit 0 alone does not prove success.' }
}
if ($Package) {
    & "$engineRoot\Engine\Build\BatchFiles\RunUAT.bat" BuildCookRun "-project=$project" -noP4 -platform=Win64 -clientconfig=Development -build -cook -stage -pak -iostore -archive "-archivedirectory=$projectRoot\Build" -unattended -utf8output '-UbtArgs=-NoUBA'
    if ($LASTEXITCODE) { throw 'Packaging failed' }
}
