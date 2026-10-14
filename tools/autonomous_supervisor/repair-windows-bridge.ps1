param([string]$Distro="Ubuntu")
$ErrorActionPreference="Stop"
function Info([string]$m){ Write-Host "[Life OS] $m" -ForegroundColor Cyan }

$startScript=Join-Path $PSScriptRoot "start-windows.ps1"
$watchdogScript=Join-Path $PSScriptRoot "watchdog-windows.ps1"

Info "Repairing Windows -> WSL localhost bridge now..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript -Distro $Distro
if($LASTEXITCODE -ne 0){ throw "Immediate bridge repair failed." }

Info "Installing repeating Windows bridge watchdog..."
$taskName="Life OS Supervisor Windows Watchdog"
$action=New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$watchdogScript`" -Distro $Distro"
$trigger=New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal=New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

Start-Sleep -Seconds 1
$r=Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 5
Info ("HEALTH: " + ($r | ConvertTo-Json -Compress))
Info "Bridge watchdog installed. Dashboard: http://127.0.0.1:8787"
