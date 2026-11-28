[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$StateRoot)
$ErrorActionPreference='Stop'
$statePath=(Resolve-Path -LiteralPath $StateRoot).Path
$stop=Join-Path $statePath 'STOP'
if(Test-Path -LiteralPath $stop){$previous=Get-Content -Raw -LiteralPath $stop | ConvertFrom-Json;if($previous.kind -ne 'persona-night-stop-v1'){throw 'Unknown marker preserved'}}
[IO.File]::WriteAllText($stop,(@{kind='persona-night-stop-v1';requested=$true;requestedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output 'Safe stop requested. The bounded current test may finish; no next task will start. No process was killed.'
