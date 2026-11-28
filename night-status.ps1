[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$StateRoot)
$ErrorActionPreference='Stop'
$file=Join-Path (Resolve-Path -LiteralPath $StateRoot).Path 'night-state.json'
if(-not(Test-Path -LiteralPath $file)){Write-Output 'NOT_STARTED: no persisted night state';exit 0}
$state=Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
if($state.kind -ne 'EXISTING_LOCAL_BATCH_NIGHT'){throw 'Unknown state format; preserved for inspection'}
$age=([DateTime]::UtcNow-[DateTime]::Parse($state.heartbeatAt).ToUniversalTime()).TotalSeconds
@{status=$state.status;executed=$state.executed;heartbeatAgeSeconds=[math]::Round($age);stale=($state.status -eq 'RUNNING' -and $age -gt 180);reasons=$state.reasons;results=$state.results;publicationApproved=$false} | ConvertTo-Json -Depth 5
