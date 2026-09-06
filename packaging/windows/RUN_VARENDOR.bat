@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
title Varendor World Server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 pause
endlocal
