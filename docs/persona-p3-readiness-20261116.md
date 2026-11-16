# Persona P3 + B-roll Jump-Cut Readiness (2026-11-16)

## Status and limitations

- New P3 Python 3.11 components live in `tools/`: `coverage_inspector.py`, `approved_moments_library.py`, `production_economics.py`, `creative_style_contract.json`, `creative_style_validator.py`.
- The existing **reviewed B-roll engine** `tools/persona-approved-broll.mjs` and author review kit are **reused**, not replaced. Video is inserted only after source SHA-256, rights and editorial approval; it retimes subsequent captions and requires a fresh QA.
- New `tools/persona-intercut-planner.mjs` identifies **possible** Jump Cuts using known source timing or explicit author metadata. It cannot infer actor blocking/scene meaning from file names. A verified, reviewed B-roll candidate is delegated to the existing engine. Absent one, a mild `slow_push_in` fallback may be proposed and requires shot/framing review. It is **not proof** that the Jump Cut has become imperceptible.
- The existing timeline FFmpeg renderer accepts an explicitly author-reviewed `intercutFallback` on a clip and implements it with bounded `zoompan` (max 1.04, typically 1.025, max .65 s); it keeps the number of frames and source audio unchanged.
- Shot List now provides optional 1.5-second `bRollIntent` hints. These are pre-shoot instructions, not claims footage exists or a change to scripted timing.
- ProductionJob exposes P3 CLI gates, but legacy batch operations are not automatically blocked by **absent** approved shot lists or unconfirmed render intents. Enable strict style protection with `PERSONA_P3_REQUIRE_STYLE=1` and supply `--style-intent`.

## Setup (Windows PowerShell)

```powershell
py -3.11 -m unittest discover -s tools -p "test_p3_modules.py" -v
node --test tools/persona-intercut-planner.test.mjs tools/persona-p3-adapter.test.mjs tools/persona-p3-production.test.mjs
```

## P3 ProductionJob CLI

When a job has reached `ANALYZING` after verifying its input, prepare an **author-approved immutable** Production Brief and source hash-bound `bindings.json`. Then:

```powershell
$hash=(Get-FileHash .\brief.json -Algorithm SHA256).Hash.ToLower()
node tools/persona_orchestrator.mjs coverage ".\private-media\jobs\my-job" --brief ".\brief.json" --bindings ".\bindings.json" --approval-sha256 $hash
```

`COVERED` for every scene allows `EDITING`. `REVIEW`, `MISSING`, `DEFECT` leave the job in `ANALYZING` for honest recovery. This gate does not auto-approve scenes.

During `EDITING`, propose already approved moments and check the resolved style:

```powershell
node tools/persona_orchestrator.mjs moments ".\private-media\jobs\my-job" --file "master.mp4" --kind acting
node tools/persona_orchestrator.mjs style ".\private-media\jobs\my-job" --plan ".\effective-render-intent.json"
```

The style plan must be generated from *actual* effects, color and captions of the renderer, not a hand-written declaration. The contract must block unsupported effects.

To opt into real economics stage logging during Cinematic Calm Batch:

```powershell
$env:PERSONA_P3_ECONOMICS="1"
node tools/persona_orchestrator.mjs batch ".\private-media\jobs\music-job" --count 3
```

An `economics.sqlite3` report is generated; calculated savings remain **UNVERIFIED** until real accepted MP4s, baseline and all manual work are recorded.

## B-roll and fallback operation

1. Generate the current Persona asset catalog and shot-matching report, with exact source hashes.
2. Run `npm run persona:broll:review -- ...` to show actual preview clips.
3. User approves only suitable clips, confirms rights, and saves selection JSON.
4. Existing `npm run persona:broll -- render ...` produces real MP4 and shifted caption sidecars. No automatic publication.
5. For identified Jump Cuts without an approved B-roll choice, `proposeIntercuts` emits `ZOOM_FALLBACK_CANDIDATE`. After preview and consent, `applyReviewedZoomFallback` adds `intercutFallback` to the exact preceding clip in a fresh EditPlan; the standard renderer applies gentle zoom.
6. If it is music-first footage or crop is unsafe, prefer `NEEDS_REVIEW`, not a forced zoom or invented cutaway.

## Acceptance evidence

- Python P3 local unit tests: 12/12 PASS on synthetic FFmpeg MP4s (Linux/Python 3.13).
- Node planner tests: 5/5 PASS; Node P3 bridge tests: 3/3 PASS.
- FFmpeg zoompan smoke: 2.000 s, 60 video frames at 30fps, audio stream present.
- New CI steps request Python 3.11 and the integrated Node P3 suite.
- Full existing tests **not yet confirmed**; on the baseline main commit a pre-existing core Media test failed with `needs-manual-transcript-review` vs `awaiting-author-review`. This must be treated separately, without weakening Whisper safety.
- Windows end-to-end and artistic acceptance **UNVERIFIED** until tested on actual authorized materials.

Do not merge this draft into main before checking workflow results, Media/StylePack/Batch/Cache regressions, and author-reviewed output.
