# Persona #212 / #220 production integration — 2026-11-21

Branch: `integration/persona-v14-production-20261121`, based on exact
`073889e901293538b01433dd8381ca109a11eda3` from #220. Technical improvements from
#218 at `c1ecd972970670d99dba5b89df7f54912b0827d9` are merged in
`d90e3ef294bcf0445eace3a50d6aa8c28b1cebff`. This is a stacked review branch;
neither main nor the original PR branches are changed. No live paid API call,
release publication, social publication or author approval was performed.

## Baseline evidence

All eight Actions runs on exact `073889e` completed successfully:

| Workflow | Evidence |
| --- | --- |
| core | [44922560563](https://github.com/Kizdyan/life-os/actions/runs/44922560563) |
| Media Brain CI | [44922560762](https://github.com/Kizdyan/life-os/actions/runs/44922560762) |
| Creative Studio Visual QA | [44922560637](https://github.com/Kizdyan/life-os/actions/runs/44922560637) |
| Windows real MP4 E2E | [44922560604](https://github.com/Kizdyan/life-os/actions/runs/44922560604) |
| Public Brand and Backup | [44922560573](https://github.com/Kizdyan/life-os/actions/runs/44922560573) |
| Carousel Publication ZIP | [44922560584](https://github.com/Kizdyan/life-os/actions/runs/44922560584) |
| deploy-readiness | [44922560641](https://github.com/Kizdyan/life-os/actions/runs/44922560641) |
| skills-and-marketing | [44922560630](https://github.com/Kizdyan/life-os/actions/runs/44922560630) |

Local Windows verification exposed an additional, reproducible failure that Linux
CI did not expose. On `073889e`, web typecheck reported TS1192/TS1149, five unit
tests failed and Vite could not find the default export. `PersonaFactory.tsx`
resolved `PersonaWeeklyContentCalendar` and `PersonaReferenceWorkflows` to their
similarly named lower-case `.ts` helpers instead of the `.tsx` components.
Commit `72ba0b9` makes those two component extensions explicit. The same local
checks then passed. No renderer or approval rule was weakened.

## Integrated behavior

- The existing research import, evidence review panel, SOURCE_PASS, caption,
  source invalidation and author content/design gates remain in Editorial Desk.
- Quiet Horror retains #218's eight distinct pre-generated backgrounds,
  Cormorant/Inter typography and draft status. These are library assets, not a
  claim of successful live image generation.
- Research backgrounds use the slide's authored visual direction and its existing
  text composition. They do not inherit Quiet Horror's slide-index layouts.
- Every paid background request requires a separate one-shot checkbox. The
  Worker independently rejects requests without `paidConsent: true`. Merely
  having a key does not authorize a request. Consent is consumed on each attempt.
- Missing key, Worker failure or invalid image response returns explicit BLOCKED;
  missing research visual direction returns NEEDS_INPUT. A failed generation
  does not silently replace the current draft image or invalidate approvals.
- Archive/image-free fallback remains available. Actual provider, model, prompt,
  time and SHA-256 are retained for generated images; library/archival images
  have distinct provenance. Export adds `image-provenance.json` alongside the
  existing caption and `research-sources.json`. Old saved image references still
  load; old image-free publication ZIP entries are unchanged.
- A response for an edited draft is not applied to its new revision. Generated
  bytes are checked against their saved SHA-256 before rendering/export.

## Reproduction and fixes

| Severity | Problem / reproduction | Fix / repeated verification |
| --- | --- | --- |
| MAJOR, fixed | Windows: run web:typecheck/unit/build on `073889e`; ambiguous component imports | Two explicit `.tsx` imports; all three checks pass |
| MAJOR, fixed | After resolving #218 conflicts, import research JSON, approve topic; source review panel was missing and content could not be approved | Restored #220 panel unchanged; SSR regression plus real mobile Chromium source-review/export pass |
| MAJOR, fixed | A configured key previously allowed a generation click without a separate spending opt-in | UI one-shot consent and server guard; tests prove zero fetch calls without consent |
| MAJOR, fixed | Research image prompts used a generic theater scene; renderer could use Quiet Horror's layout | Pass authored per-slide direction; retain research renderer; prompt and browser export tests |
| BLOCKER, open | Original seven-slide Jaws V14 ZIP/reference/copy not found | NEEDS_INPUT: actual path/link to the package, then source review, real export and per-slide comparison |
| BLOCKER for live image acceptance | Paid image calls are not authorized in this task | No paid calls; provider/mock contract tests are not live provider proof |
| MAJOR, environment | Local `media:test`: 264 PASS, 2 FAIL, 68 SKIP because FFmpeg/FFprobe are absent from this shell | Do not weaken tests; use exact-head Actions with real FFmpeg/Windows E2E for the integration verdict |
| MINOR | Vite warns about a bundle larger than 500 kB | Build passes; unrelated bundling refactor deferred |

## Real files produced, and their limits

Local evidence root: `G:/test-persona/persona-v14-production-20261121/`.
This path is a test-output location, not a hard-coded runtime dependency.

- `quiet-horror-integration/`: eight real Persona PNGs at 1080×1350,
  `contact-sheet-quiet-horror-v4.png`, caption, draft record, ZIP and `QA.json`.
  Preview/export bytes match; Cyrillic fonts load; body is 44–48 px; no artwork
  numbering or decorative lines. All eight background IDs differ. Visual
  inspection found no obvious clipping or malformed letters. This remains a
  review draft, not independent artistic approval or proof of every story fact.
- `research-fixture/`: eight real exported PNGs, mobile screenshot, contact
  sheet and ZIP. **Synthetic regression fixture** with example.org citations
  and a procedural archive image. Test-only checkbox actions are not human
  fact verification. It is neither Jaws V14 nor live generated artwork.
- `baseline-*.log`, `windows-fixed-*.log`, `final-*.log`: exact local check logs.

The V14 package was searched for in repository/project artifacts, read-only
synced source filenames, Downloads ZIPs, the Persona document folder,
`G:/test-persona`, issue #212/#220 attachments and connected Drive metadata
(`Челюсти`, `V14`, `Jaws`). No matching package was found. Do not manufacture its
seven texts, reference PNGs or a visual similarity score.

## Acceptance status and next action

| Stage | Status | Remaining evidence |
| --- | --- | --- |
| #220 baseline CI | PASS | Exact SHA links above |
| Existing Persona PNG/manual-source flow | PASS (regression scope) | Synthetic source fixture is not real research |
| #218 artwork/typography integration | PASS (technical), draft | Author visual approval remains separate |
| Live research and image providers | UNVERIFIED / no paid invocation | Explicit authorization and actual successful provider responses |
| Jaws V14 seven-slide production/comparison | BLOCKED / NEEDS_INPUT | Original ZIP, seven reference PNGs, copy/caption/source record |
| Publication | Not requested | Separate author permission |

Open Persona → Editorial Desk → research import. When the actual V14 package is
available, import its authored copy and source URLs, verify sources/caption as
the author, attach authored visual directions and use the archive or explicitly
authorize one paid image at a time. Review the exact PNG previews before design
approval; export the existing ZIP. No second editor or orchestrator is added.
