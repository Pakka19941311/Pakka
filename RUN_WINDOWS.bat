@echo off
setlocal
cd /d "%~dp0"
title Varendor - Ashen Frontier
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-and-run.ps1"
if errorlevel 1 pause
endlocal
