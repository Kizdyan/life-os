# Persona production: acceptance gates (2026-10-27)

Scope: Persona Factory / Production Engine. This checklist is separate from structural unit tests and does not authorize release or merging PR #112.

## Critical content defects found by source inspection

1. **Format mismatch:** `buildPersonaProductionBrief` emits the same 30-second talking-head script and 3-shot plan for `carousel`, `photo`, `reel`, `short`, and `story`. A carousel needs cards; a photo needs a still-image brief. Do not label these camera-ready.
2. **Script does not dramatize the idea:** the middle beat repeats `idea.angle` verbatim and the closing beat is a generic CTA. This is a deterministic placeholder, not a completed author-specific screenplay.
3. **Unsupported speech duration:** 18 seconds are allocated to an arbitrary-length `idea.angle`. The QA checks durations are positive, but does not check whether the line can be spoken in the allocated time.
4. **Fact review is an attestation, not verification:** `requires_fact_review` is applied to essentially all free-form hook/script lines. The UI checkbox allows a human to attest review, but does not collect sources or evidence. Never claim facts were independently verified.
5. **No real media processing:** choosing an image/video currently creates a local preview; the API receives the filename, not the media bytes. No analysis, rendering, face preservation, color grading or sound processing is performed.

## Acceptance cases

| Case | Input | Required outcome |
| --- | --- | --- |
| Narrative reel | Fictional scene with two characters and a reveal | Distinct character actions, dialogue, shots and edit beats; no generic advice CTA |
| Carousel | Educational sequence | 5–7 independently readable cards, not a talking-head shoot |
| Photo | Portrait | Shot and edit plan for one photograph; no 30-second video duration |
| Short title, long angle | 1,500-character author brief | No impossible 18-second spoken monologue; either estimate duration or ask for a shorter script |
| Personal fact | Unverified claim embedded in the idea | Explicit review required before approval; source or author attestation recorded |
| Rejection | Editor rejects after QA | Preserve all authored assets, record decision, return to revision |
| Source upload | Real video with audio | Distinguish local preview from server-side analysis; never claim media was processed |
| Color/identity | Portrait footage | Preserve geometry, face, eyewear and identity; transformations opt-in and visually compared |

## Release gate

Run unit tests, API typecheck, web build, browser E2E for each supported format, and one real-media QA pass with explicit author approval. Production and main remain unchanged until these gates are met.
