@echo off
setlocal
if not exist "%~dp0..\Saved" mkdir "%~dp0..\Saved"
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
cl /nologo /EHsc /std:c++17 /W4 /O2 /Fo"%~dp0..\Saved\test-ground-grid.obj" /Fe"%~dp0..\Saved\test-ground-grid.exe" "%~dp0test-ground-grid.cpp"
if errorlevel 1 exit /b 1
"%~dp0..\Saved\test-ground-grid.exe" "%~dp0..\Content\NativeData\terrain.bin" "%~dp0..\Saved\rock-garden-grid-report.json" "%~dp0..\Content\NativeData\garden-geology.bin"
