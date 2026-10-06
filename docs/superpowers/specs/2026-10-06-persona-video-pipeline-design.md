# Persona Video Pipeline V0 Design

## Purpose and acceptance criterion

Build a provider-neutral, local video-processing engine that turns a real input video into inspectable short-form media artifacts without depending on Persona UI, Persona durable state, publishing, OAuth, or the Life OS runtime.

The milestone is accepted only when one reproducible command processes a real video fixture through:

`input → metadata → technical QA → objective segmentation → EDL → rough cut → captions intermediate → audio analysis → vertical master → Instagram/YouTube/VK variants → technical E2E report`

The source file is immutable. Generated media must be playable files, not mocks or architecture-only placeholders.

## Scope boundaries

The implementation lives under `packages/persona-video` with a thin CLI under `scripts/`. It must not modify Life Analytics, Erika, Today, Calendar, sync/audit/task runtime, Persona UI, Persona state, Persona shooting screens, publishing jobs, platform OAuth, Supabase, Vercel production settings, or the main branch.

The engine may reuse the semantics of existing `CaptionCue` and `EditClipSelection`, but owns its contracts so the main Persona agent can integrate it later through an adapter without creating a dependency from the engine to UI or durable state.

## Existing capabilities to reuse

The repository already provides:

- immutable Media Brain asset provenance and provider-neutral storage boundaries;
- `CapCutWorkPackage`, ordered edit clip selections, caption cues and SRT export;
- Content Factory and `prepare_edit` workflow concepts;
- platform-neutral media jobs and approval-gated publishing;
- Vitest and strict TypeScript checks.

The repository does not provide FFmpeg/ffprobe execution, technical video metadata, corruption checks, objective media segmentation, an EDL renderer, audio measurements, vertical transcoding, platform media exports, or a real video E2E fixture.

## Architecture

`packages/persona-video` contains small units with one responsibility:

- `contracts.ts`: stable request/result, metadata, QA, transcript, segment, EDL, audio, reframe and export contracts.
- `process-adapter.ts`: injected command runner and binary resolution. Resolution order is explicit request path, environment variable, executable on PATH, then optional dev-only package fallback. Production code never assumes a particular installer.
- `probe.ts`: ffprobe JSON parsing and normalized `VideoMetadata`.
- `technical-qa.ts`: deterministic PASS/WARNING/FAIL findings with machine-readable codes.
- `segmentation.ts`: objective silence-based boundaries plus transcript boundaries when supplied. Editorial AI and human feedback remain separate signal sources.
- `edl.ts`: stable KEEP/CUT/OPTIONAL decisions independent of rendering.
- `transcription.ts` and `captions.ts`: provider interface, deterministic test adapter and SRT generation. No fake production STT.
- `rough-cut.ts`: renders KEEP ranges to a new file with audio preserved when present.
- `audio.ts`: measures loudness/peak and optionally applies bounded normalization to generated outputs only.
- `reframe.ts`: CENTER and MANUAL_REGION 9:16 rendering. FACE_AWARE is declared unsupported until a real tracker exists.
- `exports.ts`: configurable Instagram Reels, YouTube Shorts and VK Clips presets; no unverified platform limits are hardcoded.
- `pipeline.ts`: orchestration, isolated run directory, progress events, report writing and failure cleanup policy.
- `cli.ts`: developer harness consumed by `scripts/persona-video.mjs`.

All filesystem paths passed to external processes are separate argument-array elements. Shell interpolation is prohibited.

## Tooling and dependency policy

The process adapter accepts `ffmpegPath` and `ffprobePath`. It first uses explicitly supplied paths or system executables. Because the current machine has neither executable, reproducible local E2E may use `ffmpeg-static` and `ffprobe-static` as dev-only dependencies. Binary files remain in `node_modules` and are never committed. The package lock pins the resolved versions.

No FFmpeg wrapper framework, WASM runtime, computer-vision stack, or speech model is added in V0.

## Contracts

`VideoProcessingRequest` contains input path, output root, optional transcript provider, silence thresholds, reframe instruction, configurable export presets, binary paths and an optional progress callback.

`ProcessedVideoResult` contains run id/path, immutable input identity, metadata, QA, segments, EDL, transcript state, captions path, audio analysis, rough-cut path, vertical-master path, platform outputs, report path, warnings and tool versions.

Progress states are `PROBING`, `QA`, `SEGMENTING`, `EDITING`, `CAPTIONS`, `AUDIO`, `REFRAMING`, `EXPORTING`, `VERIFYING`, `COMPLETED`, `FAILED`.

Failure classes distinguish missing tool, unreadable/unsupported input, failed technical QA, invalid transcript, processing command failure, invalid output and filesystem failure. The CLI returns non-zero and leaves a structured failure report in the run directory when the directory was created.

Retries are not implicit for deterministic local failures. A caller may retry the full request with the same input; each run gets a separate directory and never overwrites prior outputs.

## Metadata and technical QA

ffprobe extracts duration, width, height, display orientation, average FPS, video codec, bitrate when available, audio presence/codec, file size and creation metadata when available. Unknown values remain `null`.

Technical QA verifies readable probe output, a video stream, positive dimensions/duration/FPS, supported decode, optional audio presence, anomalously short duration and a full decode-to-null check for corruption. Findings have code, severity, message and optional details. Overall status is the highest severity.

## Objective segmentation and EDL

FFmpeg `silencedetect` supplies silence intervals. Transcript segment boundaries may protect spoken words when a real or deterministic transcript exists. V0 may remove leading/trailing silence and shorten internal pauses longer than the configured maximum; it must preserve a configurable natural pause and must not cut across transcript speech.

Every segment records source interval and signal source. The EDL records source start/end, KEEP/CUT/OPTIONAL, reason and confidence. Objective signals, editorial signals and human feedback are separately typed; V0 produces objective decisions only.

## Rendering

The rough cut concatenates KEEP ranges into a new H.264/AAC MP4. Inputs without audio produce a valid video-only result. Generated files use temporary names and are renamed only after ffprobe verification.

Audio analysis records integrated/mean loudness when available, peak level, clipping risk and too-quiet warning. Normalization uses a conservative target supplied through configuration and never modifies the source.

Vertical rendering preserves already-vertical composition. Horizontal inputs use CENTER crop by default. MANUAL_REGION validates a normalized crop region. FACE_AWARE returns an explicit unsupported-capability error.

Platform variants are rendered from the vertical master using named configurable presets. Default V0 presets select safe MP4/H.264/AAC settings and identify the intended platform without claiming current upload-limit compliance.

## Captions and transcription

The engine consumes a provider-neutral `Transcript` with timed segments. A deterministic adapter supports tests and E2E. If no provider is configured, transcript state is `unavailable`, captions are an empty valid intermediate and the rest of the pipeline continues with an explicit warning. Real STT is an external dependency.

SRT generation is independent of visual styling. Burn-in subtitles are optional for V0 and are included only if reliable escaping and font discovery can be proven without a new stack.

## Run artifacts

Each run directory contains at least:

- `metadata.json`
- `qa.json`
- `transcript.json`
- `segments.json`
- `edit-decision.json`
- `captions.srt`
- `audio.json`
- `rough-cut.mp4`
- `vertical-master.mp4`
- `instagram-reels.mp4`
- `youtube-shorts.mp4`
- `vk-clips.mp4`
- `report.json`

The generated E2E fixture and run output stay outside Git. Tests generate a short audiovisual fixture deterministically with FFmpeg inside a temporary directory.

## Verification

Unit tests cover parsing and contracts with literal fixtures. Integration tests use the real process adapter and installed binaries. The final E2E test generates a real MP4, runs the CLI/engine, probes every generated output and verifies existence, playability, sensible duration, 9:16 dimensions, expected audio preservation, valid SRT, deterministic JSON shapes and byte-for-byte preservation of the input.

The whole repository test suite, root typecheck, API typecheck and web build must remain green.

## Integration contract

Later Persona integration owns mapping an idea/shooting result and Media Brain asset into `VideoProcessingRequest`, scheduling/retry policy and storing `ProcessedVideoResult`. The engine owns local technical processing and its run artifacts. Content Factory owns editorial choices and may replace the EDL without re-probing the source. Publishing owns upload requirements and remains out of scope.

Potential integration conflicts are limited to `package.json`, the package lock and optional future exports. V0 does not modify existing Persona or Media Brain source files.

## Production readiness limits

V0 proves technical processing, not editorial quality. Silence segmentation is objective but cannot identify the best performance. Deterministic transcript data is not production STT. CENTER crop is not face tracking. Default platform presets require review against current platform requirements before production publishing. A real user iPhone clip is still required for final perceptual evaluation.
