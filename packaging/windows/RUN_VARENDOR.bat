@echo off
setlocal
cd /d "%~dp0"
title Varendor B01 Performance Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 pause
endlocal
