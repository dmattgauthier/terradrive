param([string]$PackageDirectory=$PSScriptRoot)
$ErrorActionPreference='Stop'

$package=[IO.Path]::GetFullPath($PackageDirectory)
$legacy=Join-Path $package 'TerraDrive\Saved'
$profile=Join-Path (Split-Path $package -Parent) 'PlayerData\Saved'
$marker=Join-Path $profile '.legacy-profile-imported'
if(!(Test-Path -LiteralPath $legacy -PathType Container) -or (Test-Path -LiteralPath $marker -PathType Leaf)){return}

function Import-MissingProfileFile([string]$RelativePath){
    $source=Join-Path $legacy $RelativePath
    $destination=Join-Path $profile $RelativePath
    if(![IO.File]::Exists($source) -or [IO.File]::Exists($destination)){return}

    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
    # A retry or another launcher can safely finish the same migration.
    $temporary=$destination+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
    try {
        [IO.File]::Copy($source,$temporary)
        try { [IO.File]::Move($temporary,$destination) }
        catch [IO.IOException] {
            if(![IO.File]::Exists($destination)){throw}
        }
    } finally {
        [IO.File]::Delete($temporary)
    }
}

foreach($file in @('garage-builds.json','graphics-settings.json','controls-settings.json','course-bests.json')){
    Import-MissingProfileFile $file
}
foreach($directory in @('Config','SaveGames')){
    $sourceDirectory=Join-Path $legacy $directory
    if(Test-Path -LiteralPath $sourceDirectory -PathType Container){
        foreach($file in Get-ChildItem -LiteralPath $sourceDirectory -File -Recurse -Force){
            Import-MissingProfileFile $file.FullName.Substring($legacy.Length+1)
        }
    }
}
[void][IO.Directory]::CreateDirectory($profile)
[IO.File]::Open($marker,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite).Dispose()
