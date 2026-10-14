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

Info "Checking Supervisor directly inside WSL at $wslIp..."
$directOk=$false
for($i=0;$i -lt 10;$i++){
  try{
    $null=Invoke-RestMethod -UseBasicParsing -Uri ("http://"+$wslIp+":8787/api/status") -TimeoutSec 3
    $directOk=$true
    break
  }catch{
    Start-Sleep -Seconds 1
  }
}
if(-not $directOk){
  & wsl.exe -d $Distro -u root -- systemctl --no-pager --full status life-os-supervisor.service
  throw ("Supervisor service is not reachable on WSL network address "+$wslIp+":8787.")
}

Info "Ensuring Windows IP Helper is running..."
Set-Service -Name iphlpsvc -StartupType Automatic
Start-Service -Name iphlpsvc -ErrorAction SilentlyContinue

Info "Refreshing Windows localhost proxy to WSL $wslIp..."
cmd.exe /c "netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=8787 >nul 2>&1"
cmd.exe /c ("netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8787 connectaddress="+$wslIp+" connectport=8787")
if($LASTEXITCODE -ne 0){ throw "Could not create Windows localhost proxy." }

$healthy=$false
for($i=0;$i -lt 10;$i++){
  try{
    $status=Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 3
    $healthy=$true
    break
  }catch{
    Start-Sleep -Seconds 1
  }
}
if(-not $healthy){
  Info "Current portproxy table:"
  cmd.exe /c "netsh interface portproxy show v4tov4"
  throw ("Windows localhost proxy is still not reachable. Direct WSL URL is http://"+$wslIp+":8787")
}
Info ("HEALTH: " + ($status | ConvertTo-Json -Compress))
Info "Dashboard: http://127.0.0.1:8787"
Info ("Direct fallback: http://"+$wslIp+":8787")
