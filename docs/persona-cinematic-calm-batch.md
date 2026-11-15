# Cinematic Calm Batch

Use one SDR MOV or MP4 master with a music track, up to 15 minutes. The beat map
tracks energy and beats. Persona uses sustained sections and groups of eight
beats to estimate phrase boundaries. Each reel keeps one contiguous source
range. To protect a take, supply its start and end times as seconds in a JSON
array such as [[12.2,31.8],[140,168]]. No boundary may fall inside these ranges.

From the repo, with FFmpeg on PATH or PERSONA_MEDIA_FFMPEG_DIR configured:

~~~powershell
py -3.11 -m venv .venv-beats
git clone https://github.com/ZiadAbdelkarim/beat-synced-edit.git .venv-beats/upstream
git -C .venv-beats/upstream checkout --detach 48c09c92ee69c2d89b7e44b146bbd7b9c26fff08
.\.venv-beats\Scripts\python.exe -m pip install -r .venv-beats/upstream/requirements.txt
node tools/persona_orchestrator.mjs init "$job"
node tools/persona_orchestrator.mjs ready "$job"
# Copy the master into the job's input directory.
node tools/persona_orchestrator.mjs batch "$job" --count 4 --protected "$ranges"
~~~

The range file is optional. Set PERSONA_STYLEPACK_V2_30=1 to apply the default
film grain or pass an explicit selection via --stylepack selection.json. Files
appear under the job's output/batch-* with BATCH-PLAN.json and BATCH-RESULT.json.
The final status is AWAITING_APPROVAL after all MP4s pass quality checks. A failed
run at ANALYZING or EDITING can be retried with the same command in a fresh output
directory. Keep the completed and failed runs when reviewing results.

To convert a beat-synced-edit EDL without running a batch, use
tools/beatsync_adapter.py convert-edl with --source for each approved video,
--soundtrack for a separate audio file, and --output for a new EditPlan JSON.
