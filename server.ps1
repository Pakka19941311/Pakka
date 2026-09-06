param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$node = Join-Path $root 'runtime\node.exe'
$entry = Join-Path $root 'server\launch-world.mjs'
if (-not (Test-Path $node -PathType Leaf) -or -not (Test-Path $entry -PathType Leaf)) {
    Write-Host 'The complete Windows test ZIP must be extracted before launch.' -ForegroundColor Red
    Write-Host 'Portable Node and server files are missing. No Node installation is needed.'
    exit 1
}
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$launchArgs = @('--experimental-strip-types', $entry)
if ($NoBrowser) { $launchArgs += '--no-browser' }
& $node @launchArgs
exit $LASTEXITCODE
