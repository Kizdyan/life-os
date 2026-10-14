param([string]$Distro = "Ubuntu", [string]$RepoPath = "")
$ErrorActionPreference = "Stop"

function Info([string]$Message) { Write-Host "[Life OS] $Message" -ForegroundColor Cyan }
function Warn([string]$Message) { Write-Host "[Life OS] $Message" -ForegroundColor Yellow }
function Is-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Is-Admin)) {
  Info "Restarting installer as Administrator..."
  $argList = @("-ExecutionPolicy","Bypass","-File",$PSCommandPath,"-Distro",$Distro)
  if ($RepoPath) { $argList += @("-RepoPath",$RepoPath) }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  exit 0
}

Info "Checking WSL..."
$distros = @((& wsl.exe -l -q 2>$null) -replace "`0","" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($distros -notcontains $Distro) {
  Info "Ubuntu is not registered yet. Installing it now."
  & wsl.exe --install -d $Distro
  Warn "If Windows asks for a reboot, reboot once and run the same installer again."
  exit 3010
}

Info "Ubuntu is registered. Updating WSL components when supported..."
cmd.exe /c "wsl.exe --update >nul 2>&1"

Info "Checking Ubuntu WSL version..."
$versionTable = ((& wsl.exe -l -v 2>$null) -replace "`0","")
$ubuntuLine = $versionTable | Where-Object { $_ -match [regex]::Escape($Distro) } | Select-Object -First 1
if ($ubuntuLine -and $ubuntuLine -match '\s+2\s*$') {
  Info "Ubuntu already uses WSL 2."
} else {
  Info "Switching Ubuntu to WSL 2..."
  & wsl.exe --set-version $Distro 2
  if ($LASTEXITCODE -ne 0) {
    Info "Enabling Windows features required by WSL 2..."
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
    Warn "Windows reboot is required once. Reboot, then run this installer again."
    exit 3010
  }
}

if (-not $RepoPath) { $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
$RepoPath = (Resolve-Path $RepoPath).Path
if ($RepoPath -notmatch '^[A-Za-z]:\\') { throw "RepoPath must be a normal Windows drive path, for example C:\Users\Kostya\LifeOS-Autonomous." }
$drive = $RepoPath.Substring(0,1).ToLowerInvariant()
$rest = $RepoPath.Substring(2) -replace '\\','/'
$wslRepo = "/mnt/$drive$rest"
Info "WSL repository path: $wslRepo"

$wslUserRaw = & wsl.exe -d $Distro -- id -un
$wslUser = if ($null -eq $wslUserRaw) { "" } else { (($wslUserRaw | Out-String).Trim()) }
if (-not $wslUser) { throw "Cannot determine the Ubuntu user." }
Info "WSL user: $wslUser"

Info "Enabling systemd in WSL..."
& wsl.exe -d $Distro -u root -- bash -lc "printf '[boot]\nsystemd=true\n' > /etc/wsl.conf"
if ($LASTEXITCODE -ne 0) { throw "Could not configure systemd in WSL." }
& wsl.exe --shutdown
Start-Sleep -Seconds 2

Info "Installing local dependencies..."
& wsl.exe -d $Distro -u root -- bash -lc 'apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 git curl nodejs npm bubblewrap gh >/dev/null'
if ($LASTEXITCODE -ne 0) { throw "Could not install WSL dependencies." }

Info "Checking GitHub authentication for the private repository..."
& wsl.exe -d $Distro -- bash -lc 'gh auth status -h github.com >/dev/null 2>&1'
if ($LASTEXITCODE -ne 0) {
  Info "One-time HUMAN_REQUIRED: complete the GitHub sign-in shown by gh."
  & wsl.exe -d $Distro -- gh auth login -h github.com -p https -w
  if ($LASTEXITCODE -ne 0) { throw "GitHub sign-in was not completed." }
}
& wsl.exe -d $Distro -- gh auth setup-git
if ($LASTEXITCODE -ne 0) { throw "Could not configure git to use GitHub authentication." }
& wsl.exe -d $Distro -- git config --global user.name "Life OS Supervisor"
& wsl.exe -d $Distro -- git config --global user.email "life-os-supervisor@localhost"

Info "Configuring Supervisor listener for the Windows localhost proxy..."
$configJsonPath="$wslRepo/tools/autonomous_supervisor/config.json"
& wsl.exe -d $Distro -- python3 -c "import json,sys; p=sys.argv[1]; d=json.load(open(p,encoding='utf-8')); d['bind_host']='0.0.0.0'; open(p,'w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')" $configJsonPath
if ($LASTEXITCODE -ne 0) { throw "Could not update Supervisor bind_host." }

$codexRaw = & wsl.exe -d $Distro -- bash -lc 'command -v codex || true'
$codexPath = if ($null -eq $codexRaw) { "" } else { (($codexRaw | Out-String).Trim()) }
if (-not $codexPath) {
  Info "Installing latest Codex CLI..."
  & wsl.exe -d $Distro -u root -- npm install -g @openai/codex@latest
  if ($LASTEXITCODE -ne 0) { throw "Codex CLI installation failed." }
}

Info "Checking Codex ChatGPT sign-in..."
& wsl.exe -d $Distro -- bash -lc 'codex login status >/dev/null 2>&1'
if ($LASTEXITCODE -ne 0) {
  Info "One-time HUMAN_REQUIRED: complete the ChatGPT sign-in shown by Codex."
  & wsl.exe -d $Distro -- codex login
  if ($LASTEXITCODE -ne 0) { throw "Codex ChatGPT sign-in was not completed." }
}

Info "Generating a local control token..."
$tokenRaw = & wsl.exe -d $Distro -- python3 -c "import secrets; print(secrets.token_urlsafe(32))"
$token = if ($null -eq $tokenRaw) { "" } else { (($tokenRaw | Out-String).Trim()) }
if (-not $token) { throw "Could not generate the local control token." }

Info "Installing Supervisor service and watchdog..."
$installScript = "$wslRepo/tools/autonomous_supervisor/install-wsl.sh"
$watchdogService = "$wslRepo/tools/autonomous_supervisor/life-os-supervisor-watchdog.service"
$watchdogTimer = "$wslRepo/tools/autonomous_supervisor/life-os-supervisor-watchdog.timer"
Info "Normalizing Linux runtime files to LF line endings..."
& wsl.exe -d $Distro -u root -- sed -i 's/$//' $installScript $watchdogService $watchdogTimer
if ($LASTEXITCODE -ne 0) { throw "Could not normalize Linux runtime files." }
& wsl.exe -d $Distro -- chmod +x $installScript
if ($LASTEXITCODE -ne 0) { throw "Could not make install-wsl.sh executable." }
& wsl.exe -d $Distro -u root -- env "SUPERVISOR_RUN_USER=$wslUser" "SUPERVISOR_CONTROL_TOKEN=$token" bash $installScript
if ($LASTEXITCODE -ne 0) { throw "Supervisor service installation failed." }

Info "Registering Windows autostart..."
$taskName = "Life OS Autonomous Supervisor"
$startScript = Join-Path $PSScriptRoot "start-windows.ps1"
$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Distro $Distro"
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Force | Out-Null

Info "Registering Windows bridge watchdog..."
$watchdogTaskName = "Life OS Supervisor Windows Watchdog"
$watchdogScript = Join-Path $PSScriptRoot "watchdog-windows.ps1"
$watchdogAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$watchdogScript`" -Distro $Distro"
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$watchdogPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $watchdogTaskName -Action $watchdogAction -Trigger $watchdogTrigger -Principal $watchdogPrincipal -Force | Out-Null

Info "Seeding the first autonomous Trust Closure job..."
$supervisorPy = "$wslRepo/tools/autonomous_supervisor/supervisor.py"
$configJson = "$wslRepo/tools/autonomous_supervisor/config.json"
$seedJson = "$wslRepo/tools/autonomous_supervisor/queue.seed.example.json"
& wsl.exe -d $Distro -- python3 $supervisorPy --config $configJson --seed $seedJson --seed-only
if ($LASTEXITCODE -ne 0) { throw "Could not seed the first Supervisor job." }

Info "Starting Supervisor now..."
& wsl.exe -d $Distro -u root -- systemctl restart life-os-supervisor.service
if ($LASTEXITCODE -ne 0) { throw "Could not start life-os-supervisor.service." }
& wsl.exe -d $Distro -u root -- systemctl restart life-os-supervisor-watchdog.timer
if ($LASTEXITCODE -ne 0) { throw "Could not start life-os-supervisor-watchdog.timer." }
Start-Sleep -Seconds 2
Info "Creating stable Windows localhost access..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-windows.ps1") -Distro $Distro
if ($LASTEXITCODE -ne 0) { throw "Could not expose Supervisor on Windows localhost." }

$status = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 5).Content
if (-not $status) { throw "Supervisor did not return a Windows health response." }

$tokenDir = Join-Path $env:LOCALAPPDATA "LifeOS"
New-Item -ItemType Directory -Force -Path $tokenDir | Out-Null
Set-Content -Path (Join-Path $tokenDir "supervisor-control-token.txt") -Value $token -Encoding ascii

Info "HEALTH: $status"
Info "Retrying any previously failed bootstrap job..."
try {
  Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/control" -Method Post -Headers @{"x-supervisor-token"=$token} -ContentType "application/json" -Body '{"action":"retry"}' -TimeoutSec 5 | Out-Null
} catch {
  Info "No retryable bootstrap job, or it was already resumed."
}
Info "Dashboard: http://127.0.0.1:8787"
Info "Installation complete. The next acceptance step is automatic restart/reboot recovery, then iPhone access."
