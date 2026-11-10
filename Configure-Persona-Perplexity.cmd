@echo off
setlocal
powershell.exe -NoProfile -File "%~dp0tools\configure-persona-perplexity.ps1"
if errorlevel 1 echo Perplexity setup or live test failed. See the message above.
pause
