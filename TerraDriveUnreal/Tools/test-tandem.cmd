@echo off
setlocal
if not exist "%~dp0..\Saved" mkdir "%~dp0..\Saved"
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
cl /nologo /EHsc /std:c++17 /W4 /O2 /Fo"%~dp0..\Saved\test-tandem.obj" /Fe"%~dp0..\Saved\test-tandem.exe" "%~dp0test-tandem.cpp"
if errorlevel 1 exit /b 1
"%~dp0..\Saved\test-tandem.exe"
