# Run in Windows PowerShell 5.1: offline end-to-end updater contract.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$bat=[IO.File]::ReadAllText((Join-Path $repo 'START_AUTO_RENDER.bat'),[Text.Encoding]::UTF8)
$start=$bat.LastIndexOf('#--PERSONA_BOOTSTRAP--')
$end=$bat.LastIndexOf('#--PERSONA_SUPERVISOR--')
if($start -lt 0 -or $end -le $start){throw 'No embedded desktop bootstrap'}
$bootstrap=$bat.Substring($start+'#--PERSONA_BOOTSTRAP--'.Length,$end-$start-'#--PERSONA_BOOTSTRAP--'.Length)
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($bootstrap,[ref]$tokens,[ref]$errors)
if($errors.Count){throw "BAT bootstrap syntax: $($errors[0])"}
$names=@('Invoke-PersonaGit','Test-PersonaPort','Update-PersonaRepo')
foreach($name in $names){
 $matched=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true))
 if($matched.Count -ne 1){throw ('Missing/duplicate embedded update function: '+$name)}
 . ([scriptblock]::Create($matched[0].Extent.Text))
}
$dir=Join-Path $env:TEMP ('Persona safe updater test '+[Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $dir)
$remote=Join-Path $dir 'remote.git'
$seed=Join-Path $dir 'seed'
$local=Join-Path $dir 'local working copy'
$publisher=Join-Path $dir 'publisher'
$logs=Join-Path $dir 'logs'
[void](New-Item -ItemType Directory -Path $seed)
[void](New-Item -ItemType Directory -Path $logs)
function Git([string[]]$arguments){
 $old=$ErrorActionPreference
 $ErrorActionPreference='Continue'
 try{
  $messages=@(& git.exe @arguments 2>&1)
  $exitCode=$LASTEXITCODE
 }finally{$ErrorActionPreference=$old}
 if($exitCode -ne 0){throw ('Fixture Git command failed: '+$arguments[0]+', exit '+$exitCode)}
 return ($messages -join [Environment]::NewLine)
}
function MustFail([scriptblock]$action,[string]$case){
 $threw=$false
 try{& $action}catch{$threw=$true}
 if(-not $threw){throw ('Unsafe update unexpectedly succeeded: '+$case)}
}
try{
 [void](Git @('init','--bare','--initial-branch=main',$remote))
 [void](Git @('init','-b','main',$seed))
 [IO.File]::WriteAllText((Join-Path $seed '.gitignore'),'.env.local'+[Environment]::NewLine)
 [IO.File]::WriteAllText((Join-Path $seed 'VERSION.txt'),'initial')
 [void](Git @('-C',$seed,'add','--','.gitignore','VERSION.txt'))
 [void](Git @('-C',$seed,'-c','user.email=qa@example.invalid','-c','user.name=Fixture','commit','-m','seed'))
 [void](Git @('-C',$seed,'remote','add','origin',$remote))
 [void](Git @('-C',$seed,'push','-u','origin','main'))
 [void](Git @('clone','--branch','main',$remote,$local))
 [void](Git @('clone','--branch','main',$remote,$publisher))
 $secret='OPENROUTER_API_KEY=TEST_ONLY_DO_NOT_USE_IN_PRODUCTION'
 [IO.File]::WriteAllText((Join-Path $local '.env.local'),$secret)
 $before=(Get-FileHash (Join-Path $local '.env.local') -Algorithm SHA256).Hash
 $r=Update-PersonaRepo -RepoRoot $local -LogDirectory $logs
 if($r -ne 'UP_TO_DATE'){throw 'Clean up-to-date working tree should succeed without changes'}
 if(-not(Test-Path (Join-Path $logs 'last-update.txt'))){throw 'No update receipt'}
 # Publish a new commit; Desktop must fast-forward without user commands.
 [IO.File]::WriteAllText((Join-Path $publisher 'VERSION.txt'),'remote-version-two')
 [void](Git @('-C',$publisher,'add','VERSION.txt'))
 [void](Git @('-C',$publisher,'-c','user.email=qa@example.invalid','-c','user.name=Fixture','commit','-m','remote-v2'))
 [void](Git @('-C',$publisher,'push','origin','main'))
 $r=Update-PersonaRepo -RepoRoot $local -LogDirectory $logs
 if($r -ne 'UPDATED'){throw 'Remote update was not applied'}
 if([IO.File]::ReadAllText((Join-Path $local 'VERSION.txt')) -ne 'remote-version-two'){throw 'Pulled wrong source'}
 if((Get-FileHash (Join-Path $local '.env.local') -Algorithm SHA256).Hash -ne $before){throw 'Updater changed ignored .env.local'}
 # Dirty tracked files must block update.
 [IO.File]::WriteAllText((Join-Path $local 'VERSION.txt'),'important-local-edits')
 MustFail { Update-PersonaRepo -RepoRoot $local -LogDirectory $logs } 'dirty tracked tree'
 if([IO.File]::ReadAllText((Join-Path $local 'VERSION.txt')) -ne 'important-local-edits'){throw 'User edits overwritten'}
 [void](Git @('-C',$local,'restore','--','VERSION.txt'))
 # The user might be on a feature branch. Never auto-switch.
 [void](Git @('-C',$local,'switch','-c','my-feature'))
 MustFail { Update-PersonaRepo -RepoRoot $local -LogDirectory $logs } 'feature branch'
 $active=(Git @('-C',$local,'branch','--show-current')).Trim()
 if($active -ne 'my-feature'){throw 'Updater silently switched branches'}
 [void](Git @('-C',$local,'switch','main'))
 # Offline origin must fail closed.
 [void](Git @('-C',$local,'remote','set-url','origin',(Join-Path $dir 'nonexistent.git')))
 MustFail { Update-PersonaRepo -RepoRoot $local -LogDirectory $logs } 'offline remote'
 if((Get-FileHash (Join-Path $local '.env.local') -Algorithm SHA256).Hash -ne $before){throw '.env.local lost on failed pull'}
 if(@(Get-ChildItem -LiteralPath $logs -Filter '*.tmp').Count -ne 0){throw 'Updater leaked temporary git output'}
 Write-Host 'PASS: no-op, fast-forward, dirty-tree refusal, branch refusal, offline refusal, .env.local untouched.'
}finally{
 Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
}
