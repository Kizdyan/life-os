# Persona Video Pipeline V0

This package is a local, provider-neutral video-processing engine. It has no dependency on Persona UI/state, publishing, Supabase or Vercel runtime code.

Run it from the repository root:

```text
pnpm persona:video -- C:\path\to\input.mov --output C:\path\to\runs
```

The harness uses system `ffmpeg` and `ffprobe` first. If they are unavailable in a development checkout, the dev-only static packages supply the executables. Runtime callers can pass explicit tool paths through `VideoProcessingRequest`.

Each execution creates a unique run directory containing structured metadata/QA/segments/EDL/transcript/audio reports, captions, a rough cut, a vertical master and configured platform variants. Input files are read-only and never overwritten.

The transcript artifact keeps source timestamps; the SRT intermediate is retimed through the EDL so it follows the rendered output timeline.

Real speech-to-text and face-aware reframing are external capabilities. Without an STT provider, the engine emits an empty captions intermediate and a warning while completing technical processing.

## Local, zero-credit speech-to-text

V1 can use `WhisperCppTranscriptProvider` as the deterministic local fallback. The provider reads explicit paths from application configuration; a local harness should supply them from these environment variables:

```text
WHISPER_CPP_PATH=C:\tools\whisper.cpp\whisper-cli.exe
WHISPER_MODEL_PATH=C:\Users\you\.cache\persona-video\whisper\ggml-small.bin
```

Acquire `whisper-cli` from the official `ggml-org/whisper.cpp` release/build instructions and the multilingual `ggml-small.bin` model from the official `ggml-org/whisper.cpp` model repository. Keep the executable and model in a user cache or tools directory outside this repository. Binaries and model weights must never be committed.

The upstream model catalog identifies the multilingual `small` model with SHA-1 `55356645c2b361a969dfd0ef2c5a50d530afd8d5`. Verify a downloaded model in PowerShell before use:

```powershell
Get-FileHash -Algorithm SHA1 $env:WHISPER_MODEL_PATH
& $env:WHISPER_CPP_PATH --help
```

Every run records the model's SHA-256 in provider diagnostics. Provider-native JSON is retained as a diagnostic artifact; Persona persists only the provider-neutral canonical transcript.
