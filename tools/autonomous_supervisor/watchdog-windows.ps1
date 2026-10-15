param(
  [string]$Distro = "Ubuntu",
  [int]$IntervalSeconds = 30
)
$ErrorActionPreference = "Stop"
$taskName = "Life OS Supervisor Windows Watchdog"
$logRoot = Join-Path $env:LOCALAPPDATA "LifeOS\logs"
$logPath = Join-Path $logRoot "watchdog.log"
$startScript = Join-Path $PSScriptRoot "start-windows.ps1"
$script:wslAnchor = $null
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

function Write-Log([string]$Message) {
  $line = "{0:o} {1}" -f (Get-Date), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Hide-Console {
  try {
    Add-Type -Namespace LifeOS -Name NativeWindow -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")]
public static extern System.IntPtr GetConsoleWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
'@ -ErrorAction SilentlyContinue
    $window = [LifeOS.NativeWindow]::GetConsoleWindow()
    if ($window -ne [IntPtr]::Zero) { [void][LifeOS.NativeWindow]::ShowWindow($window, 0) }
  } catch { Write-Log ("console_hide_failed " + $_.Exception.Message) }
}

function Ensure-PersistentTask {
  try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Distro $Distro"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Write-Log "persistent_hidden_task_configured"
  } catch {
    Write-Log ("task_reconfiguration_failed " + $_.Exception.Message)
  }
}

function Ensure-WslAnchor {
  if ($null -ne $script:wslAnchor -and -not $script:wslAnchor.HasExited) { return }
  try {
    $script:wslAnchor = Start-Process -FilePath "wsl.exe" -ArgumentList @("-d",$Distro,"--exec","/usr/bin/sleep","infinity") -WindowStyle Hidden -PassThru
    Write-Log ("wsl_anchor_started pid=" + $script:wslAnchor.Id)
    Start-Sleep -Seconds 2
  } catch {
    Write-Log ("wsl_anchor_failed " + $_.Exception.Message)
  }
}
function Healthy {
  try {
    $status = Invoke-RestMethod -UseBasicParsing -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 4
    return ($null -ne $status)
  } catch { return $false }
}

function Repair {
  try {
    & $startScript -Distro $Distro *> $null
    if ($LASTEXITCODE -ne 0) { throw "start-windows exit $LASTEXITCODE" }
    Write-Log "bridge_and_supervisor_repaired"
  } catch {
    Write-Log ("repair_failed " + $_.Exception.Message)
  }
}

Hide-Console
Ensure-PersistentTask
Write-Log ("watchdog_started pid=" + $PID)
while ($true) {
  Ensure-WslAnchor
  if (Healthy) {
    Write-Log "cycle healthy"
  } else {
    Write-Log "cycle unhealthy; repairing"
    Repair
  }
  Start-Sleep -Seconds ([Math]::Max(15, $IntervalSeconds))
}


