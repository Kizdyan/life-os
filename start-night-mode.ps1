[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Board,[Parameter(Mandatory=$true)][string]$StateRoot)
$ErrorActionPreference='Stop'
$boardFile=(Resolve-Path -LiteralPath $Board).Path
$statePath=[IO.Path]::GetFullPath($StateRoot)
$node=(Get-Command node -ErrorAction Stop).Source
$systemDrive=Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))
if($systemDrive.Free -lt 1GB){throw 'Night mode BLOCKED: free at least 1 GiB on the Windows system drive. No files were deleted.'}
New-Item -ItemType Directory -Path $statePath -Force | Out-Null
$stop=Join-Path $statePath 'STOP'
if(Test-Path -LiteralPath $stop){$previous=Get-Content -Raw -LiteralPath $stop | ConvertFrom-Json;if($previous.kind -ne 'persona-night-stop-v1'){throw 'Unknown stop marker preserved; inspect before starting'}}
[IO.File]::WriteAllText($stop,(@{kind='persona-night-stop-v1';requested=$false} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$runner=Join-Path $PSScriptRoot 'tools/persona-local-batch.mjs'
# Only the existing allowlisted executor can act. No browser, installation, merge or publication.
$arguments=@(('"'+$runner+'"'),'--night','--input',('"'+$boardFile+'"'),'--output',('"'+$statePath+'"'),'--max-tasks','50')
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$previousTemp=$env:TEMP;$previousTmp=$env:TMP
try{
 $env:TEMP=Join-Path $statePath 'tmp';$env:TMP=$env:TEMP
 New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
 $process=Start-Process -FilePath $node -ArgumentList $arguments -WindowStyle Hidden -WorkingDirectory $PSScriptRoot -RedirectStandardOutput (Join-Path $statePath ('run-'+$stamp+'.stdout.log')) -RedirectStandardError (Join-Path $statePath ('run-'+$stamp+'.stderr.log')) -PassThru
}finally{$env:TEMP=$previousTemp;$env:TMP=$previousTmp}
Write-Output ('Night process started: '+$process.Id+'. Inspect night-status.ps1; startup is not task acceptance.')
