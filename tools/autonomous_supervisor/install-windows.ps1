param([string]$Distro = "Ubuntu", [string]$RepoPath = "")
$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "[Life OS] $m" -ForegroundColor Cyan }
function IsAdmin {
  $id=[Security.Principal.WindowsIdentity]::GetCurrent()
  $p=New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if(-not (IsAdmin)){
  Info "Restarting as Administrator..."
  $args=@("-ExecutionPolicy","Bypass","-File",$PSCommandPath,"-Distro",$Distro)
  if($RepoPath){ $args+=@("-RepoPath",$RepoPath) }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $args
  exit
}
Info "Checking WSL..."
& wsl.exe --status *> $null
if($LASTEXITCODE -ne 0){
  Info "Installing WSL + Ubuntu. Reboot Windows if requested, then run this installer again."
  & wsl.exe --install -d $Distro
  exit 3010
}
$distros = (& wsl.exe -l -q) -replace "`0","" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if($distros -notcontains $Distro){ & wsl.exe --install -d $Distro; exit 3010 }
if(-not $RepoPath){ $RepoPath=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
$wslRepo=(& wsl.exe -d $Distro -- wslpath -a "$RepoPath").Trim()
if(-not $wslRepo){ throw "Cannot translate repo path into WSL path." }
Info "Enabling systemd in WSL..."
& wsl.exe -d $Distro -- bash -lc "printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf >/dev/null"
& wsl.exe --shutdown
Start-Sleep -Seconds 2
Info "Checking local dependencies..."
& wsl.exe -d $Distro -- bash -lc "command -v python3 >/dev/null || (sudo apt-get update && sudo apt-get install -y python3); command -v git >/dev/null || (sudo apt-get update && sudo apt-get install -y git); command -v curl >/dev/null || (sudo apt-get update && sudo apt-get install -y curl)"
$codex = (& wsl.exe -d $Distro -- bash -lc "command -v codex || true").Trim()
if(-not $codex){ throw "Codex CLI is not installed inside WSL. Install/sign in locally with ChatGPT, then rerun this installer." }
Info "Generating local control token..."
$token=(& wsl.exe -d $Distro -- python3 -c "import secrets; print(secrets.token_urlsafe(32))").Trim()
if(-not $token){ throw "Could not create control token." }
Info "Installing Supervisor service..."
$cmd = "cd '$wslRepo/tools/autonomous_supervisor' && chmod +x install-wsl.sh && SUPERVISOR_CONTROL_TOKEN='$token' ./install-wsl.sh"
& wsl.exe -d $Distro -- bash -lc $cmd
Info "Registering Windows startup task..."
$action=New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d $Distro -- bash -lc `"systemctl start life-os-supervisor.service`""
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "Life OS Autonomous Supervisor" -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Info "Starting Supervisor now..."
& wsl.exe -d $Distro -- bash -lc "systemctl restart life-os-supervisor.service; systemctl restart life-os-supervisor-watchdog.timer"
Start-Sleep -Seconds 2
$status=& wsl.exe -d $Distro -- bash -lc "curl -fsS http://127.0.0.1:8787/api/status"
if(-not $status){ throw "Supervisor did not return a health response." }
$tokenDir=Join-Path $env:LOCALAPPDATA "LifeOS"
New-Item -ItemType Directory -Force -Path $tokenDir | Out-Null
Set-Content -Path (Join-Path $tokenDir "supervisor-control-token.txt") -Value $token -Encoding ascii
Info "HEALTH: $status"
Info "Dashboard: http://127.0.0.1:8787"
Info "Installed. Reboot once later to verify automatic startup."
