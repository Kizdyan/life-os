param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nodeDir=Join-Path $env:USERPROFILE 'Tools\node-v22.23.4-win-x64'
$node=Join-Path $nodeDir 'node.exe'
if(!(Test-Path -LiteralPath $node)){ $node=(Get-Command node -ErrorAction Stop).Source;$nodeDir=Split-Path -Parent $node }
$ffmpeg=Join-Path $env:USERPROFILE 'Tools\FFmpeg\ffmpeg-9.0.2-essentials_build\bin'
$whisper=Join-Path $env:USERPROFILE 'Tools\whisper.cpp\bin\whisper-cli.exe'
$whisperModel=Join-Path $env:USERPROFILE 'Tools\whisper.cpp\models\ggml-small.bin'
$ollama=Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
foreach($file in @((Join-Path $ffmpeg 'ffmpeg.exe'),(Join-Path $ffmpeg 'ffprobe.exe'),$whisper,$whisperModel,$ollama)){
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "Missing installed dependency: $file"}
}
$env:PATH="$nodeDir;$ffmpeg;$env:PATH"
& $node --version
& (Join-Path $ffmpeg 'ffmpeg.exe') -version | Select-Object -First 1
$output=Join-Path $env:USERPROFILE 'Documents\LifeOS\Persona\private-media\worker-results'
New-Item -ItemType Directory -Path $output -Force | Out-Null
try{$tags=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3}
catch{throw 'Start the installed Ollama application, then retry. No system settings were changed.'}
if('qwen3:4b-instruct' -notin $tags.models.name){throw 'Required local qwen3:4b-instruct model is not installed.'}
$modelFile=Join-Path $PSScriptRoot 'persona-qwen-cpu.Modelfile'
& $ollama create persona-qwen-cpu -f $modelFile
if($LASTEXITCODE -ne 0){throw 'CPU Qwen profile could not be created from installed weights.'}
if(!(Test-Path -LiteralPath (Join-Path $repo 'node_modules\vite\bin\vite.js'))){
 Push-Location $repo
 try{& (Join-Path $nodeDir 'npm.cmd') ci --no-audit --no-fund;if($LASTEXITCODE -ne 0){throw 'npm ci failed'}}finally{Pop-Location}
}
$health=$null
try{$health=Invoke-RestMethod 'http://127.0.0.1:47832/health' -TimeoutSec 3}catch{}
if($health -and $health.service -ne 'persona-media-worker'){throw 'Port 47832 belongs to another service.'}
if(!$health){
 $argsList=@(('"'+(Join-Path $PSScriptRoot 'persona-media-worker.mjs')+'"'),'--output-root',('"'+$output+'"'),'--ffmpeg-dir',('"'+$ffmpeg+'"'),'--whisper-cli',('"'+$whisper+'"'),'--whisper-model',('"'+$whisperModel+'"'),'--ollama-model','persona-qwen-cpu:latest')
 Start-Process -FilePath $node -ArgumentList $argsList -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output 'worker.stdout.log') -RedirectStandardError (Join-Path $output 'worker.stderr.log') | Out-Null
 for($attempt=0;$attempt -lt 30;$attempt++){Start-Sleep -Milliseconds 300;try{$health=Invoke-RestMethod 'http://127.0.0.1:47832/health' -TimeoutSec 3;break}catch{}}
}
if(!$health.ok){throw 'Worker is not ready. Check installed dependencies and worker.stderr.log.'}
$web=$null
try{$web=Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 3}catch{}
if($web -and $web.Content -notmatch 'Life OS'){throw 'Port 5173 belongs to another application.'}
if(!$web){
 Start-Process -FilePath $node -ArgumentList @(('"'+(Join-Path $repo 'node_modules\vite\bin\vite.js')+'"'),'apps/web','--host','127.0.0.1','--port','5173','--strictPort') -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output 'web.stdout.log') -RedirectStandardError (Join-Path $output 'web.stderr.log') | Out-Null
 for($attempt=0;$attempt -lt 30;$attempt++){Start-Sleep -Milliseconds 300;try{$web=Invoke-WebRequest 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 3;break}catch{}}
 if(!$web){throw 'Local Persona did not start. See web.stderr.log.'}
}
Write-Output 'Persona: http://127.0.0.1:5173/#persona'
Write-Output "Local copies and renders: $output"
Write-Output 'Select your own takes in Persona. No files are scanned or uploaded automatically.'
if(!$NoBrowser){Start-Process 'http://127.0.0.1:5173/#persona'}
