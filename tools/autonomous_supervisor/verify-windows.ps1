param([string]$Distro="Ubuntu")
$ErrorActionPreference="Stop"
Write-Host "== Life OS Supervisor verification ==" -ForegroundColor Cyan
$status=wsl.exe -d $Distro -- bash -lc "curl -fsS http://127.0.0.1:8787/api/status"
Write-Host "Status: $status"
wsl.exe -d $Distro -- bash -lc "systemctl is-active life-os-supervisor.service"
wsl.exe -d $Distro -- bash -lc "systemctl is-active life-os-supervisor-watchdog.timer"
Get-ScheduledTask -TaskName "Life OS Autonomous Supervisor" | Select-Object TaskName,State
Write-Host "PASS requires fresh heartbeat + active service + active watchdog + startup task." -ForegroundColor Green
