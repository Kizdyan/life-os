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
$distros = @((& wsl.exe -l -q 2>$null) -replace "`0","" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if($distros -notcontains $Distro){
  Info "Ubuntu is not registered yet. Installing WSL + Ubuntu. Reboot Windows if requested, then run this installer again."
  & wsl.exe --install -d $Distro
  exit 3010
}
Info "Ubuntu is registered. Updating WSL components when supported..."
cmd.exe /c "wsl.exe --update >nul 2>&1"
Info "Checking Ubuntu WSL version..."
$versionTable = (& wsl.exe -l -v 2>$null) -replace "`0",""
$ubuntuLine = $versionTable | Where-Object { $_ -match [regex]::Escape($Distro) } | Select-Object -First 1
if($ubuntuLine -and $ubuntuLine -match "\\s2\\s*$"){
  Info "Ubuntu already uses WSL 2."
} else {
  Info "Switching Ubuntu to WSL 2..."
  cmd.exe /c "wsl.exe --set-version $Distro 2"
  if($LASTEXITCODE -ne 0){
    Info "Enabling required Windows features for WSL 2..."
    dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
    dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
    Write-Host "[Life OS] Windows reboot is required once. Reboot, then run this installer again." -ForegroundColor Yellow
    exit 3010
  }
}
if(-not $RepoPath){ $RepoPath=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
$wslRepo=(& wsl.exe -d $Distro -- wslpath -u "$RepoPath").Trim()
if(-not $wslRepo){ throw "Cannot translate repo path into WSL path." }
Info "Enabling systemd in WSL..."
& wsl.exe -d $Distro -- bash -lc "printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf >/dev/null"
& wsl.exe --shutdown
Start-Sleep -Seconds 2
Info "Checking local dependencies..."
& wsl.exe -d $Distro -- bash -lc "command -v python3 >/dev/null || (sudo apt-get update && sudo apt-get install -y python3); command -v git >/dev/null || (sudo apt-get update && sudo apt-get install -y git); command -v curl >/dev/null || (sudo apt-get update && sudo apt-get install -y curl); command -v npm >/dev/null || (sudo apt-get update && sudo apt-get install -y nodejs npm); command -v bwrap >/dev/null || (sudo apt-get update && sudo apt-get install -y bubblewrap)"
$codex = (& wsl.exe -d $Distro -- bash -lc "command -v codex || true").Trim()
if(-not $codex){
  Info "Installing latest Codex CLI..."
  & wsl.exe -d $Distro -- bash -lc "sudo npm install -g @openai/codex@latest"
}
Info "Checking Codex ChatGPT sign-in..."
& wsl.exe -d $Distro -- bash -lc "codex login status" *> $null
if($LASTEXITCODE -ne 0){
  Info "One-time HUMAN_REQUIRED: complete the ChatGPT sign-in window opened by Codex."
  & wsl.exe -d $Distro -- bash -lc "codex login"
  if($LASTEXITCODE -ne 0){ throw "Codex ChatGPT sign-in was not completed." }
}
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
Info "Seeding the first autonomous Trust Closure job..."
& wsl.exe -d $Distro -- bash -lc "cd '$wslRepo/tools/autonomous_supervisor' && python3 supervisor.py --config config.json --seed queue.seed.example.json --seed-only"
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
