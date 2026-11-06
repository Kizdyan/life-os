# Persona PR #147 — stabilization and extraction plan (2026-11-06)

## Confirmed baseline
- PR #145: draft ASR zero-duration hardening, head `045630d`.
- PR #146: draft Recovery Review timecode replay, head `9fe9c1c`; its base is PR #145.
- PR #147: draft, head before this report `a1ffc1e`, stacked on PR #146.
- GitHub comparison from PR #146 head to PR #147 head reports **228 commits** and extensive cross-domain modifications.
- Vercel READY deployment for commit `82ef5b5`: logs show typecheck, web:typecheck, api:typecheck, 109 passing test files / 584 tests and successful web build.
- From `82ef5b5` to `a1ffc1e`: six commits, only markdown documentation and AGENTS.md changed. This is not a verified build of latest HEAD.
- GitHub Actions startup failures remain a separate infrastructure issue; synthetic CI is not real seven-scene iPhone acceptance.

## Recommended extraction boundaries (do not automatically cherry-pick)
A. **Safety and ASR recovery**: editorial choices/previews, strict B04 matching, ASR diagnostics and regression tests. Depends on #145/#146. Keep human audio approval mandatory.
B. **Research and scenario intelligence**: `api/_persona-research*`, `api/_persona-ai-council*`, `api/persona-ai-council.ts`, `PersonaAiCouncilPanel`, `PersonaScenarioWorkspace`, `personaCreativeDevelopment`, `persona-scenario-intelligence`, `persona-scenario-version-history`, editorial docs/tests. Must preserve independent critic and author approval.
C. **Shoot planning and carousels**: `PersonaShootNow`, `personaShootNow`, `personaBriefScenarioBridge`, `PersonaCarouselEditor`, production guide, related tests.
D. **Media production and QA**: `services/persona-video-worker`, `compose.persona-video.yaml`, `PersonaLocalRenderReview`, `PersonaVideoTimeline`, `PersonaColorComparisonStudio`, semantic montage and reviewed-render tools, production pipeline and QA. Requires separate worker/storage deployment; static web build is insufficient.
E. **Growth and analytics**: `PersonaGrowthDashboard`, `personaPublicationAnalytics`, `personaGrowthReview`, tests; audit storage durability and distinguish actual metrics.
F. **Infrastructure and integration**: `vercel.json`, `package.json`, GitHub workflows, `render.persona-preview.yaml`, local verifier, `PersonaFactory`, `personaProjectStore`, API tests and cross-feature wiring. This group must be split by dependency and tested after each extraction.

## Big-stage execution gates
**Stage I — Stabilize and separate**
1. Inventory and dependency audit (this report).
2. Map integration imports and shared package/API contracts; determine cherry-pick feasibility. Do not assume paths are independent.
3. Extract small coherent PRs only with separate tests and without changing original PR history or main.
4. Run exact-SHA cloud checks for each candidate; preserve successful logs and inspect GitHub startup errors.
5. Human reviews scope; merges require explicit permission.

**Stage II — Cloud-first product backbone**
1. Establish independent, affordable build executor and durable data/media storage.
2. Confirm browser access on iPhone, auth, recoverable uploads and persistent jobs.
3. Deploy an isolated preview only with approved budget and no changes to existing services.

**Stage III — Content authoring**
1. Research -> three distinct concepts -> independent editorial critique -> user choice.
2. Reel script and carousel slide plan with versions and explicit approval.
3. One-page shoot checklist and source references; test actual user flows.

**Stage IV — Production and acceptance**
1. Real media upload -> FFmpeg worker -> reviewed MP4, plus carousel image export.
2. Quality review: original appearance, white balance, audio, subtitles, continuity, legibility.
3. Actual iPhone end-to-end test and user approval, never substituted by synthetic fixtures.

**Stage V — Measurement and autonomous operation**
1. Real Instagram metrics and truthful denominators.
2. 90-day content planning and reuse of B-roll.
3. Scheduled agent with explicit permissions, budget ceiling, execution logs, recovery and escalation.

## Immediate next technical action
Inspect import graph and shared integration files before splitting the 228-commit stack. No new paid service, no merge, no production change, no source-media modification.
