# Persona Video Engine V1: Real Input Improvement Design

## Status

Approved design direction for a focused V1 milestone. The milestone improves the same immutable
`IMG_6873.mp4` used by the accepted V0 run. It does not introduce a new test input, overwrite V0
artifacts, merge to `main`, or promote a production deployment.

## Objective

Prove three improvements on the existing real user video:

1. real Russian speech-to-text, provider-neutral timestamps, non-empty SRT, and a real captioned
   video output;
2. real two-pass speech loudness normalization with measured before/after evidence and true-peak
   protection;
3. safer objective trimming that removes technical micro-segments while preserving speech,
   natural pauses, and configurable head/tail breathing room.

The engine remains a deterministic technical-processing layer. It is not a monolithic replacement
for Descript, Runway, CapCut, or future creative tools.

## Immutable local-first requirements

These requirements govern every V1 implementation choice and may not be weakened by a task-level
decision:

- The critical path is `LOCAL-FIRST / ZERO-CREDIT`. It must work without paid APIs, credits,
  monthly minutes, external usage quotas, or cloud authorization.
- The complete required local path is input video -> FFmpeg/ffprobe -> Whisper.cpp local STT ->
  canonical transcript -> EDL/trim -> FFmpeg loudness normalization -> captions -> clean master ->
  captioned master -> platform outputs.
- Descript, Runway, CapCut, and all future cloud providers are optional enhancements. Their absence,
  error, authorization failure, or exhausted quota must not block the local path.
- Provider selection is deterministic: an explicitly allowed and available external enhancement may
  run first; otherwise processing falls back to the configured local provider. The required V1 STT
  fallback is `WhisperCppTranscriptProvider`.
- Canonical Persona data remains provider-neutral. Provider-native payloads are diagnostic run
  artifacts only.
- Every provider report records `providerUsed`, `fallbackOccurred`, `fallbackReason`,
  `quotaDependency`, `localProcessing`, and `externalCostRequired`. A fully local run must report
  `quotaDependency=false` and `externalCostRequired=false`.
- Whisper.cpp executables and models are never committed. Paths are configurable, and local setup is
  documented with a reproducible cache/bootstrap strategy.
- V1 uses the same `IMG_6873.mp4` as V0, preserves the input hash, and preserves all V0 artifacts.
- V1 does not implement Persona Creative Router, Descript, Runway, CapCut, face-aware tracking,
  artistic take selection, publishing OAuth, or UI.

## Architectural boundary

Persona Video Engine owns immutable-input technical processing, canonical provider-neutral media
contracts, deterministic local fallbacks, run artifacts, and evidence. It may call a provider through
a capability interface, but it must not persist provider-specific response objects as canonical
Persona data.

Future creative routing is a separate `PERSONA CREATIVE ROUTER` milestone. That router may select
Descript for transcription, captions, filler removal, Studio Sound, or talking-head editing; Runway
for advanced or generative media work; vidIQ for research and performance capabilities; and CapCut
for downstream creative polish when a suitable programmable integration is proven. V1 neither
implements nor claims those integrations.

## Provider and capability model

### Shared provider description

Providers expose a provider-neutral descriptor:

```ts
type ProviderExecution = "LOCAL" | "EXTERNAL";

interface CapabilityProviderDescriptor {
  id: string;
  execution: ProviderExecution;
  capabilities: readonly MediaCapability[];
}

type MediaCapability =
  | "TRANSCRIPTION"
  | "CAPTION_TIMING"
  | "LOUDNESS_NORMALIZATION"
  | "AUDIO_ENHANCEMENT";
```

IDs are extensible strings rather than a closed production enum. V1 uses
`whisper-cpp-local` and `ffmpeg-loudnorm`. Future descriptors may use `descript` or another external
provider without changing the pipeline's canonical contracts.

### Transcript provider

The existing `TranscriptProvider` abstraction remains the pipeline boundary. It is extended with
descriptor, availability, and provider-neutral result metadata:

```ts
interface TranscriptProvider {
  readonly descriptor: CapabilityProviderDescriptor;
  availability(): Promise<ProviderAvailability>;
  transcribe(input: TranscriptProviderInput): Promise<TranscriptProviderResult>;
}
```

`TranscriptProviderInput` contains the extracted audio path, requested language, artifact directory,
and an injected process runner. `TranscriptProviderResult` contains only the canonical transcript,
generic confidence/limitation metadata, and optional paths to diagnostic provider artifacts. Raw
provider output stays inside the filesystem run and is never embedded in canonical Persona state.

The canonical transcript remains:

```ts
interface Transcript {
  language: string | null;
  provider: string;
  confidence: number | null;
  limitations: string[];
  segments: Array<{
    startMs: number;
    endMs: number;
    text: string;
    confidence: number | null;
  }>;
}
```

These fields are provider-neutral. A provider that cannot supply confidence returns `null`; it does
not invent a value.

### Capability-driven transcript selection

`TranscriptProviderChain` accepts ordered providers. It checks availability and tries permitted,
higher-quality external providers first. Provider unavailability or a provider execution error is
recorded as an attempt and does not block the next provider. The local Whisper.cpp provider is the V1
fallback.

The transcript resolution report records:

- providers considered in order;
- availability and attempt status;
- sanitized error code/message for failed attempts;
- `providerUsed`;
- `fallbackUsed`;
- canonical transcript and diagnostic artifact paths.

If all providers fail, technical processing may still produce non-captioned artifacts, but the
transcript result is explicitly unavailable. The V1 real-input acceptance run requires a non-empty
transcript and therefore fails its acceptance check if the local fallback does not succeed.

### Audio provider seam

V1 defines an `AudioProcessingProvider` boundary with provider descriptor and result metadata. The
mandatory baseline is `FfmpegLoudnessNormalizer`, which provides deterministic local loudness
normalization. Optional future enhancement providers, including Descript Studio Sound, may run as a
separate enhancement layer. Their failure must leave the normalized local baseline usable.

V1 does not implement an external audio provider or creative audio routing.

## Real local Whisper.cpp fallback

`WhisperCppTranscriptProvider` is the only concrete STT provider added in V1. It runs `whisper-cli`
through the existing process adapter and receives explicit executable and model paths. Resolution may
also use environment configuration. Neither the executable nor model is committed to Git.

The V1 real run uses a multilingual Whisper `small` model with Russian selected explicitly. Runtime
and model versions/hashes are written to the report. Before transcription, FFmpeg creates and retains
`stt-input.wav` in the run directory as 16 kHz mono PCM. Whisper full JSON is retained as a diagnostic
artifact. The adapter maps it to the canonical transcript and validates ordered, non-overlapping,
positive timestamp ranges and non-empty text.

No user-written text, deterministic fixture transcript, or manually authored transcript may be used
for the real-input acceptance run.

## Captions and captioned output

The canonical source transcript keeps source-media timestamps. After the final EDL is built, caption
cues are intersected with KEEP ranges and retimed to output time. `captions.srt` must be valid UTF-8,
contain at least one cue, and contain recognized Russian text.

The clean normalized `vertical-master.mp4` remains available. A separate
`captioned-vertical.mp4` burns the real SRT into the normalized master using FFmpeg. The caption style
is deterministic and functional: readable Cyrillic font, white text, dark outline/background, and a
lower safe-area position. Font family and basic layout are configurable technical parameters, not an
artistic editing system.

For the V1 CLI acceptance run, platform outputs are derived from the captioned master. The report
states the source artifact used for each platform export.

## Two-pass loudness normalization

The rough cut is preserved unchanged as `rough-cut.mp4`. Its audio is measured before normalization.
FFmpeg `loudnorm` runs in two passes: the first pass supplies measured loudness parameters and the
second renders `normalized-rough-cut.mp4` with a configurable target. The V1 speech/social preset is:

- integrated loudness: `-16 LUFS`;
- true peak: `-1.5 dBTP`;
- loudness range target: `11 LU`.

The normalized file is measured again. `audio.json` and `report.json` record provider used, target,
before and after measurements, whether normalization was applied, and whether clipping risk remains.
The pipeline rejects a normalization artifact that has no audio, cannot be decoded, or exceeds the
configured true-peak safety bound. The original input and original rough cut are never modified.

The normalized rough cut becomes the input for vertical, captioned, and platform outputs.

## EDL hygiene

Speech ranges from the real transcript protect overlapping audio from silence-based cuts. Objective
silence detection remains the only automatic editing signal in V1; there is no artistic take
selection or filler-word removal.

The default V1 trim policy is configurable:

- minimum meaningful content: `200 ms`;
- leading breathing room: `150 ms`;
- trailing breathing room: `300 ms`;
- maximum fully preserved internal silence: `1200 ms`;
- preserved portion of a longer internal pause: `300 ms`.

A content segment shorter than the minimum is reclassified as technical micro-content only when it
does not overlap canonical transcript speech. Adjacent silence ranges are then normalized. Leading
and trailing silence retain their configured breathing room next to meaningful content. Internal
pauses within the existing limit remain untouched; longer pauses keep the existing short natural
pause. This avoids aggressive jump cuts and prevents a technical tail such as
`33.684-33.700` from becoming a separate meaningful KEEP range.

Every EDL decision records a provider-neutral reason, confidence, and signal source. New reasons
distinguish micro-content cleanup and breathing-room preservation from ordinary silence cuts.

## Pipeline order

The V1 real-input flow is:

```text
immutable input
  -> metadata and technical QA
  -> retained STT WAV
  -> capability-selected transcript provider
  -> canonical transcript and provider attempt report
  -> transcript-protected objective segmentation
  -> hygienic EDL with breathing room
  -> retimed SRT
  -> rough cut
  -> before measurement
  -> two-pass local loudness normalization
  -> after measurement
  -> clean vertical master
  -> captioned vertical output
  -> captioned platform outputs
  -> report and artifact verification
```

## Artifacts and report

V1 creates a new unique directory under `output/persona-video/iphone-input-test-v1/`. It does not
reuse or overwrite the accepted V0 run.

Required V1 artifacts are:

- `metadata.json` and `qa.json`;
- `stt-input.wav`;
- provider diagnostic JSON;
- canonical `transcript.json`;
- `segments.json` and `edit-decision.json`;
- non-empty `captions.srt`;
- `rough-cut.mp4`;
- `audio.json` and `normalized-rough-cut.mp4`;
- `vertical-master.mp4`;
- `captioned-vertical.mp4`;
- Instagram, YouTube Shorts, and VK Clips outputs;
- `report.json`.

The report identifies the actual transcript and audio providers, provider fallback attempts, runtime
versions, model hash, input hash, EDL decisions, before/after loudness, caption status, and verified
media metadata.

## Failure behavior

- An unavailable or failed external transcript provider records an attempt and falls through to the
  local provider.
- A failed local transcript provider records the failure and produces an unavailable transcript;
  the V1 acceptance command treats that as failure.
- Provider-specific malformed output is rejected before it reaches canonical transcript data.
- Loudness normalization failure leaves the input and rough cut intact and fails the V1 pipeline run;
  it never silently labels unnormalized audio as normalized.
- Caption rendering failure leaves clean normalized outputs and diagnostic artifacts intact and fails
  the V1 acceptance run.
- All failures preserve the unique run directory and structured failure report.

## Test and commit strategy

Implementation proceeds through atomic TDD slices:

1. transcript provider descriptors, ordered fallback chain, Whisper.cpp adapter, canonical mapping,
   and real caption rendering;
2. FFmpeg two-pass normalization, after-measurement verification, and report evidence;
3. transcript-protected micro-segment cleanup and breathing-room EDL policy;
4. pipeline composition and the same-input V1 acceptance run.

Each slice starts with a failing test, implements only that slice, runs targeted and package tests,
and commits before the next slice. Final verification includes the persona-video suite, repository
regression suite, TypeScript checks, production build, full media decode/probe checks, input hash
comparison, and a measured V0-to-V1 report.

## Out of scope

- Descript, Runway, vidIQ, or CapCut integration implementation;
- `PERSONA CREATIVE ROUTER` implementation;
- face-aware tracking;
- filler removal or artistic take selection;
- generative or complex AI editing;
- OAuth publishing;
- new UI or Persona architecture;
- production promotion or merging to `main`.

## Acceptance evidence

The milestone is accepted only when the same `IMG_6873.mp4` produces a separate V1 run proving:

- real Russian transcript from the audio, with timestamps and honest confidence limitations;
- valid non-empty SRT and playable captioned output;
- measured loudness near the configured target with no clipping;
- no standalone technical micro-tail in the EDL;
- preserved natural pauses and breathing room;
- playable rough cut, normalized clean vertical master, captioned output, and Instagram-ready output;
- unchanged input SHA-256;
- a concrete V0-to-V1 comparison and explicit remaining human work.
