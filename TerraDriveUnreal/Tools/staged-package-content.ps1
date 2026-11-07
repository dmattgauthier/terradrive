function Get-StagedPackageContent {
    param([Parameter(Mandatory)][string]$PackageDirectory)

    $contentDirectory = Join-Path $PackageDirectory 'TerraDrive/Content'
    $files = @(Get-ChildItem -LiteralPath $contentDirectory -Recurse -File -Force | Sort-Object FullName)
    if (!$files.Count) { throw "No staged game content found in $contentDirectory" }

    $relativeOffset = $PackageDirectory.TrimEnd('\','/').Length + 1
    foreach ($file in $files) {
        [pscustomobject]@{
            path = $file.FullName.Substring($relativeOffset).Replace('\','/')
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
}
