param([string]$Distro="Ubuntu")
$ErrorActionPreference="Stop"
function Info([string]$m){ Write-Host "[Life OS] $m" -ForegroundColor Cyan }

Info "Starting WSL Supervisor..."
& wsl.exe -d $Distro -u root -- systemctl start life-os-supervisor.service
if($LASTEXITCODE -ne 0){ throw "Could not start life-os-supervisor.service" }
& wsl.exe -d $Distro -u root -- systemctl start life-os-supervisor-watchdog.timer
if($LASTEXITCODE -ne 0){ throw "Could not start life-os-supervisor-watchdog.timer" }

$ipRaw=& wsl.exe -d $Distro -- hostname -I
$wslIp=(($ipRaw | Out-String).Trim().Split(" ") | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
if(-not $wslIp){ throw "Could not determine WSL IPv4 address." }

Info "Refreshing Windows localhost proxy to WSL $wslIp..."
cmd.exe /c "netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=8787 >nul 2>&1"
cmd.exe /c "netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8787 connectaddress=$wslIp connectport=8787"
if($LASTEXITCODE -ne 0){ throw "Could not create Windows localhost proxy." }

Start-Sleep -Seconds 1
try{
  $status=Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 5
  Info ("HEALTH: " + ($status | ConvertTo-Json -Compress))
}catch{
  throw "Supervisor is running in WSL but Windows localhost proxy is not reachable: $($_.Exception.Message)"
}
