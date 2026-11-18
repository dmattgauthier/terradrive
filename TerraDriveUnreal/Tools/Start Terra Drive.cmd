@echo off
setlocal
for %%I in ("%~dp0..\PlayerData") do set "profile=%%~fI"
if not exist "%profile%\Temp" mkdir "%profile%\Temp"
if not exist "%profile%\AppData\Local" mkdir "%profile%\AppData\Local"
if not exist "%profile%\AppData\Roaming" mkdir "%profile%\AppData\Roaming"
if not exist "%profile%\Temp" exit /b 1
if not exist "%profile%\AppData\Local" exit /b 1
if not exist "%profile%\AppData\Roaming" exit /b 1
set "TEMP=%profile%\Temp"
set "TMP=%TEMP%"
set "LOCALAPPDATA=%profile%\AppData\Local"
set "APPDATA=%profile%\AppData\Roaming"
pushd "%~dp0"
start "" "%~dp0TerraDrive\Binaries\Win64\TerraDrive.exe" -UserDir="%profile%" -NoTrace
set "status=%ERRORLEVEL%"
popd
exit /b %status%
