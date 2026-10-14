param([string]$Distro="Ubuntu")
$ErrorActionPreference="Stop"
$startScript=Join-Path $PSScriptRoot "start-windows.ps1"

function Healthy {
  try {
    $r=Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 3
    return ($null -ne $r)
  } catch {
    return $false
  }
}

if(Healthy){ exit 0 }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript -Distro $Distro
if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }

Start-Sleep -Seconds 2
if(-not (Healthy)){ exit 2 }
exit 0
