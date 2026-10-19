param([string]$Distro="Ubuntu")
$ErrorActionPreference="Stop"
function Info([string]$m){ Write-Host "[Life OS] $m" -ForegroundColor Cyan }

$tokenFile=Join-Path $env:LOCALAPPDATA "LifeOS\supervisor-control-token.txt"
if(-not (Test-Path $tokenFile)){ throw "Local Supervisor control token not found. Run install-windows.ps1 once." }
$token=(Get-Content $tokenFile -Raw).Trim()
if(-not $token){ throw "Local Supervisor control token is empty." }

Info "Verifying GitHub authentication for autonomous git..."
& wsl.exe -d $Distro -- gh auth status -h github.com
if($LASTEXITCODE -ne 0){ throw "GitHub CLI is not authenticated in WSL." }
& wsl.exe -d $Distro -- gh auth setup-git
if($LASTEXITCODE -ne 0){ throw "Could not configure gh as git credential helper." }

Info "Repairing TRUST-001 bootstrap base to an already-local branch..."
& wsl.exe -d $Distro -- python3 -c "import json,sqlite3,os; p=os.path.expanduser('~/.life-os-supervisor/supervisor.db'); c=sqlite3.connect(p); r=c.execute('select payload from jobs where id=?',('TRUST-001',)).fetchone(); d=json.loads(r[0]) if r else None; d and d.update({'base_ref':'feature/autonomous-supervisor-runtime-v1'}); r and c.execute('update jobs set payload=?, state=?, not_before=NULL, last_error=NULL where id=?',(json.dumps(d,ensure_ascii=False,separators=(',',':')),'QUEUED','TRUST-001')); c.commit(); c.close()"
if($LASTEXITCODE -ne 0){ throw "Could not repair TRUST-001 bootstrap state." }

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
