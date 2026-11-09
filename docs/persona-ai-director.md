# Local AI Creative Director

Persona → Монтаж → local AI Worker enables **Авто-режиссура (ИИ)** by default.
After Production Brief approval, the Worker sends only its spoken script text to
the configured local Ollama model. It accepts exactly `selected_preset: Dynamic`
or `selected_preset: Cinematic`. Offline models, malformed JSON and unknown values
are errors; there is no simulated or silent fallback. Disable auto mode for an
explicit manual choice. Use **Повторить анализ Qwen** after a transient error.
Expired receipts trigger fresh analysis before starting a render. No files are
uploaded to an external service.

`tools/visual-presets.json` contains two reproducible, allowlisted styles:

| Style | Color | Captions at 1080px width |
| --- | --- | --- |
| Dynamic Contrast | Contrast 1.10, saturation 1.03, restrained warm highlights and blue shadows | Arial Bold 72, black outline 5, yellow emphasis |
| Cinematic Autumn | Contrast 1.035, saturation .91, restrained ochre warmth and blue shadows | Arial regular 52, outline 1, up to 180ms fade |

These are user-requested starting directions, not validated reference matches or
adaptive skin corrections. Qwen analyses meaning in text; it does not inspect
pixels, skin, faces, lighting or acting. No geometry or generative retouching is
applied. The existing HDR/BT.2020 and rotation safety checks remain in force.
Audio is stream-copied through the grading and caption passes.

Dynamic emphasis uses the longest word of at least five characters in each short
phrase. This is a typography heuristic, not semantic keyword extraction by Qwen.
Phrase timing is proportional within existing cues, not new ASR word timing.
The actual system font/fallback is recorded by libass. Author review remains
necessary for timing, safe areas, readability and artistic suitability.

An authenticated `/direct` request returns a receipt bound to the full brief
SHA-256 and model. `/session` rejects missing, changed or older-than-30-minute
auto receipts. Concurrent requests for an identical brief share one inference;
another brief cannot take over that operation. The UI discards stale requests
on navigation and preserves project/brief checks when attaching results.

The existing editorial engine still selects only real ASR-confirmed candidates.
The selected direction maps to its cinematic/humor approach without changing
approved dialogue, scene order or inventing fragments. The explicit
`RESULT.json.visualDirection` governs the final visual style, superseding the
legacy editorial look suggestion when present. `AI-DIRECTOR.json` in worker
staging retains the model, raw decision, prompt version and script/brief hashes.
The color manifest binds source/output SHA-256 and filter parameters; subtitle
reports bind actual rendered cues and style. QA runs on the final MP4.

CLI uses the same rendering path with `--visual-preset Dynamic|Cinematic` and
`--burn-subtitles true`. Existing clients without direction options retain their
legacy flow. New browser jobs save the direction with their local result and
restore it after reload while that Worker session remains available.
Restarting the Worker still requires reopening/reimporting through its existing
session flow; browser storage contains metadata, not the large MP4.

Technical completion never grants publication or artistic approval.
