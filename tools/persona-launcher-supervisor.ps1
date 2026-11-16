# Windows-only Persona launcher supervisor, called by START_AUTO_RENDER.bat.
param([Parameter(Mandatory=$true)][string]$RepoRoot,[switch]$SelfTest)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$RepoRoot=(Resolve-Path -LiteralPath $RepoRoot).Path
if(-not(Test-Path (Join-Path $RepoRoot 'package.json')) -or -not(Test-Path (Join-Path $RepoRoot 'tools\persona-media-worker.mjs'))){throw 'Life OS project root not found'}

$native=@'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.IO;
namespace PersonaLauncher {
 public sealed class OwnedProcesses : IDisposable {
  IntPtr handle;
  const uint KILL=0x2000, SUSPENDED=0x4, NO_WINDOW=0x08000000;
  [StructLayout(LayoutKind.Sequential)] struct Limits { public long t1,t2; public uint flags; public UIntPtr w1,w2; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct Io { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct Extended { public Limits basic; public Io io; public UIntPtr p1,p2,p3,p4; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {
   public int cb; public string reserved,desktop,title; public int x,y,sx,sy,cx,cy,fill,flags; public short show,cbReserved; public IntPtr bytes,stdin,stdout,stderr;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public int pid,tid;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr p,string n);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr h,int c,IntPtr p,uint s);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string a,StringBuilder b,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref Startup startup,out ProcessInfo proc);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr proc,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  static Exception Error(string message){return new Win32Exception(Marshal.GetLastWin32Error(),message);}
  public OwnedProcesses(){
   handle=CreateJobObject(IntPtr.Zero,null);if(handle==IntPtr.Zero)throw Error("Cannot create process group");
   var info=new Extended();info.basic.flags=KILL;int size=Marshal.SizeOf(typeof(Extended));IntPtr ptr=Marshal.AllocHGlobal(size);
   try{Marshal.StructureToPtr(info,ptr,false);if(!SetInformationJobObject(handle,9,ptr,(uint)size))throw Error("Cannot enable kill-on-close policy");}
   catch{CloseHandle(handle);handle=IntPtr.Zero;throw;}finally{Marshal.FreeHGlobal(ptr);}
  }
  public int Start(string wrapper,string cwd){
   if(handle==IntPtr.Zero)throw new ObjectDisposedException("OwnedProcesses");
   if(!File.Exists(wrapper))throw new FileNotFoundException("Missing launcher wrapper",wrapper);
   string cmd=Environment.GetEnvironmentVariable("ComSpec");if(String.IsNullOrWhiteSpace(cmd))cmd=Path.Combine(Environment.SystemDirectory,"cmd.exe");
   var si=new Startup();si.cb=Marshal.SizeOf(typeof(Startup));si.flags=1;si.show=0;
   var command=new StringBuilder("\""+cmd+"\" /d /s /c \"\""+wrapper+"\"\"");ProcessInfo pi;
   if(!CreateProcess(cmd,command,IntPtr.Zero,IntPtr.Zero,false,SUSPENDED|NO_WINDOW,IntPtr.Zero,cwd,ref si,out pi))throw Error("Cannot start hidden service");
   try{
    if(!AssignProcessToJobObject(handle,pi.process))throw Error("Cannot attach service to process group");
    if(ResumeThread(pi.thread)==uint.MaxValue)throw Error("Cannot resume service");
    return pi.pid;
   }catch{TerminateProcess(pi.process,1);throw;}
   finally{CloseHandle(pi.thread);CloseHandle(pi.process);}
  }
  public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
  ~OwnedProcesses(){Dispose();}
 }
}
'@
Add-Type -TypeDefinition $native -Language CSharp -ErrorAction Stop
function Write-Wrapper([string]$Path,[string]$Command,[string]$Log){
 if($RepoRoot.Contains('"') -or $Log.Contains('"')){throw 'Unsupported quote in project path'}
 $lines=@('@echo off','chcp 65001 >nul',('cd /d "'+$RepoRoot+'"'),($Command+' 1>>"'+$Log+'" 2>&1'),'exit /b %errorlevel%')
 [IO.File]::WriteAllText($Path,($lines -join [Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
}
function Is-Alive([int]$ProcessId){
 try{$p=[Diagnostics.Process]::GetProcessById($ProcessId);try{return -not $p.HasExited}finally{$p.Dispose()}}catch{return $false}
}
function Port-Busy([int]$Port){
 $socket=New-Object Net.Sockets.TcpClient
 try{$task=$socket.ConnectAsync('127.0.0.1',$Port);return ($task.Wait(350) -and $socket.Connected)}catch{return $false}finally{$socket.Dispose()}
}
function Url-Ready([string]$Address,[string]$Service){
 try{$req=[Net.HttpWebRequest][Net.WebRequest]::Create($Address);$req.Timeout=900;$req.Proxy=$null;$req.KeepAlive=$false;$response=$req.GetResponse()
  try{if([int]$response.StatusCode -ne 200){return $false};if($Service){$reader=New-Object IO.StreamReader($response.GetResponseStream());try{return (ConvertFrom-Json $reader.ReadToEnd()).service -eq $Service}finally{$reader.Dispose()}};return $true}
  finally{$response.Dispose()}
 }catch{return $false}
}

# Check only presence, never log or expose the key. Actual provider checks are in Worker.
function Has-OpenRouterKey {
 if(-not [string]::IsNullOrWhiteSpace($env:OPENROUTER_API_KEY)){return $true}
 $dotenv=Join-Path $RepoRoot '.env.local'
 if(-not(Test-Path -LiteralPath $dotenv -PathType Leaf)){return $false}
 foreach($line in [IO.File]::ReadAllLines($dotenv,[Text.Encoding]::UTF8)){
  if($line -match '^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$'){
   $value=$Matches[1].Trim().Trim('"',"'")
   return $value.Length -gt 4 -and -not $value.StartsWith('#')
  }
 }
 return $false
}
function Lock-Hash {
 $lock=Join-Path $RepoRoot 'package-lock.json'
 if(-not(Test-Path -LiteralPath $lock -PathType Leaf)){throw 'Не найден package-lock.json. Невозможно безопасно установить зависимости.'}
 return (Get-FileHash -LiteralPath $lock -Algorithm SHA256).Hash
}

if($SelfTest){
 $dir=Join-Path $env:TEMP ('persona-launcher-test-'+[Guid]::NewGuid().ToString('N'));[void](New-Item -Path $dir -ItemType Directory)
 $job=$null
 try{
  $marker=Join-Path $dir 'child.pid';$wrapper=Join-Path $dir 'check.cmd'
  $code="require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)"
  Write-Wrapper $wrapper ('node -e "'+$code+'" "'+$marker+'"') (Join-Path $dir 'test.log')
  $job=New-Object PersonaLauncher.OwnedProcesses
  $parentId=$job.Start($wrapper,$RepoRoot);$clock=[Diagnostics.Stopwatch]::StartNew()
  while(-not(Test-Path $marker) -and $clock.Elapsed.TotalSeconds -lt 12){Start-Sleep -Milliseconds 100}
  if(-not(Test-Path $marker)){throw 'Node descendant never started'}
  $childId=[int]([IO.File]::ReadAllText($marker).Trim())
  if(-not(Is-Alive $parentId) -or -not(Is-Alive $childId)){throw 'Process group did not start'}
  $job.Dispose();$job=$null;Start-Sleep -Milliseconds 750
  if((Is-Alive $parentId) -or (Is-Alive $childId)){throw 'Job close leaked a process'}
  Write-Output 'PASS: closing Persona launcher terminates hidden command and its Node child.'
 }finally{if($job){$job.Dispose()};Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue};exit 0
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$session=Join-Path $env:LOCALAPPDATA ('LifeOS\Persona\launcher\session-'+[Guid]::NewGuid().ToString('N'))
[void](New-Item -Path $session -ItemType Directory -Force)
$workerLog=Join-Path $session 'worker.log';$webLog=Join-Path $session 'web.log';$installLog=Join-Path $session 'install.log'
$installStamp=Join-Path (Split-Path $session -Parent) 'installed-package-lock-sha256.txt'
$installSucceeded=Join-Path $session 'install-succeeded.txt'
$form=New-Object Windows.Forms.Form
$form.Text='Persona — быстрый автомонтаж';$form.StartPosition='CenterScreen';$form.ClientSize=New-Object Drawing.Size(460,200)
$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.BackColor=[Drawing.Color]::FromArgb(247,244,238)
$form.Font=New-Object Drawing.Font('Segoe UI',10)
$heading=New-Object Windows.Forms.Label
$heading.Text='PERSONA  /  АВТОМОНТАЖ';$heading.Font=New-Object Drawing.Font('Segoe UI',13,[Drawing.FontStyle]::Bold)
$heading.Location=New-Object Drawing.Point(20,18);$heading.Size=New-Object Drawing.Size(420,30);$form.Controls.Add($heading)
$status=New-Object Windows.Forms.Label
$status.Text='Подготавливаю запуск...';$status.Location=New-Object Drawing.Point(20,62);$status.Size=New-Object Drawing.Size(420,55);$form.Controls.Add($status)
$open=New-Object Windows.Forms.Button
$open.Text='Открыть Persona';$open.Location=New-Object Drawing.Point(20,132);$open.Size=New-Object Drawing.Size(160,40);$open.Enabled=$false;$form.Controls.Add($open)
$stop=New-Object Windows.Forms.Button
$stop.Text='Завершить работу';$stop.Location=New-Object Drawing.Point(190,132);$stop.Size=New-Object Drawing.Size(150,40);$form.Controls.Add($stop)
$logs=New-Object Windows.Forms.Button
$logs.Text='Журнал';$logs.Location=New-Object Drawing.Point(350,132);$logs.Size=New-Object Drawing.Size(90,40);$form.Controls.Add($logs)
$state=@{phase='init';job=$null;workerId=0;webId=0;installId=0;began=[DateTime]::MinValue;browser=$false;lockHash=''}
function Fail-Launch([string]$Message){
 $state.phase='failed';$status.Text=$Message+[Environment]::NewLine+'Подробности — в журнале.';$open.Enabled=$false
 if($state.job){$state.job.Dispose();$state.job=$null}
}
function Open-Website{try{Start-Process 'http://127.0.0.1:5173/#persona'}catch{Fail-Launch 'Не удалось открыть браузер'}}
function Start-Services{
 if((Port-Busy 47832) -or (Port-Busy 5173)){throw 'Persona уже запущена или порт занят.'}
 $worker=Join-Path $session 'worker.cmd';$web=Join-Path $session 'web.cmd'
 Write-Wrapper $worker 'call npm run media:worker' $workerLog
 Write-Wrapper $web 'call npm run web:dev -- --host 127.0.0.1 --port 5173 --strictPort' $webLog
 $state.workerId=$state.job.Start($worker,$RepoRoot);$state.webId=$state.job.Start($web,$RepoRoot)
 $state.phase='waiting';$state.began=[DateTime]::UtcNow;$status.Text='Запускаю два сервера в фоне...'
}
$timer=New-Object Windows.Forms.Timer;$timer.Interval=850
$timer.Add_Tick({
 try{
  if($state.phase -eq 'install'){
   if(Is-Alive $state.installId){return}
   if(-not(Test-Path -LiteralPath $installSucceeded -PathType Leaf) -or
      -not(Test-Path (Join-Path $RepoRoot 'node_modules\vite\bin\vite.js'))){
    throw 'Не удалось установить зависимости. Открой журнал.'
   }
   [IO.File]::WriteAllText($installStamp,$state.lockHash,(New-Object Text.UTF8Encoding($false)))
   Start-Services;return
  }
  if($state.phase -ne 'waiting' -and $state.phase -ne 'running'){return}
  if(-not(Is-Alive $state.workerId) -or -not(Is-Alive $state.webId)){throw 'Один из серверов завершился. Открой журнал.'}
  if($state.phase -eq 'waiting'){
   $elapsed=([DateTime]::UtcNow-$state.began).TotalSeconds
   if($elapsed -lt 5){return}
   if((Url-Ready 'http://127.0.0.1:47832/health' 'persona-media-worker') -and (Url-Ready 'http://127.0.0.1:5173/' '')){
    $state.phase='running';$open.Enabled=$true;$status.Text='Persona работает. Загружай видео.'+[Environment]::NewLine+'Закрой это окно, чтобы остановить оба сервера.'
    if(-not $state.browser){$state.browser=$true;Open-Website}
   }elseif($elapsed -ge 85){throw 'Серверы не поднялись. Подробности — в журнале.'}
  }
 }catch{Fail-Launch $_.Exception.Message}
})
$open.Add_Click({Open-Website});$stop.Add_Click({$form.Close()});$logs.Add_Click({Start-Process explorer.exe -ArgumentList ('"'+$session+'"')})
$form.Add_Shown({
 try{
  if(-not(Get-Command node.exe -ErrorAction SilentlyContinue) -or -not(Get-Command npm.cmd -ErrorAction SilentlyContinue)){throw 'Не найден Node.js 22+ (вместе с npm).'}
  $ver=(& node -p 'process.versions.node' 2>$null);if(([Version]$ver).Major -lt 22){throw 'Для Persona нужен Node.js 22 или новее.'}
  if((Port-Busy 47832) -or (Port-Busy 5173)){throw 'Persona уже запущена или порты заняты.'}
  # OpenRouter is optional: the local quick-render falls back to verified offline cuts.
  $state.lockHash=Lock-Hash
  $state.job=New-Object PersonaLauncher.OwnedProcesses
  $installed=if(Test-Path -LiteralPath $installStamp){[IO.File]::ReadAllText($installStamp).Trim()}else{''}
  if(-not(Test-Path (Join-Path $RepoRoot 'node_modules\vite\bin\vite.js')) -or $installed -ne $state.lockHash){
   $status.Text='Проверяю зависимости после обновления...'
   $wrapper=Join-Path $session 'install.cmd'
   Write-Wrapper $wrapper ('call npm ci --no-audit --no-fund && echo READY>"'+$installSucceeded+'"') $installLog
   $state.installId=$state.job.Start($wrapper,$RepoRoot);$state.phase='install'
  }else{Start-Services}
  $timer.Start()
 }catch{Fail-Launch $_.Exception.Message}
})
$form.Add_FormClosing({
 $timer.Stop();if($state.job){$state.job.Dispose();$state.job=$null}
})
try{[Windows.Forms.Application]::Run($form)}finally{$timer.Stop();if($state.job){$state.job.Dispose()};$form.Dispose();$timer.Dispose()}
