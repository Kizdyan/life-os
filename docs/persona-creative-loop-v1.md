# Persona Creative Loop V1 — bounded implementation and next-stage design

**Sprint:** PERSONA CREATIVE LOOP V1 (separate draft PR, base `prototype/persona-quality-loop-v0`).
**Default cost:** `FREE_ONLY` with zero background/recurring paid AI calls. No automatic public publishing.

## Existing assets retained
- Authenticated Persona v3 Edge and atomic Shared Brain CAS are canonical. v3 signed HMAC approval and deterministic shooting remain intact.
- Original iPhone `PersonaFactory`, `PersonaShooting` and Life Tracker are kept; Creative V1 is additive.
- Existing `MediaAsset` and `ProcessingRun` contracts are future integration targets, not replaced.
- No production deploy, main merge, existing branch/project/folder rename, or user-as-QA process.

## Scope: one coherent, real vertical slice
1. Exactly **one primary + two distinct alternatives**, pre-edited from theatre, acting, and music; no fictitious trend evidence. Sources describe platform **formats** only. Editorial fixture expires after 7 days and no source date is rolled forward automatically.
2. Select candidate and discuss in natural Russian through an Erika-labeled **deterministic editorial adapter**; supported topics: ending, humor, no expert voice, natural tone, solo filming, hooks, and asking for an opinion. Unrecognized intent is explicitly declined, not hallucinated as completed. Feedback contains a reasoned Critic response.
3. Significant change creates **pending vN+1**. No inherited approval. A separate explicit user action triggers the server's deterministic Critic/Judge quality gate and a *new* HMAC signed approval. Version history keeps original, rationale, review, timestamp.
4. Shooting requires the **current signed version**. Adaptive conditions change camera/light/takes/location/solo-helper; brief schema is checked. Creates revision-bound `ShootingSession` with provenance; old sessions preserved.
5. `Загрузить материал`: actual media binary persists in IndexedDB on the current iPhone, **not merely a chat attachment**. Manifest and pending pipeline metadata persist via authenticated Edge in Shared Brain. Browser clearly states binaries have *not* been uploaded to cloud and must be kept until remote binary persistence is built. Upload-failure cannot claim cloud success.
6. Canonical lineage on each asset: `projectId → contentItemId → ideaId/ideaVersion → sessionId → assetId`. Pending states for media QA, transcription, take scoring, segment selection, EDL/rough cut, captions, audio normalization and outputs. No fake edit or phantom publication.

## Weekly planning — design (not a fake working scheduler)
The week should show a capacity-limited pool of **up to 3–4 videos**, never automatically fill the quota. A candidate needs quality bar and available filming time. Each item should display status `idea → approved → needs shooting → captured → editing → ready → published`, a missing-assets checklist, shoot location/outfit, and dependencies. Group same location, lighting, outfit and performer into **one bounded capture block**, but keep content-item identity and individual briefs separate. Planner selects only feasible candidates; 1 strong post/week outranks daily low-quality filler.

## Next milestone: media intelligence
Donor video pipeline is not yet integrated. Next bounded PR: **on-device/source QA → transcription → score takes → select best segments/hook → one recommended rough cut + at most one alternative**, followed by caption/sound/export and platform variants. All actions must be traceable to exact asset IDs and human-approved candidate revision. Publish only after explicit user decision; do not automatically pay AI.

## Safety and regressions
- Old and forged signatures rejected; previous revision signature cannot start current Creative session.
- `pending` proposal never actionable; optimistic edits have no HMAC.
- Stale evidence, quota 429, invalid tokens, bad upload metadata, mismatch/replayed asset ID fail closed.
- CAS conflict retries; old sessions retained; no video bytes in Shared Brain JSON.
- Existing physical acceptance remains valid only for the original prototype. Creative V1 needs independent mobile WebKit/Chromium + authenticated HTTP + local binary reload + exact HEAD runtime QA before `READY_FOR_PHYSICAL_ACCEPTANCE`.
