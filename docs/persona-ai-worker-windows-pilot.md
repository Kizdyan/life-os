# Local Windows pilot

Double-click `Start-Persona.cmd` in the repository. No administrator privileges,
execution-policy changes, public network listener or paid API are required.
If Windows blocks PowerShell scripts, stop and report the policy message;
the launcher does not bypass it.

The launcher uses the installed Node, FFmpeg, Whisper small multilingual model,
and Ollama Qwen. Its CPU profile references installed model weights rather than
downloading them. It starts localhost services only and checks existing services
before reusing their ports. A running older Worker must be stopped and restarted
after updating the code; a health response alone does not prove its version.

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
records, transcripts, MP4 and QA are stored under
`Documents\LifeOS\Persona\private-media\worker-results`, each render in a new
directory. Source filename records are `source-N.json` beside staged copies.
MP4 bytes are not stored in localStorage or sent to cloud services.

The «Вшить субтитры в MP4» checkbox burns short outlined Arial phrases into the
final AI MP4 after color grading. It is enabled for new UI renders; disable it
to keep only the SRT/VTT sidecars. Short-phrase timings inside an ASR cue are
proportional estimates and require author sync review. The current Worker
does not grant artistic or publication approval. Browser reload restores a
completed result while that Worker session is alive; after a Worker restart,
the saved paths remain but its in-memory playback session must be recreated.

For the first real test, choose only footage actually recorded for the approved
script. `IMG_3971.MOV` remains a color-test source, not seven-scene footage.
