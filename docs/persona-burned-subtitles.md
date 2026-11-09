# Burned-in Reels subtitles

In Persona → Монтаж → local AI Worker, use **Вшить субтитры в MP4**.
New UI renders enable it by default. Existing videos and decisions are unchanged.
CLI opt-in: add `--burn-subtitles true` to `npm run media:ai:reel -- ...`.

The final MP4 is encoded through FFmpeg/libass after the color pass. Text is
bold white Arial, 72px / 5px black outline at 1080×1920, scaled with output width,
centered horizontally at 66% of image height. Smart wrapping stays inside 10%
side margins. The text is 2–3 words per cue where possible; one-word utterances
are retained. No font download or bundled proprietary font is required. Actual
font selection, including a platform fallback, is recorded from libass output.

Short phrase timings are proportional within existing subtitle cue boundaries,
not independently measured word timestamps. Captions never extend beyond those
boundaries, including into B03 music tails. The author must check synchronization,
text accuracy, faces and safe areas. No automatic artistic approval is created.

`RESULT.json.subtitleBurnIn` binds the source and output SHA-256, style, cue
timings, selected font and report. `.ass` and `.persona-subtitles.json` sidecars
provide reproduction evidence. Technical QA runs against the final burned MP4.
The original audio is stream-copied. Originals and prior renders are not overwritten.
Explicit HDR tone mapping or rotation preparation is required before unsupported
HDR/rotated input can enter this burn pass; it does not silently convert them.

To apply the same pass to an already rendered local draft:

    node tools/persona-subtitle-burn.mjs source.mp4 captions.review.json NEW-output.mp4 "C:\path\to\ffmpeg\bin"
