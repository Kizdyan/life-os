# PERSONA 5 — Instagram Engine / First Real Publication, P0

**2026-10-13** · Isolated candidate branch `feature/persona-instagram-first-publication-p0`.
Source base: `recovery/iphone-static-supabase` @ `bfcfa84c7e1a579c8c029f777ddf57e711bba4a6`.
**Status:** `PREVIEW_AND_APPROVAL_IMPLEMENTED_IN_BRANCH / INSTAGRAM_NOT_CONNECTED / NOT_PUBLISHED / NO_PRODUCTION_RELEASE`.
Obtain the latest **exact HEAD** from GitHub branch before any future acceptance; do not treat the earlier commit as current after further fixes.

## Reuse; why previously broken

- Existing iPhone `App` routed to `PersonaFactory` only. `PersonaToday` could generate/editor-review/carousel-preview/share, but was **not in the main Persona screen**.
- Existing `shareApproved()` emitted SVG, opened native share/Instagram and did not receive or store Meta media ID. It was NOT Instagram Content Publishing API.
- Existing static iPhone PWA calls authenticated `life-os-runtime` Supabase Edge. `persona-ai.ts` previously depended on `/api/media/status`, absent from the static production origin; new routing uses `personaEdgeRequest` for Edge when configured.
- Existing authored `buildPersonaCarousel()` has three actor / music / creative-journey editorial drafts. P0 reuses these offline, strips internal Persona branding, adds an interactive continuation question, and runs existing deterministic `runFinalQA`. It explicitly says it is **not** an AI-generated draft.
- Main Persona screen now shows existing `PersonaToday` first; existing `PersonaFactory` video/shooting remains available in a collapsed secondary section, without a second backend.
- Existing approved content can export 1080×1350 JPEG files from the rendered SVG cards via on-device Canvas and Web Share, rather than unsupported SVG files. No media is silently published.
- Approval `setApproved(true)` is **not** recorded as an Instagram publication, and the existing used-idea history is no longer advanced on approval alone.

## First recommended material

**Carousel: «Почему я не хочу показывать только результат»** — six existing authored cards from `journey`, about actual work as an actor/musician (not relationships/health/family or invented casting credits). User can see and review text and cards before approval, and edit if the existing remote editor is available. Recommended because it can be fully prepared without filming.

## External transport / platform truth

The existing `PersonaPublicationJob`, `PersonaPublisher`, `MediaStateStore`, approvals and publication verification types are canonical. Added `InstagramPhotoPublisher` adapter for the existing protocol (single JPEG or 2–10 JPEG carousel, Graph container -> `FINISHED` -> `media_publish` -> separate GET external media ID/permalink verification). It requires:
- an **authorized Instagram professional account**, Graph publishing permission and server-side token, never browser secrets;
- public HTTPS JPEG URLs of the **explicitly user-approved** slides/photographs (on-device local JPEG blobs are NOT such URLs);
- a secure server integration wiring approved Persona variant, MediaStateStore asset resolution and canonical publication jobs. The adapter is **not yet wired into deployed Supabase Edge**. No fake publish/click simulation is an accepted final state.
- no automatic retry when `media_publish` result is uncertain: `PersonaPublicationJob` enters `blocked`, awaiting external reconciliation, never double posting. A known real media ID can be independently verified and marked `verified`.

**Current external discovery:** connected Metricool brand **7235597** has NO social networks connected (authoritative connector error). One-time connection UI: https://app.metricool.com/brands/connections?blogId=7235597. This connection enables a separate authorized publishing route via Metricool; it does NOT automatically inject credentials into the Persona PWA or make this adapter production-ready. No authorization tokens read or written.

## Verification and evidence

- Repository read-only audit: Persona production branch, accepted Persona V1/V1.1, creative loop, product/first-real-persona-post, static iPhone recovery, protected media-router V2 trees. Existing `FIRST_REAL_PERSONA_POST` is a Reel script; it is an editorial **source**, not published.
- Authenticated Metricool account queried: **Instagram NOT CONNECTED**.
- Source-derived deterministic QA of the THREE existing authored carousel templates (journey/actor/musical): 6 structural checks each (6 cards, no internal brand, readable size, unique headings, continuation CTA, source-known), all 3 candidates PASS. No full visual/image snapshot test.
- Source-derived dynamic JavaScript execution of current Graph adapter with TypeScript-only annotations stripped and mock Graph + lightweight URL shims: container/post/verify, Bearer isolation, illegal URL rejection and uncertain publish fail-closed checked. One mistaken harness expectation for request count (3 instead of 4, omitting explicit verification GET) was corrected; re-execution confirmed `POST GET POST GET` and required external media permalink.
- **Written but NOT executed:** Vitest tests `apps/web/src/persona-first-publication-p0.test.ts` (5) and `packages/core/src/instagram-photo-publisher.test.ts` (6). Full `npm test`, app/API typechecks, exact-head `npm run web:build`, iPhone physical runtime, cross-account API, real media staging, approval-to-live synchronization, and real Instagram publication **NOT CONFIRMED**. Do not claim local acceptance or CI green.
- Earlier Vercel previews on early commits had error `STATIC_BUILD_NO_OUT_DIR`. In the isolated branch only, `vercel.json` now stages root `dist` into `apps/web/dist` using `mkdir -p apps/web/dist && cp -R dist/. apps/web/dist/`, and sets `outputDirectory: apps/web/dist` to satisfy the preview build. A **successful exact-head preview has not yet been confirmed**. This does not modify production project settings or the protected base. No production project setting changed.
- Platform Meta guidance verified from Meta's official Instagram Postman collection and current 2026 documentation: professional-account permissions, publicly hosted media and container + publish + media GET flow. Do not assume public media URL availability from local iPhone files.

## Release gate

**NOT COMPLETE until Instagram confirms** actual media ID, permalink and ownership after user-approved publish, persisted in the existing media publication job, with repeatable second run. Automatic publishing MUST NOT run before explicit approval and permissions.

**P0 outstanding:** auth/account connection; public JPEG staging under authorized host; backend mediation/persistence from current `PersonaToday` to server-side adapter; platform verification on iPhone; exact SHA full tests and preview acceptance.

**Protection:** no change to main, recovery base branch, Media Router V2, frozen Persona V1 or immutable V1.1, production, production deployment config, or user data. This feature branch was created from a known recovery commit. No GitHub Actions manually dispatched; existing Actions branch triggers do not match this P0 branch. External Vercel preview automation may build after branch push.
