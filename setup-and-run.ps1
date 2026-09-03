$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = $PSScriptRoot
$tools = Join-Path $root ".tools"
$nodeExe = $null
$npmCmd = $null
$depsMarker = Join-Path $root ".varendor-deps-ok"

function Find-CompatibleSystemNode {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) { return $null }

    try {
        $versionText = (& $node.Source -p "process.versions.node").Trim()
        $version = [Version]$versionText
        if ($version.Major -ge 22 -or ($version.Major -eq 20 -and $version.Minor -ge 19)) {
            return @($node.Source, $npm.Source)
        }
        Write-Host ("Installed Node.js {0} is too old for this build. A portable LTS copy will be used." -f $versionText) -ForegroundColor Yellow
    } catch { }
    return $null
}

function Install-PortableNode {
    if (-not (Test-Path $tools)) { New-Item -ItemType Directory -Path $tools | Out-Null }

    Write-Host "Preparing portable Node.js..." -ForegroundColor Yellow
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
    $release = $index | Where-Object { $_.lts -and ($_.files -contains "win-x64-zip") } | Select-Object -First 1
    if (-not $release) { throw "Could not find a compatible Node.js LTS release." }

    $version = $release.version
    $folderName = "node-$version-win-x64"
    $nodeFolder = Join-Path $tools $folderName
    $zipPath = Join-Path $tools "$folderName.zip"

    if (-not (Test-Path (Join-Path $nodeFolder "node.exe"))) {
        $url = "https://nodejs.org/dist/$version/$folderName.zip"
        Write-Host ("Downloading Node.js {0}. This happens only once..." -f $version) -ForegroundColor Yellow
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
        if (Test-Path $nodeFolder) { Remove-Item $nodeFolder -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $tools -Force
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    }

    return @((Join-Path $nodeFolder "node.exe"), (Join-Path $nodeFolder "npm.cmd"))
}

function Wait-ForLocalServer {
    param(
        [Parameter(Mandatory=$true)]$Process,
        [int]$Port = 4173,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) {
            throw "The local game server stopped before it became ready (exit code $($Process.ExitCode))."
        }

        $client = $null
        try {
            $client = New-Object Net.Sockets.TcpClient
            $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne(300)) {
                $client.EndConnect($async)
                $client.Close()
                return
            }
        } catch {
        } finally {
            if ($client) { $client.Close() }
        }
        Start-Sleep -Milliseconds 200
    }

    throw "The local game server did not start on port $Port within $TimeoutSeconds seconds."
}

try {
    Set-Location $root
    $systemNode = Find-CompatibleSystemNode
    if ($systemNode) {
        $nodeExe = $systemNode[0]
        $npmCmd = $systemNode[1]
        Write-Host "Using installed Node.js." -ForegroundColor DarkGray
    } else {
        $portable = Install-PortableNode
        $nodeExe = $portable[0]
        $npmCmd = $portable[1]
    }

    # npm lifecycle scripts (including esbuild install.js) call `node` by name.
    # When using portable Node, its directory must be on PATH for child processes.
    $nodeDir = Split-Path -Parent $nodeExe
    $env:PATH = "$nodeDir;$env:PATH"

    # This is a standalone project, not an npm workspace. Some PCs have a global
    # npm workspace setting in user .npmrc/environment, which makes `npm ci` fail
    # with "No workspaces found!". Force standalone mode for every launcher run.
    $env:npm_config_workspaces = "false"
    Remove-Item Env:npm_config_workspace -ErrorAction SilentlyContinue

    # A failed npm ci can leave a partial node_modules directory. Only trust our marker.
    if (-not (Test-Path $depsMarker)) {
        if (Test-Path (Join-Path $root "node_modules")) {
            Write-Host "Removing incomplete dependency installation from a previous attempt..." -ForegroundColor Yellow
            Remove-Item (Join-Path $root "node_modules") -Recurse -Force
        }
        Write-Host "Installing game dependencies. This is only needed the first successful time..." -ForegroundColor Yellow
        & $npmCmd ci --workspaces=false
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
        New-Item -ItemType File -Path $depsMarker -Force | Out-Null
    }

    Write-Host "Building Varendor..." -ForegroundColor Yellow
    & $npmCmd run build --workspaces=false
    if ($LASTEXITCODE -ne 0) { throw "Game build failed with exit code $LASTEXITCODE" }

    if (-not (Test-Path (Join-Path $root "dist\index.html"))) {
        throw "Build completed but dist\index.html was not created."
    }

    # Use Vite's own production preview server instead of the old custom PowerShell HTTP server.
    # Modern browsers may cancel speculative requests; Vite handles those disconnects correctly.
    Write-Host "Build complete. Starting game server..." -ForegroundColor Green
    $previewArgs = @("run", "preview", "--workspaces=false", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort")
    $preview = Start-Process -FilePath $npmCmd -ArgumentList $previewArgs -NoNewWindow -PassThru

    Wait-ForLocalServer -Process $preview -Port 4173 -TimeoutSeconds 20

    $gameUrl = "http://localhost:4173/"
    Write-Host ("Varendor is running at {0}" -f $gameUrl) -ForegroundColor Green
    Write-Host "Keep this window open while playing. Close it or press Ctrl+C to stop the server." -ForegroundColor DarkGray
    Start-Process $gameUrl

    Wait-Process -Id $preview.Id
}
catch {
    Write-Host ""
    Write-Host "VARENDOR START FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Take a screenshot of this window and send it to ChatGPT." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
}
