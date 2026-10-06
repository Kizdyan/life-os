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
