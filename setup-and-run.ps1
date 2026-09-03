$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = $PSScriptRoot
$tools = Join-Path $root ".tools"
$nodeExe = $null
$npmCmd = $null

function Find-SystemNode {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($node -and $npm) {
        return @($node.Source, $npm.Source)
    }
    return $null
}

function Install-PortableNode {
    if (-not (Test-Path $tools)) { New-Item -ItemType Directory -Path $tools | Out-Null }

    Write-Host "Node.js is not installed. Preparing a portable copy..." -ForegroundColor Yellow
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
    $release = $index | Where-Object { $_.lts -and ($_.files -contains "win-x64-zip") } | Select-Object -First 1
    if (-not $release) { throw "Could not find a compatible Node.js LTS release." }

    $version = $release.version
    $folderName = "node-$version-win-x64"
    $nodeFolder = Join-Path $tools $folderName
    $zipPath = Join-Path $tools "$folderName.zip"

    if (-not (Test-Path (Join-Path $nodeFolder "node.exe"))) {
        $url = "https://nodejs.org/dist/$version/$folderName.zip"
        Write-Host ("Downloading Node.js {0}..." -f $version) -ForegroundColor Yellow
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
        if (Test-Path $nodeFolder) { Remove-Item $nodeFolder -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $tools -Force
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    }

    return @((Join-Path $nodeFolder "node.exe"), (Join-Path $nodeFolder "npm.cmd"))
}

try {
    Set-Location $root
    $systemNode = Find-SystemNode
    if ($systemNode) {
        $nodeExe = $systemNode[0]
        $npmCmd = $systemNode[1]
        Write-Host "Using installed Node.js." -ForegroundColor DarkGray
    } else {
        $portable = Install-PortableNode
        $nodeExe = $portable[0]
        $npmCmd = $portable[1]
    }

    if (-not (Test-Path (Join-Path $root "node_modules"))) {
        Write-Host "Installing game dependencies. This is only needed the first time..." -ForegroundColor Yellow
        & $npmCmd ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    }

    Write-Host "Building Varendor..." -ForegroundColor Yellow
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) { throw "Game build failed with exit code $LASTEXITCODE" }

    if (-not (Test-Path (Join-Path $root "dist\index.html"))) {
        throw "Build completed but dist\index.html was not created."
    }

    Write-Host "Build complete. Starting game..." -ForegroundColor Green
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "server.ps1")
}
catch {
    Write-Host "" 
    Write-Host "VAR ΕNDOR START FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Take a screenshot of this window and send it to ChatGPT." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
}
