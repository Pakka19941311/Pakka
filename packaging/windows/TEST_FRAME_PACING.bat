@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo После входа в нужную локацию нажмите F3, затем 60 секунд двигайтесь и вращайте камеру.
echo Результат появится в папке frame-pacing рядом с игрой.
"%~dp0runtime\node.exe" --experimental-strip-types --disable-warning=ExperimentalWarning "%~dp0launch-native.mjs" "--frame-pacing-dir=%~dp0frame-pacing"
if errorlevel 1 pause
