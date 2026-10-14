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

$wslUser = (& wsl.exe -d $Distro -- id -un).Trim()
if (-not $wslUser) { throw "Cannot determine the Ubuntu user." }
Info "WSL user: $wslUser"

Info "Enabling systemd in WSL..."
& wsl.exe -d $Distro -u root -- bash -lc "printf '[boot]\nsystemd=true\n' > /etc/wsl.conf"
if ($LASTEXITCODE -ne 0) { throw "Could not configure systemd in WSL." }
& wsl.exe --shutdown
Start-Sleep -Seconds 2

Info "Installing local dependencies..."
& wsl.exe -d $Distro -u root -- bash -lc 'apt-get update >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 git curl nodejs npm bubblewrap >/dev/null'
if ($LASTEXITCODE -ne 0) { throw "Could not install WSL dependencies." }

$codexPath = (& wsl.exe -d $Distro -- bash -lc 'command -v codex || true').Trim()
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
$token = (& wsl.exe -d $Distro -- python3 -c "import secrets; print(secrets.token_urlsafe(32))").Trim()
if (-not $token) { throw "Could not generate the local control token." }

Info "Installing Supervisor service and watchdog..."
$installScript = "$wslRepo/tools/autonomous_supervisor/install-wsl.sh"
& wsl.exe -d $Distro -- chmod +x $installScript
if ($LASTEXITCODE -ne 0) { throw "Could not make install-wsl.sh executable." }
& wsl.exe -d $Distro -u root -- env "SUPERVISOR_RUN_USER=$wslUser" "SUPERVISOR_CONTROL_TOKEN=$token" bash $installScript
if ($LASTEXITCODE -ne 0) { throw "Supervisor service installation failed." }

Info "Registering Windows autostart..."
$taskName = "Life OS Autonomous Supervisor"
$taskAction = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d $Distro -u root -- systemctl start life-os-supervisor.service"
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Force | Out-Null

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
Start-Sleep -Seconds 3

$status = & wsl.exe -d $Distro -- curl -fsS http://127.0.0.1:8787/api/status
if (-not $status) { throw "Supervisor did not return a health response." }

$tokenDir = Join-Path $env:LOCALAPPDATA "LifeOS"
New-Item -ItemType Directory -Force -Path $tokenDir | Out-Null
Set-Content -Path (Join-Path $tokenDir "supervisor-control-token.txt") -Value $token -Encoding ascii

Info "HEALTH: $status"
Info "Dashboard: http://127.0.0.1:8787"
Info "Installation complete. The next acceptance step is automatic restart/reboot recovery, then iPhone access."
