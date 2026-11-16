@echo off
setlocal
set "PERSONA_LAUNCHER_FILE=%~f0"
start "" powershell.exe -NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$source=[IO.File]::ReadAllText($env:PERSONA_LAUNCHER_FILE,[Text.Encoding]::UTF8);$mark='#--PERSONA_BOOTSTRAP--';$idx=$source.LastIndexOf($mark);if($idx -lt 0){exit 1};& ([scriptblock]::Create($source.Substring($idx+$mark.Length)))"
exit /b
#--PERSONA_BOOTSTRAP--
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
function Alert([string]$message){
    [void][Windows.Forms.MessageBox]::Show($message,'Persona — запуск',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Warning)
}
function Is-PersonaRepo([string]$folder){
    if([string]::IsNullOrWhiteSpace($folder)){return $false}
    return (Test-Path -LiteralPath (Join-Path $folder 'package.json') -PathType Leaf) -and
      (Test-Path -LiteralPath (Join-Path $folder 'tools\persona-launcher-supervisor.ps1') -PathType Leaf) -and
      (Test-Path -LiteralPath (Join-Path $folder 'tools\persona-media-worker.mjs') -PathType Leaf)
}
try {
    $folder=[IO.Path]::GetDirectoryName($env:PERSONA_LAUNCHER_FILE)
    $settings=Join-Path $env:LOCALAPPDATA 'LifeOS\Persona\launcher'
    $saved=Join-Path $settings 'project-root.txt'
    $previous=if(Test-Path -LiteralPath $saved){[IO.File]::ReadAllText($saved,[Text.Encoding]::UTF8).Trim()}else{''}
    $roots=@($folder,$previous,$env:USERPROFILE,
        (Join-Path $env:USERPROFILE 'Documents'),(Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:USERPROFILE 'source\repos'),
        $env:OneDrive,(Join-Path $env:SystemDrive 'Projects'),(Join-Path $env:SystemDrive 'Code'))
    $root=$null
    foreach($candidate in $roots){if(Is-PersonaRepo $candidate){$root=$candidate;break}}
    if(-not $root){
        $queue=New-Object System.Collections.Queue
        foreach($candidate in $roots){if($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)){$queue.Enqueue(@($candidate,0))}}
        $examined=0
        $exclude=@('node_modules','.git','.next','.venv','venv','AppData','Library','.cache','.idea','.vs','dist','build')
        while($queue.Count -gt 0 -and $examined -lt 1800 -and -not $root){
            $item=$queue.Dequeue();$path=[string]$item[0];$depth=[int]$item[1];$examined++
            if(Is-PersonaRepo $path){$root=$path;break}
            if($depth -ge 4){continue}
            try{$children=[IO.Directory]::EnumerateDirectories($path)}catch{continue}
            foreach($child in $children){
                if($exclude -contains [IO.Path]::GetFileName($child)){continue}
                $queue.Enqueue(@($child,$depth+1))
            }
        }
    }
    if(-not $root){
        $dialog=New-Object Windows.Forms.FolderBrowserDialog
        $dialog.Description='Укажи папку Life OS (только при первом запуске). Далее всё будет автоматически.'
        $dialog.ShowNewFolderButton=$false
        if($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){exit 0}
        $root=$dialog.SelectedPath
        if(-not(Is-PersonaRepo $root)){
            Alert 'В выбранной папке нет обновлённого Life OS. Сначала обнови репозиторий с файлом START_AUTO_RENDER.bat.'
            exit 2
        }
    }
    [void][IO.Directory]::CreateDirectory($settings)
    [IO.File]::WriteAllText($saved,$root,(New-Object Text.UTF8Encoding($false)))
    & (Join-Path $root 'tools\persona-launcher-supervisor.ps1') -RepoRoot $root
}catch{
    Alert ('Не удалось запустить Persona: '+$_.Exception.Message)
    exit 1
}
