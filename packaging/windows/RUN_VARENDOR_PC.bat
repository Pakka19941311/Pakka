@echo off
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0runtime\node.exe" --experimental-strip-types --disable-warning=ExperimentalWarning "%~dp0launch-native.mjs"
if errorlevel 1 pause
