# Persona Video Engine V1 Real Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Process the accepted `IMG_6873.mp4` entirely locally into a real Russian transcript, hygienic EDL, normalized clean master, captioned master, platform outputs, and measured V0-to-V1 evidence.

**Architecture:** Extend the existing provider-neutral contracts with deterministic capability fallback and provenance. Implement Whisper.cpp and FFmpeg loudness normalization as required local providers, then compose them with transcript-protected trimming and deterministic caption rendering while retaining every intermediate artifact.

**Tech Stack:** TypeScript, Vitest, Node process adapter, FFmpeg/ffprobe, whisper.cpp CLI, SRT/libass rendering.

**Spec:** `docs/superpowers/specs/2026-10-06-persona-video-v1-real-input-design.md`

## Global Constraints

- The critical path is `LOCAL-FIRST / ZERO-CREDIT` and must not require paid APIs, credits, monthly minutes, external quotas, or cloud authorization.
- The required local path is input -> FFmpeg/ffprobe -> Whisper.cpp -> canonical Transcript -> EDL -> FFmpeg loudness normalization -> captions -> clean master -> captioned master -> platform outputs.
- External providers are optional enhancements; absence, errors, authorization failure, and exhausted quota must fall through to local processing.
- Transcript and audio canonical data are provider-neutral; raw provider payloads remain diagnostic filesystem artifacts.
- Provider reports include `providerUsed`, `fallbackOccurred`, `fallbackReason`, `quotaDependency`, `localProcessing`, and `externalCostRequired`.
- A local run reports `quotaDependency=false`, `localProcessing=true`, and `externalCostRequired=false`.
- Whisper.cpp executables and models are configurable local paths and are never committed.
- Use only the original `C:\Users\Kostya\Desktop\IMG_6873.mp4` for real V1 acceptance; do not overwrite it or V0 artifacts.
- Do not implement Creative Router, Descript, Runway, CapCut, face-aware tracking, artistic selection, OAuth publishing, or UI.
- Every production behavior follows RED -> GREEN -> package regression -> commit.
- Do not merge to `main` or promote production.

## Review Focus

- An allowed external transcript provider is unavailable, quota-exhausted, or throws: Task 1 tests deterministic local fallback and provenance.
- Whisper.cpp returns empty, overlapping, or malformed timestamps: Task 2 tests rejection before canonical persistence.
- A short signal overlaps real speech at a silence boundary: Task 4 tests transcript protection before micro-segment cleanup.
- Input has no audio or normalized output breaches the peak bound: Task 3 tests explicit failure without modifying source/rough cut.
- Cyrillic SRT and Windows paths contain characters requiring FFmpeg filter escaping: Task 5 tests real caption rendering and full decode.

---

### Task 1: Provider-neutral capability contracts and deterministic fallback

**Files:**
- Modify: `packages/persona-video/src/contracts.ts`
- Modify: `packages/persona-video/src/transcription.ts`
- Modify: `packages/persona-video/src/captions.ts`
- Modify: `packages/persona-video/src/captions.test.ts`
- Create: `packages/persona-video/src/index.ts`

**Interfaces:**
- Consumes: existing `Transcript`, `TranscriptSegment`, `TranscriptProvider`, `ProcessRunner`.
- Produces: `CapabilityProviderDescriptor`, `ProviderAvailability`, `ProviderAttempt`, `ProviderUsageReport`, `TranscriptProviderInput`, `TranscriptProviderResult`, and `TranscriptProviderChain.resolve(input)`.

- [ ] **Step 1: Write failing provider-chain tests**

Add tests named:

- `uses a permitted available external provider without fallback`;
- `falls back to local when an external provider is unavailable`;
- `falls back to local when an external provider reports quota exhaustion`;
- `falls back to local when an external provider throws`;
- `uses local directly when no external provider is configured`.

Assert exact provenance fields, including local-only values `quotaDependency=false`, `localProcessing=true`, `externalCostRequired=false` and external-failure `fallbackOccurred=true` with a non-empty `fallbackReason`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src/captions.test.ts`

Expected: FAIL because capability descriptors and `TranscriptProviderChain` do not exist.

- [ ] **Step 3: Implement provider-neutral contracts and chain**

Add exact public signatures:

```ts
interface TranscriptProvider {
  readonly descriptor: CapabilityProviderDescriptor;
  availability(): Promise<ProviderAvailability>;
  transcribe(input: TranscriptProviderInput): Promise<TranscriptProviderResult>;
}

type ProviderAvailability =
  | { available: true }
  | {
      available: false;
      code: "NOT_ALLOWED" | "UNAVAILABLE" | "AUTH_REQUIRED" | "QUOTA_EXHAUSTED";
      reason: string;
    };

interface TranscriptProviderCandidate {
  provider: TranscriptProvider;
  allowed: boolean;
}

interface TranscriptProviderInput {
  audioPath: string;
  language: string;
  artifactDirectory: string;
  runner: ProcessRunner;
}

class TranscriptProviderChain {
  constructor(candidates: TranscriptProviderCandidate[]);
  resolve(input: TranscriptProviderInput): Promise<TranscriptResolution>;
}
```

Keep `provider`, nullable confidence, limitations, and segment confidence generic. Provider-native objects must not enter `Transcript` or `TranscriptResolution`. A local-only chain reports `fallbackOccurred=false` and `fallbackReason=null`; a configured but disallowed, unavailable, quota-exhausted, or failed external candidate followed by local success reports `fallbackOccurred=true` and an explicit reason. Update `DeterministicTranscriptProvider` to the same interface for existing tests and injected callers.

- [ ] **Step 4: Add canonical-validation tests and implement validation**

Test that nullable confidence is preserved, provider-specific extra keys are dropped, empty text and overlapping ranges fail with `INVALID_TRANSCRIPT`, and limitations are normalized to non-empty strings.

Run the targeted test and confirm RED before modifying validation; implement the minimum canonical mapping and rerun GREEN.

- [ ] **Step 5: Verify package tests and commit**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src`

Expected: all persona-video tests pass.

Commit: `feat(persona-video): add provider capability fallback contracts`

### Task 2: Real Whisper.cpp local transcript provider

**Files:**
- Create: `packages/persona-video/src/transcription-audio.ts`
- Create: `packages/persona-video/src/transcription-audio.test.ts`
- Create: `packages/persona-video/src/whisper-cpp.ts`
- Create: `packages/persona-video/src/whisper-cpp.test.ts`
- Modify: `packages/persona-video/src/contracts.ts`
- Modify: `packages/persona-video/src/index.ts`
- Modify: `packages/persona-video/README.md`

**Interfaces:**
- Consumes: Task 1 `TranscriptProvider`, `TranscriptProviderInput`, canonical transcript contracts, `ProcessRunner`.
- Produces: `extractTranscriptionAudio(input): Promise<VerifiedAudioArtifact>` and `WhisperCppTranscriptProvider` implementing `TranscriptProvider`.

- [ ] **Step 1: Write failing retained-audio extraction tests**

Assert that `extractTranscriptionAudio` writes `stt-input.wav` through FFmpeg with mono PCM at 16 kHz, probes the file, and rejects no-audio inputs without modifying the source.

- [ ] **Step 2: Run extraction tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src/transcription-audio.test.ts`

Expected: FAIL because `extractTranscriptionAudio` is missing.

- [ ] **Step 3: Implement retained audio extraction and verify GREEN**

Implement:

```ts
function extractTranscriptionAudio(input: {
  metadata: VideoMetadata;
  outputPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
}): Promise<VerifiedAudioArtifact>;
```

Use atomic rendering and retain the final WAV in the run directory.

- [ ] **Step 4: Write failing Whisper.cpp mapping tests**

Use a fake process runner with representative `whisper-cli --output-json-full` output. Assert Russian language, millisecond timestamps, generic confidence, limitations, raw JSON artifact path, executable/model identity, and model SHA-256. Add malformed/empty/overlapping provider-output cases.

- [ ] **Step 5: Run Whisper tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src/whisper-cpp.test.ts`

Expected: FAIL because `WhisperCppTranscriptProvider` is missing.

- [ ] **Step 6: Implement Whisper.cpp adapter and verify GREEN**

Implement constructor options for explicit executable path, model path, language defaulting to `ru`, thread count, and injected runner. Invoke `whisper-cli` with timestamps and full JSON; preserve the raw JSON beside the canonical artifact.

- [ ] **Step 7: Document zero-credit setup and verify package tests**

Document `WHISPER_CPP_PATH` and `WHISPER_MODEL_PATH`, official acquisition sources, cache location outside Git, expected `small` multilingual model hash, and a verification command. Do not add binaries or model files.

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src`

Commit: `feat(persona-video): add local whisper cpp transcription`

### Task 3: Deterministic two-pass loudness normalization

**Files:**
- Modify: `packages/persona-video/src/contracts.ts`
- Modify: `packages/persona-video/src/audio.ts`
- Modify: `packages/persona-video/src/audio.test.ts`
- Modify: `packages/persona-video/src/index.ts`

**Interfaces:**
- Consumes: `AudioAnalysis`, `VideoMetadata`, `VerifiedMediaOutput`, `ProcessRunner`, Task 1 provider descriptor.
- Produces: `AudioNormalizationProvider`, `AudioNormalizationResult`, and `FfmpegLoudnessNormalizer.normalize(input)`.

- [ ] **Step 1: Write failing two-pass normalization tests**

Assert that pass one parses measured I/LRA/TP/threshold/offset, pass two uses those measurements with `linear=true`, renders `normalized-rough-cut.mp4`, measures the output again, and returns before/after plus target values.

- [ ] **Step 2: Run audio tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src/audio.test.ts`

Expected: FAIL because the provider and measured two-pass result do not exist.

- [ ] **Step 3: Implement `FfmpegLoudnessNormalizer` and verify GREEN**

Default target: `-16 LUFS`, `-1.5 dBTP`, `11 LU`. Preserve video, encode audio as AAC, write a new artifact, and report provider provenance with zero-credit values.

- [ ] **Step 4: Add safety tests and implement enforcement**

Write RED tests for no-audio input, malformed first-pass JSON, undecodable normalized output, and measured true peak above the configured safety bound. Implement explicit `UNSUPPORTED_INPUT` or `INVALID_OUTPUT` failures; never label an unverified file normalized.

- [ ] **Step 5: Verify package tests and commit**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src`

Commit: `feat(persona-video): apply verified two pass loudness normalization`

### Task 4: Transcript-protected EDL hygiene

**Files:**
- Modify: `packages/persona-video/src/segmentation.ts`
- Modify: `packages/persona-video/src/segmentation.test.ts`
- Modify: `packages/persona-video/src/edl.ts`
- Modify: `packages/persona-video/src/edl.test.ts`

**Interfaces:**
- Consumes: canonical `Transcript`, objective `TimeRange[]`, `VideoSegment[]`.
- Produces: `SegmentationPolicy.minimumMeaningfulContentMs` and `EdlPolicy.leadingBreathingRoomMs` / `trailingBreathingRoomMs` with provider-neutral reasons.

- [ ] **Step 1: Write failing micro-segment tests**

Assert that the V0-shaped tail silence `31891-33684` followed by `33684-33700` content becomes trailing silence through `33700` when no transcript overlaps. Assert a `16 ms` content range overlapping a transcript remains protected.

- [ ] **Step 2: Run segmentation tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src/segmentation.test.ts`

Expected: FAIL because micro-content cleanup does not exist.

- [ ] **Step 3: Implement transcript-aware cleanup and verify GREEN**

Add configurable default `minimumMeaningfulContentMs=200`. Merge only unprotected micro-content into adjacent silence and normalize ranges afterward.

- [ ] **Step 4: Write failing breathing-room EDL tests**

Assert defaults preserve `150 ms` before first meaningful content, `300 ms` after last meaningful content, keep internal silence up to `1200 ms`, and preserve only `300 ms` of longer internal silence. Assert no standalone KEEP decision shorter than `200 ms` remains for the V0 tail shape.

- [ ] **Step 5: Implement breathing-room EDL policy and verify GREEN**

Add explicit reasons for breathing-room preservation and micro-content cleanup without introducing editorial signals.

- [ ] **Step 6: Verify package tests and commit**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src`

Commit: `fix(persona-video): clean micro segments without cutting speech`

### Task 5: Real captioned vertical output

**Files:**
- Create: `packages/persona-video/src/caption-render.ts`
- Create: `packages/persona-video/src/caption-render.test.ts`
- Modify: `packages/persona-video/src/contracts.ts`
- Modify: `packages/persona-video/src/index.ts`

**Interfaces:**
- Consumes: non-empty SRT path, normalized `VerifiedMediaOutput`, FFmpeg/ffprobe, `ProcessRunner`.
- Produces: `renderCaptionedVideo(input): Promise<VerifiedMediaOutput>`.

- [ ] **Step 1: Write failing command-construction tests**

Assert deterministic readable style, configurable font, lower safe-area position, retained audio, and correct escaping for Windows drive colons, backslashes, apostrophes, and Cyrillic paths. Assert empty SRT is rejected.

- [ ] **Step 2: Run caption tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src/caption-render.test.ts`

Expected: FAIL because `renderCaptionedVideo` is missing.

- [ ] **Step 3: Implement caption renderer and verify unit GREEN**

Render atomically to `captioned-vertical.mp4`, preserve normalized audio, and probe the final artifact.

- [ ] **Step 4: Add real FFmpeg Cyrillic fixture test**

Create a short generated media fixture and Russian SRT in a temporary Windows path, render captions, fully decode the result, and assert geometry/duration/audio. Run first with rendering disabled to observe RED, then implement any required path/font handling and rerun GREEN.

- [ ] **Step 5: Verify package tests and commit**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src`

Commit: `feat(persona-video): render real captioned vertical output`

### Task 6: Compose V1 pipeline, CLI, reports, and comparison artifact

**Files:**
- Modify: `packages/persona-video/src/pipeline.ts`
- Modify: `packages/persona-video/src/pipeline.test.ts`
- Modify: `packages/persona-video/src/pipeline.e2e.test.ts`
- Modify: `packages/persona-video/src/cli.ts`
- Modify: `scripts/persona-video.mjs`
- Modify: `packages/persona-video/README.md`
- Modify: `docs/PERSONA_VIDEO_PIPELINE.md`
- Create: `packages/persona-video/src/comparison.ts`
- Create: `packages/persona-video/src/comparison.test.ts`

**Interfaces:**
- Consumes: Tasks 1-5 provider chain, Whisper provider, normalization provider, hygienic EDL, caption renderer.
- Produces: extended `VideoProcessingRequest`, `ProcessedVideoResult`, V1 `report.json`, CLI options, and `writeV0V1Comparison(v0, v1, outputPath)`.

- [ ] **Step 1: Write failing pipeline artifact/provenance tests**

Assert stage order and retained artifacts: STT WAV, raw provider JSON, canonical transcript, non-empty SRT, rough cut, normalized rough cut, clean master, captioned master, captioned platform outputs, audio before/after, and exact local provider provenance fields.

- [ ] **Step 2: Run pipeline tests and verify RED**

Run: `node node_modules/vitest/vitest.mjs run packages/persona-video/src/pipeline.test.ts`

Expected: FAIL because V1 composition and report fields are absent.

- [ ] **Step 3: Implement V1 composition and verify unit GREEN**

Extend `VideoProcessingRequest` with ordered transcript candidates, required-transcript mode, audio provider, trim policy, caption rendering options, and configurable Whisper paths through CLI. Keep the existing singular transcript-provider path compatible for injected tests/callers.

- [ ] **Step 4: Write failing comparison tests and implement comparison**

Assert V0/V1 duration, removed ranges, caption status, provider provenance, loudness before/after, output geometry, and unchanged input hash are written to `v0-v1-comparison.json`. Reject reports with different input hashes.

- [ ] **Step 5: Update real-media E2E and docs**

The generated fixture E2E must prove every V1 artifact and full media decode without relying on paid/cloud providers. Document CLI flags/environment variables and the zero-credit execution path.

- [ ] **Step 6: Verify package, repository, TypeScript, and build**

Run sequentially:

```text
node node_modules/vitest/vitest.mjs run packages/persona-video/src
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p api/tsconfig.json --noEmit
node scripts/api-smoke.mjs
node node_modules/vite/bin/vite.js build apps/web
git diff --check
```

Expected: every command exits `0`; all tests report zero failures.

- [ ] **Step 7: Commit**

Commit: `feat(persona-video): compose local first v1 pipeline`

### Task 7: Same-input real V1 acceptance and measured V0 comparison

**Files:**
- Runtime-only artifacts: ignored Whisper.cpp executable/model cache outside Git.
- Runtime-only artifacts: `output/persona-video/iphone-input-test-v1/<run-id>/`.
- Runtime-only artifact: `v0-v1-comparison.json` in the V1 run directory.
- No production source changes unless a failing regression test first reproduces an acceptance defect.

**Interfaces:**
- Consumes: Task 6 CLI and comparison writer, original `IMG_6873.mp4`, accepted V0 `report.json`.
- Produces: verified V1 run and V0-to-V1 evidence.

- [ ] **Step 1: Bootstrap local runtime outside Git**

Acquire a pinned official Whisper.cpp Windows release and multilingual `small` model into the documented ignored cache. Record executable version and model SHA-256. Verify neither path is tracked by Git.

- [ ] **Step 2: Record immutable input and V0 evidence**

Hash `IMG_6873.mp4`, read the accepted V0 report, and record V0 artifact hashes before the run.

- [ ] **Step 3: Run V1 on exactly the same input**

Run the CLI with Russian language, required transcript, explicit Whisper paths, `-16 LUFS` / `-1.5 dBTP`, caption burn-in, V1 output root, and V0 comparison report.

Expected: exit `0`, non-empty transcript/SRT, provider `whisper-cpp-local`, zero-credit provenance, and a new unique run directory.

- [ ] **Step 4: Verify real media and measurements**

Probe and fully decode rough cut, normalized rough cut, clean vertical master, captioned vertical master, and all platform outputs. Verify after loudness is within `1 LU` of target, true peak does not exceed the configured safety bound, no clipping is reported, and the EDL contains no standalone technical micro-tail.

- [ ] **Step 5: Verify immutability and comparison**

Re-hash the source and V0 artifacts; values must match Step 2. Inspect `v0-v1-comparison.json` for duration, EDL, STT, captions, audio, provider, and output differences.

- [ ] **Step 6: Run final regression gate**

Repeat the complete Task 6 verification command set and confirm Git contains only intentional source/doc/test commits; runtime binaries, models, V0, and V1 artifacts remain untracked/ignored.

- [ ] **Step 7: Commit acceptance documentation if needed**

If repository documentation requires final measured evidence, commit only small text/JSON evidence without media, binaries, models, or user transcript content. Otherwise leave generated evidence in the ignored V1 run and make no empty commit.

## Completion contract

V1 is complete only when all seven tasks have RED/GREEN evidence, atomic commits, a clean final regression gate, and the same-input real run proves local zero-credit processing end to end. The final report must distinguish automated improvements from remaining human judgment and must not claim external provider integrations that were not built.
