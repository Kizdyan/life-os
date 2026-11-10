# One-time local key setup. Does not print, commit, or upload the secret.
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$envFile=Join-Path $repo '.env.local'
$example=Join-Path $repo '.env.example'
Write-Host 'Persona / Perplexity: enter your real API key (input is hidden).'
$secret=Read-Host 'Perplexity API key' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try{$key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if($key.Length -lt 16 -or $key -notmatch '^[A-Za-z0-9._-]+$' -or $key -match 'ТВОЙ|YOUR|PLACEHOLDER'){
 throw 'The input is not a valid API key. No files or processes changed.'
}
$source=if(Test-Path -LiteralPath $envFile -PathType Leaf){[IO.File]::ReadAllText($envFile)}else{[IO.File]::ReadAllText($example)}
$lines=[regex]::Split($source,'\r?\n')
$updated=[System.Collections.Generic.List[string]]::new()
$found=$false
foreach($line in $lines){
 if($line -match '^\s*PERPLEXITY_API_KEY\s*='){
  if(!$found){$updated.Add('PERPLEXITY_API_KEY='+$key);$found=$true}
 }else{$updated.Add($line)}
}
if(!$found){$updated.Add('PERPLEXITY_API_KEY='+$key)}
[IO.File]::WriteAllText($envFile,([regex]::Replace(($updated -join [Environment]::NewLine),'[\r\n]+,[Text.UTF8Encoding]::new($false))
$env:PERPLEXITY_API_KEY=$key
$key=$null
Write-Host 'Key saved locally in ignored .env.local; restarting only the verified Persona Worker.'
$listener=Get-NetTCPConnection -LocalPort 47832 -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalAddress -in @('127.0.0.1','::1')} | Select-Object -First 1
if($listener){
 $proc=Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction Stop
 $command=[string]$proc.CommandLine
 if($command -notmatch 'persona-media-worker\.mjs' -or $command.IndexOf($repo,[StringComparison]::OrdinalIgnoreCase) -lt 0){
  throw 'Port 47832 belongs to an unverified process. Not stopping it; restart Persona Worker manually.'
 }
 Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
 for($i=0;$i -lt 30;$i++){
  Start-Sleep -Milliseconds 250
  if(!(Get-NetTCPConnection -LocalPort 47832 -State Listen -ErrorAction SilentlyContinue)){break}
 }
}
& (Join-Path $PSScriptRoot 'start-persona-windows.ps1') -NoBrowser
$env:PERPLEXITY_API_KEY=$null
$health=Invoke-RestMethod 'http://127.0.0.1:47832/health' -TimeoutSec 8
if($health.service -ne 'persona-media-worker' -or !$health.externalIdeas.perplexity.configured){
 throw 'The restarted Worker did not report a configured Perplexity provider.'
}
Write-Host 'Worker: restarted. Perplexity key: configured (API request not yet verified).'
$body=@{projectId='perplexity-connectivity-smoke';provider='perplexity';theme='Какие сейчас тренды в Reels? Предложи несколько оригинальных идей для актёра и композитора киномузыки.';consent=$true} | ConvertTo-Json -Compress
$result=Invoke-RestMethod -Uri 'http://127.0.0.1:47832/external-ideas' -Method Post -Headers @{'X-Persona-Worker-Token'=$health.token} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 150
if($result.provider -ne 'perplexity' -or !$result.ideas -or $result.ideas.Count -lt 1){throw 'Perplexity API returned no valid ideas.'}
Write-Host ('Perplexity API LIVE PASS. Model: '+$result.model)
foreach($idea in $result.ideas){
 Write-Host ('Idea: '+$idea.title)
 Write-Host ([string]$idea.script).Substring(0,[Math]::Min(700,([string]$idea.script).Length))
}
Write-Host 'Note: this tests creative idea generation, not independently verified current Reels trends.'
,'')+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
$env:PERPLEXITY_API_KEY=$key
$key=$null
Write-Host 'Key saved locally in ignored .env.local; restarting only the verified Persona Worker.'
$listener=Get-NetTCPConnection -LocalPort 47832 -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalAddress -in @('127.0.0.1','::1')} | Select-Object -First 1
if($listener){
 $proc=Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction Stop
 $command=[string]$proc.CommandLine
 if($command -notmatch 'persona-media-worker\.mjs' -or $command.IndexOf($repo,[StringComparison]::OrdinalIgnoreCase) -lt 0){
  throw 'Port 47832 belongs to an unverified process. Not stopping it; restart Persona Worker manually.'
 }
 Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
 for($i=0;$i -lt 30;$i++){
  Start-Sleep -Milliseconds 250
  if(!(Get-NetTCPConnection -LocalPort 47832 -State Listen -ErrorAction SilentlyContinue)){break}
 }
}
& (Join-Path $PSScriptRoot 'start-persona-windows.ps1') -NoBrowser
$env:PERPLEXITY_API_KEY=$null
$health=Invoke-RestMethod 'http://127.0.0.1:47832/health' -TimeoutSec 8
if($health.service -ne 'persona-media-worker' -or !$health.externalIdeas.perplexity.configured){
 throw 'The restarted Worker did not report a configured Perplexity provider.'
}
Write-Host 'Worker: restarted. Perplexity key: configured (API request not yet verified).'
$body=@{projectId='perplexity-connectivity-smoke';provider='perplexity';theme='Какие сейчас тренды в Reels? Предложи несколько оригинальных идей для актёра и композитора киномузыки.';consent=$true} | ConvertTo-Json -Compress
$result=Invoke-RestMethod -Uri 'http://127.0.0.1:47832/external-ideas' -Method Post -Headers @{'X-Persona-Worker-Token'=$health.token} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 150
if($result.provider -ne 'perplexity' -or !$result.ideas -or $result.ideas.Count -lt 1){throw 'Perplexity API returned no valid ideas.'}
Write-Host ('Perplexity API LIVE PASS. Model: '+$result.model)
foreach($idea in $result.ideas){
 Write-Host ('Idea: '+$idea.title)
 Write-Host ([string]$idea.script).Substring(0,[Math]::Min(700,([string]$idea.script).Length))
}
Write-Host 'Note: this tests creative idea generation, not independently verified current Reels trends.'
