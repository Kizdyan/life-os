# First real Reel acceptance plan

> Execute inline with executing-plans and final fresh code review.

Goal: classify each mapped short take as speech/visual, retain authored text and ASR safety, use configured ASS styles and offer optional server-side external idea generation. Merge after verified CI per explicit user instruction.

Reuse existing PersonaManualScript, ProductionBrief, localhost Worker, source SHA, semantic plan, ASS burner and four-platform exporter. No new editor or media subsystem.

- [x] RED/GREEN typed per-file bindings: exact authored speech required, visual must not bypass required spoken lines, explicit source ID/SHA, persist in job/decisions through exports and reload.
- [x] RED/GREEN reuse ASS profiles, remove Arial fallback, Windows native configured families and verify rendered pixels/audio.
- [x] RED/GREEN optional OpenAI/Perplexity request from Worker; fixed hosts, bounded response, secret-free health, no-key/manual fallback, explicit billable click; retain generated text in existing project draft.
- [x] Actual Chrome eleven mapped synthetic clips, real Qwen parser/Whisper/FFmpeg, ASS, four exports, reload/390px; backend long/corrupt/MOV tests.
- [ ] Core/API typecheck, unit/media/build, final review, commit/PR/CI/merge.

Constraints: no private media sent to external APIs; no live paid request without configured key and explicit user click. Original/source/previous artifacts immutable, publicationApproved=false, distributionAllowed=false. Explicit speech cannot become visual to bypass ASR. Bindings change execution only, not canonical authored text; preserve exact brief fingerprint separately.

Verified local:559 unit PASS,242 media PASS0FAIL5SKIP; core/API typecheck and build PASS. Fresh review: no confirmed P0/P1/P2. Primary Chrome used10MP4+1MOV/PCM, two speech bindings (one converted from authored visual title), nine visual, real Qwen parser/Whisper/FFmpeg, four exports, reload and390px. OnlytwoWhisperfiles; actualSegoeUI/Bold/Light verified inlibasslogs. Eleven sourceSHAs unchanged, four full decodes. External providers: no keys; livecalls SKIP, no-key UI and mocked transport contracts tested honestly.
