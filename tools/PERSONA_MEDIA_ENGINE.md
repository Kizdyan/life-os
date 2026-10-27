# Persona Media Engine — local MVP

This is an **actual FFmpeg-based video processing command**, not an AI-generated editing instruction. It runs locally and does not upload media or call external models.

## Requirements

- Node.js (ES modules)
- `ffmpeg` and `ffprobe` available on `PATH`
- Source video in MP4, MOV, MKV, WebM or M4V, up to 2 GiB
- Output path must be a new `.mp4` file

## Commands

```bash
npm run media:probe -- "/path/to/source.mp4"
npm run media:render -- "/path/to/source.mp4" "/path/to/export.mp4" 3 12
npm run media:test
```

The example exports 12 seconds beginning at 3 seconds. On Windows, use quoted absolute paths such as `"D:\\Videos\\input.mp4"`.

## What is implemented

- Input file checks and real `ffprobe` metadata inspection
- Optional trim by start time and duration
- H.264 video, AAC audio if present, MP4 fast-start container
- Even output dimensions and standard pixel format
- Re-probing and duration verification of the exported file
- SHA-256 checksums of original and exported media
- JSON manifest next to the output (`.mp4.persona.json`)
- Source preservation, rejection of in-place editing and existing output names
- Integration test that synthesizes a short video and verifies export when FFmpeg is installed

## What is **not** implemented

This MVP is a **single-source trim/transcode tool**. It does not yet provide multi-clip timelines, automatic cuts, captions, color grading, speech cleanup, quality scoring, browser uploads, persistent media storage, or direct Persona UI rendering. The browser's metadata inspection is a separate feature. Do not label this a complete video editor or a publication-ready production pipeline.

## Acceptance criteria

Run `npm run media:test` on a machine with FFmpeg. Inspect a real original with `media:probe`, render an MP4, play it, and verify the manifest and source checksum. Also run `npm run typecheck`, `npm run api:typecheck`, `npm test`, and `npm run web:build` before merging.

No merge to main or production deployment without explicit approval. No paid AI usage.
