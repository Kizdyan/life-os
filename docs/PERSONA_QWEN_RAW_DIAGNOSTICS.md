# Persona / Ollama Qwen — inspect preserved invalid drafts without new AI calls

## Why this exists
The first real `qwen3:4b-instruct` benchmark on Windows (2026-10-30) responded in about 113 seconds, but validation stopped with `Некорректный кадр 4`. Without the original raw answer, it is **not known** whether the problem was `framing` or `durationSec`: the old validator combined both conditions into one error. The actual saved `*.raw-response.txt` file is required to know.

### Examine the **existing** local raw response for free, without running Ollama

From the project root in PowerShell, replace the file path with the actual file in the preserved run directory:

```powershell
npm run persona:scenario:diagnose -- "C:\Users\Kostya\AppData\Local\Temp\persona-qwen3-4b-benchmark-20261030-run4\acting-comedy.raw-response.txt"
```

Optional: add `--out "C:\Users\Kostya\AppData\Local\Temp\persona-qwen3-4b-benchmark-20261030-run4\frame-diagnostic-new.json"` to store a **new** report, without overwriting anything. The command does not contact any model or external network.

Possible outcomes:
- `FRAME_METADATA_CANONICAL`: camera framing and numeric timings are already in canonical form.
- `FRAME_METADATA_NORMALIZED`: one or more exact textual synonyms / explicitly numbered seconds can be converted without guessing.
- `REJECTED_FRAME_METADATA`: one or more ambiguous, missing or unsupported shot fields; report identifies frame index and the offending field.
- `REJECTED_INVALID_JSON`: the saved answer is not valid JSON.

**None** of these statuses means the complete screenplay is valid, approved or artistically strong. The full existing validator must still check spoken text, acting actions, shot instructions, durations, duplicates, and Production Brief schema.

## Conservative transformation policy
Only metadata with an unambiguous representation can change:
- `крупный план`, `close up` → `close-up`.
- `средний план`, `medium shot` → `medium`.
- `деталь`, `insert` → `detail`.
- `"4 секунды"` → numeric `4`.

Never replace unsupported `общий план` with a different shot type; do **not** invent missing timing, narration, actions, dramatic conflicts, turns or conclusions. A truly invalid frame is rejected, with its unchanged raw model response available for explicit human consideration.

On benchmark failures the updated runner stores `<case>.validation-diagnostic.json` (field, frame number, observed value), `<case>.raw-response.txt`, and `<case>.generation.json` when available. On successful and safely normalized output, `<case>.normalization.json` records each transparent conversion.

## One safe rerun after inspection
Only after analyzing the previous raw result, optionally execute:

```powershell
npm run persona:scenario:creative-benchmark -- --out "C:\Users\Kostya\AppData\Local\Temp\persona-qwen3-4b-benchmark-next" --model qwen3:4b-instruct --case acting-comedy --timeout-ms 180000
```

Create a **new, empty** directory name. The runner will not pull models, call paid APIs or replace the previous run. A generated JSON is not equivalent to a good screenplay.

## Verification
```powershell
npm run persona:scenario:local:test
npm run persona:scenario:creative-benchmark:test
npm run typecheck
npm run web:build
```

All new Node tests in this increment have been **authored**, but full Windows execution, live Qwen rerun and browser QA must be confirmed independently before merge. Do not call an unexecuted test PASS.
