# Manual Input delivery plan

> Execute inline using executing-plans; final fresh code review.

Goal: approved pasted screenplay -> faithful local Qwen parser -> canonical brief and shoot guide -> mapped short takes -> existing renderer -> four unpublished exports.

Architecture: reuse Persona project, ProductionBrief/PreEditPlan, localhost Worker, Whisper spoken evidence, semantic assembler and timeline FFmpeg. Explicit visual takes use author mapping and source SHA, never fake transcripts.

Constraints: no creative rewrite, no original mutations, no private uploads, publicationApproved=false and distributionAllowed=false. Preserve legacy projects.

Review focus: omitted or changed text; async stale parse/project; silent visuals vs speech; damaged/long/HDR/rotated inputs; reload identity and publication barrier.

- [x] Merge verified PR157 (six Actions SUCCESS), create isolated feature branch.
- [x] RED/GREEN faithful source extraction, Qwen constrained output, unavailable-provider failure.
- [x] RED/GREEN numeric filenames and duration guards. Add manual paste, preview, explicit approval and Shoot Worker.
- [x] RED/GREEN visual candidate mapping, no fake ASR, preserve original visual audio.
- [x] Verify real Chrome UI with real local Qwen and synthetic files through four FFmpeg outputs, reload and 390px.
- [x] Unit/typecheck/API/media/build; fresh review without important outstanding findings.
- [ ] Commit and remote CI.

Ruling: preserve complete explicitly mapped visual files instead of guessing source cut times from planned script seconds. Spoken takes retain existing ASR matching. Four platforms preserve approved order; unsupported dramatic re-edits and tutti are disclosed rather than fabricated.

Evidence: actual Chrome eleven-file test (two real synthetic TTS speech clips, nine visual takes), local Qwen parsing, real Whisper, FFmpeg, four exports, full decode/SHA/1080x1920, reload and390px all PASS. Initial dark uniform synthetic backgrounds correctly failed conservative black-frame QA; new synthetic test tables retained the same speech and passed without threshold changes. No real user footage processed.
