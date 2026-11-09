@echo off
powershell.exe -NoProfile -File "%~dp0tools\start-persona-windows.ps1"
if errorlevel 1 pause
