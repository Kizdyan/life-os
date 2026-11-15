# Cinematic Calm Batch

Use one SDR MOV or MP4 master with a music track, up to 15 minutes. The beat map
tracks energy and beats. Persona uses sustained sections and groups of eight
beats to estimate phrase boundaries. Each reel keeps one contiguous source
range. To protect a take, supply its start and end times as seconds in a JSON
array such as [[12.2,31.8],[140,168]]. No boundary may fall inside these ranges.

Run the commands from the repository checkout. Put FFmpeg on PATH or set
PERSONA_MEDIA_FFMPEG_DIR to the directory containing ffmpeg.exe and ffprobe.exe.

## One-time setup on Windows

Skip this section if .venv-beats already contains Python and the pinned checkout.
Create the environment with py -3.11 -m venv .venv-beats. If the Python launcher
is absent, use uv venv --python 3.11 .venv-beats.

~~~powershell
$revision = '48c09c92ee69c2d89b7e44b146bbd7b9c26fff08'
git init .venv-beats/upstream
git -C .venv-beats/upstream fetch --depth=1 --no-tags https://github.com/ZiadAbdelkarim/beat-synced-edit.git $revision
git -C .venv-beats/upstream checkout --detach FETCH_HEAD
~~~

Use this command if you created the environment with the Python launcher.

~~~powershell
.\.venv-beats\Scripts\python.exe -m pip install -r .venv-beats/upstream/requirements.txt
~~~

Use this command for an environment created by uv.

~~~powershell
uv pip install --python .\.venv-beats\Scripts\python.exe -r .venv-beats/upstream/requirements.txt
~~~

## Run a batch

~~~powershell
$master = 'C:\Media\master.mp4' # Replace with the path to your recording.
$job = Join-Path $env:USERPROFILE ('persona-batch-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
node tools/persona_orchestrator.mjs init "$job"
node tools/persona_orchestrator.mjs ready "$job"
Copy-Item -LiteralPath $master -Destination (Join-Path $job 'input')
node tools/persona_orchestrator.mjs batch "$job" --count 4
~~~

Choose 3, 4, or 5 reels. Add --protected "C:\Media\ranges.json" to the batch
command to protect the takes in that file. To use StylePack, run
$env:PERSONA_STYLEPACK_V2_30 = '1' before starting the batch. This applies the
default film grain. With the flag on, --stylepack selection.json selects other
effects. Files appear under the job's output/batch-* with BATCH-PLAN.json and
BATCH-RESULT.json.
The final status is AWAITING_APPROVAL after all MP4s pass quality checks. A failed
run at ANALYZING or EDITING can be retried with the same command in a fresh output
directory. Keep the completed and failed runs when reviewing results.

To convert a beat-synced-edit EDL without running a batch, use
tools/beatsync_adapter.py convert-edl with --source for each approved video,
--soundtrack for a separate audio file, and --output for a new EditPlan JSON.
