# C++ iteration after an accepted full asset cook. This never recooks assets.
param([string]$EngineRoot='C:\Program Files\Epic Games\UE_5.8')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
if(Get-Process -Name TerraDrive,UnrealEditor,UnrealEditor-Cmd -ErrorAction SilentlyContinue){throw 'Close game/editor before staging native code.'}
$taskPackage=Join-Path $taskRoot 'Build/Windows/TerraDrive'
$taskPakFolder=Join-Path $taskPackage 'Content/Paks'
$taskPaks=@(Get-ChildItem -LiteralPath $taskPakFolder -File | Where-Object {$_.Extension -in '.pak','.ucas','.utoc'})
if(!$taskPaks.Count -or !(Test-Path -LiteralPath (Join-Path $taskRoot 'Saved/Cooked/Windows'))){throw 'A successful full cook/package is required first. Use build-native.ps1 -ImportAssets -Package after asset changes.'}
$taskBefore=@($taskPaks | ForEach-Object {[pscustomobject]@{path=$_.FullName;size=$_.Length;modified=$_.LastWriteTimeUtc.Ticks}})
$env:UBA_ROOT=Join-Path $taskRoot 'Saved/UBA'
& "$EngineRoot/Engine/Build/BatchFiles/Build.bat" TerraDrive Win64 Development "-Project=$taskRoot/TerraDrive.uproject" -WaitMutex -NoHotReloadFromIDE -NoUBA -MaxParallelActions=2
if($LASTEXITCODE){throw 'Native game compilation failed'}
$taskBinary=Join-Path $taskRoot 'Binaries/Win64/TerraDrive.exe'
$taskDestination=Join-Path $taskPackage 'Binaries/Win64/TerraDrive.exe'
Copy-Item -LiteralPath $taskBinary -Destination $taskDestination -Force
$taskSymbols=Join-Path $taskRoot 'Binaries/Win64/TerraDrive.pdb'
if(Test-Path -LiteralPath $taskSymbols){Copy-Item -LiteralPath $taskSymbols -Destination (Join-Path $taskPackage 'Binaries/Win64/TerraDrive.pdb') -Force}
$taskDigest=(Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash
if($taskDigest -ne (Get-FileHash -LiteralPath $taskBinary -Algorithm SHA256).Hash){throw 'Staged executable does not match the compiled game'}
foreach($taskFile in $taskBefore){$taskCurrent=Get-Item -LiteralPath $taskFile.path;if($taskCurrent.Length -ne $taskFile.size -or $taskCurrent.LastWriteTimeUtc.Ticks -ne $taskFile.modified){throw 'Cooked content changed during code staging'}}
[pscustomobject]@{completed=(Get-Date).ToUniversalTime().ToString('o');executable=$taskDestination;SHA256=$taskDigest;assetCookReused=$true;pakFilesPreserved=$taskBefore;sourceBinary=$taskBinary} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot 'Saved/code-stage-receipt.json') -Encoding UTF8
Write-Output ('BUILD SUCCESSFUL; native C++ staged with unchanged cooked content; SHA256 '+$taskDigest)
