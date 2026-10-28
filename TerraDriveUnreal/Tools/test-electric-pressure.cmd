@echo off
setlocal
if not exist "%~dp0..\Saved" mkdir "%~dp0..\Saved"
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
cl /nologo /EHsc /std:c++17 /W4 /O2 /Fo"%~dp0..\Saved\test-electric-pressure.obj" /Fe"%~dp0..\Saved\test-electric-pressure.exe" "%~dp0test-electric-pressure.cpp"
if errorlevel 1 exit /b 1
"%~dp0..\Saved\test-electric-pressure.exe"
