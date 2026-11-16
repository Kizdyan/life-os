# Local Windows pilot

Open `Start-Persona.cmd` or `START_PERSONA.bat` in the repository. Both launch
the same loopback service at `http://127.0.0.1:3000` with Media Worker under
`/persona-worker`. Run either script with `--check-config` to print the resolved
settings without starting the service. The launcher uses installed Node, FFmpeg
and Whisper. Start your installed Ollama for the script-driven editing route.
After updating Persona, restart the running service to load the new code.

1. Open Persona and create a separate Reels project.
2. Prepare the script and explicitly approve its Production Brief.
3. In **Монтаж → Смонтировать ИИ на этом компьютере**, select your camera files.
4. Assign each file to its actual scene using the scene selector. Multiple takes
   can belong to one scene. Original camera names do not need to change.
5. Start AI montage. Whisper must verify the actual spoken words. Missing or
   uncertain speech requires Recovery Review; scene assignment is not ASR evidence.

Limits: 2–12 selected takes, at most 2 GB per file and 4 GB per run. MP4/MOV/MKV/
WebM/M4V extensions are accepted for intake; FFprobe/FFmpeg determines actual
compatibility. HDR/rotation protection and recovery remain in the existing runner.
Do not rename MOV to MP4 to bypass compatibility checks.

Originals stay in their selected folders. Worker-owned copies, SHA-256 intake
records, transcripts, MP4 and QA are stored in `PERSONA_MEDIA_OUTPUT_ROOT`
(default `%LOCALAPPDATA%\LifeOS\Persona\renders`). Each render uses a new
attempt directory. Source filename records are `source-N.json` beside staged copies.
MP4 bytes are not stored in localStorage or sent to cloud services.

The «Вшить субтитры в MP4» checkbox uses the selected ASS title preset after
color grading. Disable it to keep SRT/VTT sidecars. Review subtitle timing and
placement before acceptance. Reloading the page after a Worker restart restores
the registered job, verified media and original brief revision. An interrupted
render can be retried from the saved copies. Reopen archival jobs created before
this version directly from their saved artifact folders.

For the first real test, choose only footage actually recorded for the approved
script. `IMG_3971.MOV` remains a color-test source, not seven-scene footage.
