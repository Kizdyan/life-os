# Persona Video Pipeline V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove an isolated TypeScript video-processing engine that turns a real local video into metadata, QA, EDL, captions, rough cut, vertical master and three playable platform variants.

**Architecture:** `packages/persona-video` owns provider-neutral contracts and small FFmpeg-backed processing units behind an injected process adapter. `pipeline.ts` composes them into isolated run directories; a thin Node CLI supplies the developer harness. Existing Persona UI/state, Media Brain runtime and publishing stay untouched.

**Tech Stack:** TypeScript 5.9, Node.js 24, Vitest 3, FFmpeg/ffprobe via PATH/explicit paths with dev-only static binary fallback.

**Spec:** `docs/superpowers/specs/2026-10-06-persona-video-pipeline-design.md`

## Global Constraints

- Never modify or overwrite the input file.
- Do not commit media binaries, generated fixtures, run outputs or secrets.
- Resolve FFmpeg/ffprobe through an injected process adapter; production must not depend on static npm packages.
- Keep objective signals, editorial AI signals and human feedback separately typed.
- Do not modify existing Persona UI/state, Life OS runtime, publishing, Supabase or Vercel production configuration.
- Do not claim real STT, face-aware reframing or current platform-limit compliance without a real implementation.
- Every behavior change follows test → observed failure → minimal implementation → green suite → commit.

## Review Focus

- Paths containing spaces or metacharacters must remain single process arguments and never invoke a shell; Task 1 tests this.
- Corrupt files that still return partial metadata must fail decode QA instead of being rendered; Task 3 tests this.
- Internal silence overlapping transcript speech must not cut a word; Task 4 tests this.
- Inputs without audio must still create playable rough cut, vertical and platform outputs; Tasks 6 and 8 test this.
- A failed render must not replace a previous artifact or mutate the input; Tasks 6 and 9 test this.

---

### Task 1: Contracts and process adapter

**Files:**
- Create: `packages/persona-video/src/contracts.ts`
- Create: `packages/persona-video/src/process-adapter.ts`
- Create: `packages/persona-video/src/process-adapter.test.ts`
- Modify: `package.json`
- Modify/Create: `package-lock.json`

**Interfaces:**
- Consumes: explicit binary paths, environment lookup, PATH executables and optional static-package paths.
- Produces: `ProcessRunner.run(command: string, args: string[], options): Promise<ProcessResult>`, `resolveMediaTools(options): Promise<MediaToolPaths>`, shared contracts and typed `VideoPipelineError`.

- [ ] Write tests proving explicit paths win, missing tools produce `TOOL_NOT_FOUND`, arguments with spaces/metacharacters reach a no-shell injected runner unchanged, and FACE_AWARE is represented as unsupported capability.
- [ ] Run `npm test -- packages/persona-video/src/process-adapter.test.ts` and confirm failures are missing exports/behavior.
- [ ] Add minimal contracts and Node `spawn` process adapter; install only `ffmpeg-static` and `ffprobe-static` as dev dependencies when PATH lookup fails.
- [ ] Run targeted tests, `npm run typecheck`, then `npm test`.
- [ ] Commit `feat(persona-video): add processing contracts and tool adapter`.

### Task 2: Video probe and normalized metadata

**Files:**
- Create: `packages/persona-video/src/probe.ts`
- Create: `packages/persona-video/src/probe.test.ts`

**Interfaces:**
- Consumes: `ProcessRunner`, `MediaToolPaths.ffprobe`, input path.
- Produces: `probeVideo(input): Promise<VideoMetadata>` and `parseProbeJson(raw, stat): VideoMetadata`.

- [ ] Write literal ffprobe fixture tests for vertical video with audio, horizontal video without audio, rational FPS, rotation metadata, nullable bitrate/creation time and malformed JSON.
- [ ] Run the targeted test and confirm expected missing-function failures.
- [ ] Implement ffprobe invocation and normalization without deriving expected test values through production helpers.
- [ ] Run targeted tests, typecheck and full suite.
- [ ] Commit `feat(persona-video): probe video metadata`.

### Task 3: Technical QA and decode verification

**Files:**
- Create: `packages/persona-video/src/technical-qa.ts`
- Create: `packages/persona-video/src/technical-qa.test.ts`

**Interfaces:**
- Consumes: `VideoMetadata`, process adapter, ffmpeg path and QA thresholds.
- Produces: `runTechnicalQa(input): Promise<VideoTechnicalQA>` with machine-readable findings and PASS/WARNING/FAIL.

- [ ] Write tests for missing video, absent audio warning, invalid dimensions/FPS/duration, anomalously short file, unsupported decode and corrupt full-decode failure after a successful probe.
- [ ] Run the targeted test and confirm correct failures.
- [ ] Implement deterministic severity aggregation plus `ffmpeg -f null` decode verification.
- [ ] Run targeted tests, typecheck and full suite.
- [ ] Commit `feat(persona-video): add technical video QA`.

### Task 4: Objective segmentation and stable EDL

**Files:**
- Create: `packages/persona-video/src/segmentation.ts`
- Create: `packages/persona-video/src/segmentation.test.ts`
- Create: `packages/persona-video/src/edl.ts`
- Create: `packages/persona-video/src/edl.test.ts`

**Interfaces:**
- Consumes: duration, parsed silence intervals, optional timed transcript and segmentation policy.
- Produces: `detectSilence`, `buildObjectiveSegments`, `buildEditDecisionList` with KEEP/CUT/OPTIONAL decisions.

- [ ] Write tests for silencedetect parsing, leading/trailing cuts, bounded internal-pause shortening, overlapping transcript protection, adjacent range normalization and separate signal-source types.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement objective segmentation and EDL independent of FFmpeg rendering.
- [ ] Run both targeted files, typecheck and full suite.
- [ ] Commit `feat(persona-video): build objective segments and EDL`.

### Task 5: Transcript contract and captions intermediate

**Files:**
- Create: `packages/persona-video/src/transcription.ts`
- Create: `packages/persona-video/src/captions.ts`
- Create: `packages/persona-video/src/captions.test.ts`

**Interfaces:**
- Consumes: `TranscriptProvider | null` and timed transcript segments.
- Produces: deterministic test provider, unavailable transcript result, `captionsToSrt(transcript): string`, validated caption cues.

- [ ] Write tests for provider independence, unavailable STT, stable cue ordering, timestamp formatting, multiline sanitization and invalid/overlapping ranges.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement the provider contract, deterministic adapter and SRT serializer without production fake transcription.
- [ ] Run targeted tests, typecheck and full suite.
- [ ] Commit `feat(persona-video): add transcript and caption contracts`.

### Task 6: Real rough-cut renderer

**Files:**
- Create: `packages/persona-video/src/render-utils.ts`
- Create: `packages/persona-video/src/rough-cut.ts`
- Create: `packages/persona-video/src/rough-cut.test.ts`
- Create: `packages/persona-video/test/fixture.ts`

**Interfaces:**
- Consumes: input metadata, KEEP EDL entries, process adapter and destination path.
- Produces: `renderRoughCut(input): Promise<VerifiedMediaOutput>` and atomic temp-to-final output helper.

- [ ] Generate real short audio+video and video-only fixtures in temp directories; write integration tests for a shorter playable output, preserved audio when present, video-only support, non-overwritten existing output on failure and unchanged input hash.
- [ ] Run the targeted test and confirm missing renderer failure after fixture generation.
- [ ] Implement trim/atrim/concat H.264/AAC rendering and probe-before-rename verification.
- [ ] Run targeted integration tests, typecheck and full suite.
- [ ] Commit `feat(persona-video): render real rough cuts`.

### Task 7: Audio analysis and safe normalization

**Files:**
- Create: `packages/persona-video/src/audio.ts`
- Create: `packages/persona-video/src/audio.test.ts`

**Interfaces:**
- Consumes: audio-bearing media, thresholds and process adapter.
- Produces: `analyzeAudio(input): Promise<AudioAnalysis>` and `normalizeAudio(input): Promise<VerifiedMediaOutput>`.

- [ ] Write real-fixture tests for no-audio state, quiet speech warning, clipping risk, parsed loudness/peak values and normalization that leaves the source hash unchanged.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement FFmpeg analysis parsing and conservative generated-output normalization.
- [ ] Run targeted tests, typecheck and full suite.
- [ ] Commit `feat(persona-video): analyze and normalize audio`.

### Task 8: Vertical master and platform variants

**Files:**
- Create: `packages/persona-video/src/reframe.ts`
- Create: `packages/persona-video/src/reframe.test.ts`
- Create: `packages/persona-video/src/exports.ts`
- Create: `packages/persona-video/src/exports.test.ts`

**Interfaces:**
- Consumes: rough cut, metadata, CENTER or MANUAL_REGION instruction and configurable `ExportPreset[]`.
- Produces: verified 9:16 master and named Instagram Reels, YouTube Shorts and VK Clips outputs.

- [ ] Write real-fixture tests for preserving vertical composition, center-cropping horizontal input, validating manual regions, rejecting FACE_AWARE, retaining/no-audio behavior and custom preset arguments.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement only CENTER and MANUAL_REGION plus configurable MP4 presets.
- [ ] Run targeted tests, typecheck and full suite.
- [ ] Commit `feat(persona-video): export vertical platform variants`.

### Task 9: Pipeline orchestration and CLI harness

**Files:**
- Create: `packages/persona-video/src/pipeline.ts`
- Create: `packages/persona-video/src/pipeline.test.ts`
- Create: `packages/persona-video/src/cli.ts`
- Create: `scripts/persona-video.mjs`
- Modify: `package.json`
- Create: `packages/persona-video/README.md`

**Interfaces:**
- Consumes: Task 1–8 functions through `VideoProcessingRequest`.
- Produces: `processVideo(request): Promise<ProcessedVideoResult>` and `npm run persona:video -- <input-file> [--output <root>]`.

- [ ] Write tests for unique run directories, ordered progress states, required JSON/media artifacts, structured failure reports, no overwrite on repeated input and CLI non-zero failure.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement orchestration, JSON serialization, report, CLI parsing and usage documentation.
- [ ] Run targeted tests, typecheck and full suite.
- [ ] Commit `feat(persona-video): add reproducible pipeline CLI`.

### Task 10: Real end-to-end acceptance and integration contract

**Files:**
- Create: `packages/persona-video/src/persona-adapter.ts`
- Create: `packages/persona-video/src/persona-adapter.test.ts`
- Create: `packages/persona-video/src/pipeline.e2e.test.ts`
- Create: `docs/PERSONA_VIDEO_PIPELINE.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: a Persona shooting-result-shaped request and the full pipeline.
- Produces: `toVideoProcessingRequest`, documented ownership/failure/retry/progress contract and automated real-media acceptance evidence.

- [ ] Write tests for the narrow Persona mapping and an E2E test that generates a real fixture, runs the full engine, probes every output, validates 9:16 geometry/audio/duration/SRT/JSON and proves the input hash unchanged.
- [ ] Run the E2E test and confirm failure before the adapter/orchestration wiring exists.
- [ ] Implement the minimal adapter and final documentation; ignore generated run directories and fixture media.
- [ ] Run `npm test -- packages/persona-video/src/pipeline.e2e.test.ts`, `npm test`, `npm run typecheck`, `npm run api:typecheck`, `npm run web:build`, and `git diff --check`.
- [ ] Run the CLI once against a generated fixture outside Git and retain its run directory for the final report.
- [ ] Commit `test(persona-video): prove real pipeline end to end`.

## Self-review

- Spec coverage: every required V0 stage maps to Tasks 1–10; production STT, face-aware framing, subtitle burn-in and publishing remain explicit external/future capabilities.
- Step scan: each task owns one independently reviewable behavior set and names its RED/GREEN commands and commit.
- Type consistency: Tasks 2–10 consume the contracts and process adapter from Task 1; the pipeline consumes only public functions produced by prior tasks.
- Review focus: shell safety, partial corruption, transcript-protected cuts, no-audio media and atomic output safety each have a named test in the owning task.
- Proportion: the plan fixes interfaces and observable tests while leaving implementation bodies to TDD.
