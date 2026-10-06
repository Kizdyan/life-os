# Persona Video Pipeline V0

`packages/persona-video` is an isolated local processing engine. It does not read or mutate
Persona UI state, domain stores, Supabase data, publishing state, or Vercel configuration.
The future Persona integration owns job correlation and persistence; the engine owns one
filesystem run from a readable input file to verified output artifacts.

## Boundary

Persona may create a `PersonaShootingResultVideoRequest` containing `ideaId`,
`shootingResultId`, `assetId`, the local source path, and the run-output root. Call
`toVideoProcessingRequest` before `processVideo`. The adapter deliberately leaves all Persona
identifiers outside the engine request. The caller must retain those identifiers and associate
them with the returned `runId`, `runPath`, and `reportPath` in its own state.

The Life OS integration boundary is `processPersonaShootingResult` in
`packages/core/src/persona-video-bridge.ts`. It consumes a Persona idea reference, an already
persisted and revisioned shooting brief, and a correlated `own_raw` Media Brain asset. The
bridge maps those values to `VideoProcessingRequest`, invokes an injected processor, persists a
technical `PersonaVideoProcessingRecord`, and returns a typed input for the existing
`ContentFactory.createDraft` boundary. Shooting-brief persistence remains owned by Persona
state. The bridge does not invoke the planner or make editorial selections.

The input is immutable and hashed with a streaming SHA-256 reader. Each invocation creates a new timestamped run directory and never
reuses output paths. A successful run contains normalized metadata, technical QA, transcript
resolution, objective segments, an EDL, an SRT captions intermediate, audio analysis, a real
rough cut, a 1080x1920 vertical master, platform variants, and `report.json`.

`transcript.json` retains source-media timestamps. `captions.srt` maps those cues through the
final KEEP ranges, so its timestamps match the rough cut and derived outputs after removed
leading, trailing, or internal silence.

## Progress and errors

The optional progress callback receives these stages in order:

`PROBING → QA → CAPTIONS → SEGMENTING → EDITING → AUDIO → REFRAMING → EXPORTING → VERIFYING → COMPLETED`

Failures emit `FAILED`, write a structured failure report in the already-created run directory,
and throw `VideoPipelineError`. Filesystem failures use `FILESYSTEM_ERROR`; failure-report
writing is best effort and never replaces the original error. Callers should store the error
`code`, `message`, available `runPath`/`reportPath`, and `reportWritten`. Retrying means
submitting a new invocation with the same immutable source; the
failed run remains diagnostic evidence and is never overwritten.

## Runtime tools

FFmpeg and ffprobe are process-adapter dependencies. Resolution order is explicit paths,
environment variables, system `PATH`, then dev-only static packages. Production integrations
can inject binary paths and a `ProcessRunner`; they are not tied to npm-installed binaries.
Commands use argument arrays with `shell: false`.

## Current capability boundary

- Segmentation uses objective silence signals. Timed transcript ranges protect speech from cuts.
- A real `TranscriptProvider` is required for real speech-to-text. With no provider, the pipeline
  records transcript unavailability and writes an empty captions intermediate.
- Captions are an SRT intermediate; V0 does not burn subtitles into video.
- Reframing supports deterministic center crop and validated manual regions. `FACE_AWARE` fails
  with `UNSUPPORTED_CAPABILITY` until a real tracking adapter exists.
- Instagram Reels, YouTube Shorts, and VK Clips files are configurable encoding presets. Their
  names do not claim live platform-policy validation or publishing.

## Local use

```text
pnpm persona:video -- <input-file> --output <directory>
```

The command prints progress to stderr/stdout and prints the successful `report.json` path last.
Generated runs under `output/persona-video/` and acceptance artifacts under
`artifacts/persona-video-e2e/` are ignored by Git.

The real-media acceptance test is:

```text
pnpm vitest run packages/persona-video/src/pipeline.e2e.test.ts
```

It generates a real H.264/AAC fixture outside the repository, executes the complete pipeline,
probes every media result, verifies vertical geometry, audio, duration, captions and JSON
artifacts, and confirms the source SHA-256 is unchanged.
