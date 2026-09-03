$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "dist"))
$port = 4173
$server = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
$server.Start()
Start-Process "http://localhost:$port/"
Write-Host "Varendor запущен: http://localhost:$port/" -ForegroundColor Yellow
Write-Host "Для остановки закройте окно или нажмите Ctrl+C."
$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg";
  ".gltf"="model/gltf+json"; ".glb"="model/gltf-binary";
  ".ttf"="font/ttf"; ".txt"="text/plain; charset=utf-8"
}
try {
  while ($true) {
    $client = $server.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $request = $reader.ReadLine()
      while (($line = $reader.ReadLine()) -ne "" -and $null -ne $line) { }
      $url = if ($request) { ($request -split " ")[1] } else { "/" }
      $url = ($url -split "\?")[0]
      $path = [Uri]::UnescapeDataString($url.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) { $file = Join-Path $root "index.html" }
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $header = "HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
      $head = [Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($head,0,$head.Length); $stream.Write($bytes,0,$bytes.Length); $stream.Flush()
    } catch { Write-Host "Ошибка запроса: $($_.Exception.Message)" -ForegroundColor DarkRed }
    finally { $client.Close() }
  }
} finally { $server.Stop() }
