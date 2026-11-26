# Fridge-hum carousel: V1 / V2 author review

Base: PR #222, `c5b312c`. Status: **DRAFT / NEEDS_AUTHOR_REVIEW**.
The author's V1 technical acceptance is preserved; artistic feedback was
NEEDS_REVISION. Neither revision has publication permission.

## Open the material

Persona → Editorial Desk → **V2 · музыка под видом шума**.
The existing review section switches between **V1 without changes**, **V2 cover A**
and **V2 cover B**. Existing drafts and edits are selected, never overwritten.
Use the existing review ZIP button; publication gates remain unchanged.

CI artifact **persona-editorial-v1-v2-review** contains:

* `v1/`, `v2/`: seven 1080×1350 PNGs each, contact sheet, caption, source evidence,
  per-image provenance and browser QA.
* `cover-b/slide-01.png`, `cover-comparison.png`: an alternate first screen.
* `v1-v2-comparison.png`: labelled comparison, with labels outside artwork.
* `fridge-hum-V2-REVIEW.zip`: V2 plus alternate cover and caption/source/provenance.
* `fridge-hum-V1-V2-REVIEW.zip`: both editions for review.
* `comparison-QA.json`, `worker-image-contract.json`: technical evidence;
  the latter explicitly labels the upstream provider MOCKED, not live generation.

Local root:
`C:/Users/Kostya/.codex/.chatgpt-projects/g-p-6aa138b77ffc81919a6d3ab4c0758bc3/artifacts/persona-editorial-quality-v2-20261122/`.
Original V1 outputs and ZIP remain untouched at
`G:/test-persona/persona-production-sprint-20261121/carousel/`.
All seven re-exported V1 PNG hashes were compared with those originals and match.
V1 content/config and the seven source illustrations were not edited.
Fresh review-export timestamps are not presented as the historical archive's bytes.

## Editorial revision

Cover A: **«Музыку спрятали в гуле холодильника.»**

Cover B: **«Зачем триллеру частота холодильника?»**

Both name the film below the headline. Text is above the protected coin, rather
than crossing it. A is the working editorial preference, not an author decision
or a measured A/B winner. B remains available for review.

The sequence now advances through seven beats:
hook → the coin threat → 60 Hz → rejected percussion / sustained tones → early
collaboration → removal of musical reassurance → a concrete acting interpretation.
The final slide avoids an invented division of responsibilities between sound
editor and composer. Its acting task—seek an answer from the partner during a
pause—is explicitly labelled personal interpretation. It is a proposed draft
voice, not a claim that the author has endorsed that advice.

V2 uses the saved V1 illustrations. Persona itself reframes and adjusts light:
wide station, fridge detail, brighter bronze close-up, closer sound room, door,
and large final coin. Source pixels are preserved. This is **not** seven newly
generated pictures. Canvas still renders all Cyrillic text. No internal page
numbers or AI text are added to the individual PNGs.

## Source checking

[Carter Burwell: No Country For Old Men](https://www.carterburwell.com/projects/ncfom/)
contains both the composer's notes and Dennis Lim's *Exploiting Sound, Exploring
Silence*, The New York Times, 6 January 2008. The original NYT URL could not be
opened during this check; attribution states that the article was read on the
composer's site.

* Lim reports the threatening coin-flip scene and the swelling musical hum tuned
  to the refrigerator's 60 Hz.
* Burwell's notes discuss rejecting percussion as familiar and choosing sustained
  tones, including singing bowls; no recorded percussion demo is invented.
* Notes/reporting support early exchange with Skip Lievsay and the comparison
  with customary meetings at the final mix.
* Lievsay's explanation supports removing the familiar reassurance of a score.
* The acting conclusion is interpretation, not attributed filmmaker intent.
* No claim about the hum stopping at the coin reveal is included.

Checked copy has a bound audit. Edited text becomes NEEDS_RECHECK. Source review,
content approval and visual approval remain separate human decisions.

## Independent artistic critique

This is qualitative expert judgement, **not** evidence of views, retention,
sales, publication effectiveness or author approval. The reviewer inspected
contact sheets, full-size covers, slides 4–7, and the source page.

| Criterion | V1 | V2 |
|---|---|---|
| Cold first screen | Unusual question, missing film context; title collides with coin. | Film named, shorter concrete proposition, subject clear of type. A preferred to the more technical B. |
| Desire to continue | Mystery loses energy at “ordinary station”; several general statements. | Coin threat, frequency, rejected alternative and collaboration offer successive reasons to read. |
| Dramaturgy | Last two screens dissolve into attractive abstractions. | Causal development and a professional conclusion; final return to the scene remains associative. |
| Industry value | Useful frequency fact, otherwise a broad popular account. | Actual decisions about genre and collaboration; specific acting task is marked as interpretation. |
| Light / composition | Coherent atmosphere, objects often buried in darkness. | Fridge, bowl, sound room and coin read better; shot scale varies. Still an intentionally limited series of amber interiors. |
| Readability | Legible type, weaker placement and hierarchy. | Clear hierarchy and safe bounds; the final orphan word was removed with intentional line breaks. |
| Ending | Question about the music/noise boundary without a new working insight. | Shared scene-building and a concrete pause task, without falsely assigning isolated production roles. |

Critique led to two substantive changes after the first V2 export: the bowl is
now named as the selected sustained-tone solution, and the final paragraph no
longer invents a rigid composer/sound-editor division. A single final word was
also rewrapped. The remaining visual limitation is deliberate reuse of a single
still-life/interior image family; further lighting tweaks are not claimed to
solve it. Author review is still necessary.

## Native Worker generation audit

Existing route: EditorialStudio's one-shot consent → requestEditorialBackground →
authenticated `/carousel-background` Worker → OpenAI Images → PNG validation →
browser decode / SHA-256 / IndexedDB → existing Canvas exporter.
There is no requirement for manual Codex image generation in that code path.

Safe fixes:

* Replace retired `gpt-image-1` with the documented Sunburst default; allow a
  reviewed server-side `PERSONA_CAROUSEL_IMAGE_MODEL`. Report the effective model,
  never credentials. [Official image API reference](https://developers.openai.com/api/reference/resources/images/methods/generate).
* Reject corrupt, truncated, oversized or invalid compressed PNG payloads before
  reporting READY. Browser decoding remains an additional check before storage.
* Unified startup now serves nested public JPG/JSON assets; it skips symlinks and
  blocks traversal. Importing its test helper does not start a Worker/browser.
* Actual V1 reuse is derived from image SHA/provider. Replacing a background does
  not falsely keep the V1-reuse claim. Render treatment has separate provenance.
* V2 layout/light/crop definitions participate in the design fingerprint, so a
  later hidden-config change invalidates an earlier visual approval.

**Live image generation: BLOCKED.** No key was present in the checked process or
the checked project `.env.local` files; no paid permission was granted or used.
The positive test uses a saved image and mocked upstream response. It proves the
local HTTP → storage → PNG contract, not model availability, quality or billing.
A permitted real request is still needed to prove complete runtime autonomy.

## Verification

The production browser checks both revisions and both cover candidates: seven
1080×1350 PNGs, real preview/export byte equality, Cyrillic copy, glyph bounds,
contrast ≥4.5:1, no numbering inside artwork, unchanged V1 record/approvals,
and normal publication export blocked. A separate real Worker with a mocked
provider verifies consent, persistence and rendering without a paid call.

Full suite counts and exact-head CI links are recorded in the PR after execution.
Technical PASS never changes the artistic or publication status.

Local verification completed: **654 Vitest PASS**, root/web/API TypeScript PASS,
production build PASS (existing large-chunk warning), **349 media tests PASS,
zero failed, five skipped**. All three actual browser exports and the mocked
Worker contract passed. Independent code review found two P2 defects (hidden
style definitions omitted from approval fingerprint; replacement images falsely
labelled as V1 reuse); both were fixed and independently rechecked. The final
artistic recheck found no remaining clipping, coin overlap or final orphan word.
