@echo off
setlocal
cd /d "%~dp0"
title Varendor v0.5 Core Quality Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 pause
endlocal
