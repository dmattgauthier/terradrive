# Complete native model inspection uses the current roster and ten views per car.
param([int]$TimeoutSeconds=600)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'verify-winter.ps1') -Mode Art -TimeoutSeconds $TimeoutSeconds
if($LASTEXITCODE){exit $LASTEXITCODE}
