@echo off
setlocal
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
cl /nologo /EHsc /std:c++17 /O2 /Fo"%~dp0..\Saved\test-center.obj" /Fe"%~dp0..\Saved\test-center.exe" "%~dp0test-center.cpp"
if errorlevel 1 exit /b 1
"%~dp0..\Saved\test-center.exe"
