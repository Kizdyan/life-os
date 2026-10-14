param([string]$Distro="Ubuntu")
$ErrorActionPreference="Stop"
function Info([string]$m){ Write-Host "[Life OS] $m" -ForegroundColor Cyan }

$tokenFile=Join-Path $env:LOCALAPPDATA "LifeOS\supervisor-control-token.txt"
if(-not (Test-Path $tokenFile)){ throw "Local Supervisor control token not found. Run install-windows.ps1 once." }
$token=(Get-Content $tokenFile -Raw).Trim()
if(-not $token){ throw "Local Supervisor control token is empty." }

Info "Restarting Supervisor with the latest code..."
& wsl.exe -d $Distro -u root -- systemctl restart life-os-supervisor.service
if($LASTEXITCODE -ne 0){ throw "Could not restart Supervisor." }
Start-Sleep -Seconds 2

Info "Refreshing Windows localhost bridge..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-windows.ps1") -Distro $Distro
if($LASTEXITCODE -ne 0){ throw "Could not refresh Windows bridge." }

Info "Retrying the failed bootstrap job..."
try {
  $r=Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/control" -Method Post -Headers @{"x-supervisor-token"=$token} -ContentType "application/json" -Body '{"action":"retry"}' -TimeoutSec 5
  Info ("RETRY: "+$r.message)
} catch {
  Info ("Retry request returned: "+$_.Exception.Message)
}
Start-Sleep -Seconds 4
$s=Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 5
Info ("HEALTH: "+($s|ConvertTo-Json -Compress))
Info "Open http://127.0.0.1:8787 and refresh. Expected next state: PREPARING or CODING."
