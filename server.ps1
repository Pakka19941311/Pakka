param([switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "dist"))
$port = 4173

if (-not (Test-Path $root -PathType Container)) {
    Write-Host "ERROR: dist folder not found. Run RUN_WINDOWS.bat first." -ForegroundColor Red
    exit 1
}

$server = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
$server.Start()
if (-not $NoBrowser) { Start-Process ("http://localhost:{0}/" -f $port) }
Write-Host ("Varendor is running at http://localhost:{0}/" -f $port) -ForegroundColor Yellow
Write-Host "Close this window or press Ctrl+C to stop the game server."

$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg";
  ".webp"="image/webp"; ".svg"="image/svg+xml";
  ".gltf"="model/gltf+json"; ".glb"="model/gltf-binary";
  ".ttf"="font/ttf"; ".woff"="font/woff"; ".woff2"="font/woff2";
  ".txt"="text/plain; charset=utf-8"; ".wasm"="application/wasm"
}

try {
  while ($true) {
    $client = $server.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $request = $reader.ReadLine()
      while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line.Length -eq 0) { break }
      }

      if ($request) {
        $parts = $request -split " "
        if ($parts.Length -ge 2) { $url = $parts[1] } else { $url = "/" }
      } else {
        $url = "/"
      }

      # Do not split on a regex here: a bad pattern can truncate every asset URL
      # and make JS/CSS requests fall back to index.html (a blank browser page).
      $queryIndex = $url.IndexOf('?')
      if ($queryIndex -ge 0) { $url = $url.Substring(0, $queryIndex) }
      $cleanUrl = $url.TrimStart([char]47)
      $path = [System.Uri]::UnescapeDataString($cleanUrl)
      if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }

      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ((-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) -or (-not (Test-Path $file -PathType Leaf))) {
        $file = Join-Path $root "index.html"
      }

      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $type = $mime[$ext] } else { $type = "application/octet-stream" }
      $header = "HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
      $head = [Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($head, 0, $head.Length)
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush()
    }
    catch {
      Write-Host ("Request error: {0}" -f $_.Exception.Message) -ForegroundColor DarkRed
    }
    finally {
      if ($client) { $client.Close() }
    }
  }
}
finally {
  $server.Stop()
}
