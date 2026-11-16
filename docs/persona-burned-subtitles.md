# Burned-in Reels subtitles

In Persona → Монтаж → local AI Worker, use **Вшить субтитры в MP4**.
New UI renders enable it by default. Existing videos and decisions are unchanged.

## Subtitle style collection (three independent presets)

Choose a caption style in **Persona → Music Studio → Стиль титров** or
**Persona → Монтаж → Local AI Worker → Стиль субтитров**:

| Selector value | User-facing label | Character |
|---|---|---|
| `cinematic` | Cinematic (Cormorant) | Original Cormorant Garamond Light, original geometry and color |
| `dynamic-interview` | Dynamic Interview (Montserrat) | Original Montserrat ExtraBold, original red emphasis and motion |
| `signature-gold` | Signature Gold · Quiet Luxury v1.0 | Gold `#8F6639`, 106% width, slightly heavier type, lower third, fade in/out, no backplate / shadow / outline |

The new configuration is at `tools/subtitle-signature-gold-v1/preset.json`. The font
resource used for portable FFmpeg rendering is the existing **pinned Cormorant
Garamond Light** TTF, with an ASS weight of 500 and horizontal scaling to 106%.
This avoids requiring an uninstalled font on Windows. **The original user-approved
example used Noto Serif Display ExtraCondensed Light, so its glyph shapes are not
pixel-identical to this portable preset**; approve the result visually before
treating it as a final look. No proprietary or unknown font asset is downloaded.

The `signature-gold` profile is **not a replacement** for the legacy styles.
The default remains `cinematic` for existing projects, CLI calls and workflows.
Selection travels from the UI through the local Worker and first-reel CLI
(`--subtitle-preset cinematic|dynamic-interview|signature-gold`) into the
actual FFmpeg/libass render. Subtitle style is independent from video color LUTs.

The actual start/end of each subtitle continues to follow author-reviewed cues;
fade-out is up to 330 ms, shortened automatically for very short utterances.
Timing is not silently stretched past a verified phrase boundary.

CLI opt-in: add `--burn-subtitles true` to `npm run media:ai:reel -- ...`.

AI Director now selects a configured color/subtitle style by default. Turn off
**Авто-режиссура (ИИ)** to choose Dynamic Contrast or Cinematic Autumn manually.
See [AI Director](persona-ai-director.md) for behavior and limitations.

The final MP4 is encoded through FFmpeg/libass after the color pass. Legacy text is
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
