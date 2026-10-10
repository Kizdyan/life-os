# Persona Creative Loop V1 — bounded implementation and next-stage design

**Sprint:** PERSONA CREATIVE LOOP V1 (separate draft PR, base `prototype/persona-quality-loop-v0`).
**Default cost:** `FREE_ONLY` with zero background/recurring paid AI calls. No automatic public publishing.

## Existing assets retained
- Authenticated Persona v3 Edge and atomic Shared Brain CAS are canonical. v3 signed HMAC approval and deterministic shooting remain intact.
- Original iPhone `PersonaFactory`, `PersonaShooting` and Life Tracker are kept; Creative V1 is additive.
- Existing `MediaAsset` and `ProcessingRun` contracts are future integration targets, not replaced.
- No production deploy, main merge, existing branch/project/folder rename, or user-as-QA process.

## Scope: one coherent, real vertical slice
1. Exactly **one primary + two distinct alternatives**, pre-edited from theatre, acting, and music; no fictitious trend evidence. Sources describe platform **formats** only. Official static format guidance expires after a bounded 180-day review window; market/trending evidence still expires after 7 days. Signed static-format approvals share this 180-day window, while market/trend approvals keep their 30-day authorization cap. The original evidence dates never roll forward automatically.
2. Select candidate and discuss in natural Russian through an Erika-labeled **deterministic editorial adapter**; supported topics: ending, humor (including a genuinely humorous ending rather than a generic replacement), no expert voice, natural tone, solo filming, hooks, and asking for an opinion. Combined explicit edit + opinion honors the edit. Vague “поменяй финал” and missing replacement request clarification, not an invented generic ending. Explicit open/humorous endings may use curated text. Unrecognized intent is explicitly declined, not hallucinated as completed. Feedback contains a reasoned Critic response.
3. Significant change creates **pending vN+1**. No inherited approval. A separate explicit user action triggers the server's deterministic Critic/Judge quality gate and a *new* HMAC signed approval. Version history keeps original, rationale, review, timestamp.
4. Shooting requires the **current signed version**. Adaptive conditions change camera/light/takes/location/solo-helper; brief schema is checked. Negated helpers (нет помощника / без оператора) remain genuinely solo. Primary shooting copy lists take count and seconds only once; camera and light have separate concise fields. Creates revision-bound `ShootingSession` with provenance; old sessions preserved.
5. `Загрузить материал`: actual media binary persists in IndexedDB on the current iPhone, **not merely a chat attachment**. Visible, counted and synchronized media must match the currently selected signed idea/version/session; delayed IndexedDB reads from a previous idea must never leak into another. Manifest and pending pipeline metadata persist via authenticated Edge in Shared Brain. Browser says **saved on this iPhone** rather than pretending it was uploaded to cloud. Binaries must be kept until remote storage exists. A successful offline local save must not display a network failure. Upload-failure cannot claim cloud success.
6. Canonical lineage on each asset: `projectId → contentItemId → ideaId/ideaVersion → sessionId → assetId`. Pending states for media QA, transcription, take scoring, segment selection, EDL/rough cut, captions, audio normalization and outputs. No fake edit or phantom publication.

## Weekly planning — design (not a fake working scheduler)
The week should show a capacity-limited pool of **up to 3–4 videos**, never automatically fill the quota. A candidate needs quality bar and available filming time. Each item should display status `idea → approved → needs shooting → captured → editing → ready → published`, a missing-assets checklist, shoot location/outfit, and dependencies. Group same location, lighting, outfit and performer into **one bounded capture block**, but keep content-item identity and individual briefs separate. Planner selects only feasible candidates; 1 strong post/week outranks daily low-quality filler.

## Next milestone: media intelligence
Donor video pipeline is not yet integrated. Next bounded PR: **on-device/source QA → transcription → score takes → select best segments/hook → one recommended rough cut + at most one alternative**, followed by caption/sound/export and platform variants. All actions must be traceable to exact asset IDs and human-approved candidate revision. Publish only after explicit user decision; do not automatically pay AI.

## CI_BUDGET_SAVER — deferred exact-HEAD acceptance (NOT a release claim)
Status: `USABLE_ARTIFACT / CI_DEFERRED`. Free GitHub Actions minutes for this private repository are exhausted; this is a CI-only limitation, not a reason to stop implementing. **Do not rerun intermediate commits, pay for runner minutes, or use the owner as QA.**

The checks below are **unverified for the current candidate HEAD**, not passes. Keep this list pending until one consolidated final run on the **same immutable commit SHA** (record SHA and actual artifact/log URL per gate):

- [ ] `core`: complete unit tests, deterministic regression tests, TypeScript checks.
- [ ] `deploy-readiness`: API typecheck, static production build, exact HEAD identity and Edge-only runtime contract.
- [ ] Chromium iPhone emulation: 320/375/390/430px geometry, safe areas, focus/keyboard, one primary action per stage, footer never obscures CTA.
- [ ] WebKit iPhone emulation: repeat the same geometry and real browser behavior separately; no inferred PASS from Chromium.
- [ ] Persona Creative V1 mobile: shortlist, one idea selection, isolated stages, clear nontechnical copy.
- [ ] Erika: vague prompt requests clarification **without changing version**, including a non-specific request to “поменяй финал”; mixed opinion + explicit edit honors the edit; humorous ending changes the final thought (not a generic ending); exact ending edit → critique/proposal → explicit approve → one new signed version; repeat identical edit stays no-op.
- [ ] Persistence/reload: exact edited script/proof survives reload, previous version proof fails, no forged approvals.
- [ ] Shooting: adapt solo/no tripod/poor lighting/7 minutes; «нет помощника» and «без оператора» never put a helper into the camera position; visible changed brief and signed version/session retained after reload; no duplicated takes/duration on primary iPhone screen.
- [ ] Real H.264 MP4 binary: iPhone IndexedDB commit → reload → byte count and SHA-256 identical, exact project/content/idea/version/session/asset lineage.
- [ ] Automatic classification: video primary/alternate, B-roll, photo, audio and reference heuristics; any uncertain classification is labelled an inference; optional correction only.
- [ ] Offline media: save binary with network down, restore online manifest automatically, no false cloud-upload claim, no cross-session metadata leak; after switching creative idea, all visible/countable assets belong to the current signed session.
- [ ] Render independent `*.onrender.com` Creative V1: real live page serves chosen **exact HEAD**, right Supabase Edge target, not a Vercel preview and no paid runtime dependency.
- [ ] Production/recovery rollout remains separately authorised; no merge or deploy based solely on source-level checks.

Offline verification before selecting final HEAD: inspect exact diff, review deterministic tests/contract, verify PWA mobile flow and risk of stale offline data, adversarial Critic rejection of misleading state, and ZERO-RECURRING-AI-COST (no paid inference/background jobs). Defer status `READY_FOR_PHYSICAL_ACCEPTANCE` until **all** applicable automated gates are genuinely green on the same HEAD.

## Safety and regressions
- Old and forged signatures rejected; previous revision signature cannot start current Creative session.
- `pending` proposal never actionable; optimistic edits have no HMAC.
- Stale evidence, quota 429, invalid tokens, bad upload metadata, mismatch/replayed asset ID fail closed.
- CAS conflict retries; old sessions retained; no video bytes in Shared Brain JSON.
- Existing physical acceptance remains valid only for the original prototype. Creative V1 needs independent mobile WebKit/Chromium + authenticated HTTP + local binary reload + exact HEAD runtime QA before `READY_FOR_PHYSICAL_ACCEPTANCE`.
