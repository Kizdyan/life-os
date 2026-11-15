@echo off
setlocal
cd /d "%~dp0"
set "PERSONA_NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 (
  set "PERSONA_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  for /d %%D in ("%USERPROFILE%\Tools\node-v*-win-x64") do if exist "%%~fD\node.exe" set "PERSONA_NODE=%%~fD\node.exe"
)
"%PERSONA_NODE%" tools\start-persona.mjs
if errorlevel 1 (
  echo Persona could not start. See the message above.
  pause
  exit /b 1
)
