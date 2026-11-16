# Run locally on the owner's Windows machine. Never send API keys to GitHub Actions.
[CmdletBinding()]
param([string]$EnvFile = "",[string]$JobRoot = "")
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) {
    $EnvFile = Join-Path $root '.env.local'
    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        $EnvFile = Join-Path $root 'apps\web\.env.local'
    }
}
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "Cannot access .env.local on THIS Windows machine. No audit was run."
}
$credentialFound = $false
foreach ($line in (Get-Content -LiteralPath $EnvFile -Encoding UTF8)) {
    if ($line -notmatch '^\s*(?:export\s+)?(OPENROUTER_API_KEY|OPENAI_API_KEY|PERSONA_STRATEGY_MODEL)\s*=\s*(.*?)\s*$') { continue }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not $value) { continue }
    [Environment]::SetEnvironmentVariable($name,$value,'Process')
    if ($name -ne 'PERSONA_STRATEGY_MODEL') { $credentialFound = $true }
}
if (-not $credentialFound) { throw 'No valid OpenRouter/OpenAI key in .env.local; no audit was run.' }
if (-not $JobRoot) {
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA not available' }
    $JobRoot = Join-Path $env:LOCALAPPDATA 'LifeOS\Persona\architect-jobs'
}
Push-Location $root
try {
    if (-not (Test-Path -LiteralPath (Join-Path $JobRoot 'reel-01\job.json'))) {
        & node (Join-Path $PSScriptRoot 'seed_10_projects.mjs') --output-root $JobRoot | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Non-destructive seed failed. Do not overwrite edited jobs.' }
    }
    & python (Join-Path $PSScriptRoot 'strategy_analyzer.py') --batch-root $JobRoot
    if ($LASTEXITCODE -ne 0) { throw 'Real provider audit incomplete. Inspect each existing output/strategy-analysis.json.' }
    $rows = [System.Collections.Generic.List[string]]::new()
    $rows.Add('# Persona: real 10-scenario strategy audit')
    $rows.Add('')
    $rows.Add('| Scenario | LLM status | LLM advice (WARNING/BLOCKED) |')
    $rows.Add('|---|---|---|')
    $counts = @{PASS=0;WARNING=0;BLOCKED=0}
    foreach ($number in 1..10) {
        $id = 'reel-{0:D2}' -f $number
        $dir = Join-Path $JobRoot $id
        $source = Get-Content -LiteralPath (Join-Path $dir 'input\architect-source.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $audit = Get-Content -LiteralPath (Join-Path $dir 'output\strategy-analysis.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $status = [string]$audit.status
        if (-not $counts.ContainsKey($status) -or -not $audit.provider -or -not $audit.model -or
            -not $audit.checkedAt -or -not $audit.sourceSha256) { throw "Audit provenance missing: $id" }
        $counts[$status]++
        $title = ([string]$source.title).Replace('|','/').Replace("`r",' ').Replace("`n",' ')
        $advice = if ($status -ne 'PASS') { ([string]$audit.recommendation).Replace('|','/').Replace("`n",' ') } else { '—' }
        $rows.Add("| $id — $title | $status | $advice |")
    }
    $rows.Add('')
    $rows.Add("PASS $($counts.PASS), WARNING $($counts.WARNING), BLOCKED $($counts.BLOCKED)")
    $rows.Add('Disk-job audits are not automatically synchronized into browser localStorage.')
    $report = Join-Path $JobRoot 'strategy-audit-report.md'
    [IO.File]::WriteAllText($report,($rows -join [Environment]::NewLine),(New-Object Text.UTF8Encoding($false)))
    Write-Host "Audit results saved: $report"
} finally { Pop-Location }
