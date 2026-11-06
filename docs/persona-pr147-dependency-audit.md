# Persona PR #147 — integration dependency audit

Verified by reading source files on the PR branch (2026-11-06).

## Shared integration boundary
`apps/web/src/PersonaFactory.tsx` (91,709 bytes) imports `PersonaCarouselEditor`, `PersonaVideoTimeline`, `PersonaLocalRenderReview`, `PersonaColorComparisonStudio`, `PersonaGrowthDashboard`, `PersonaScenarioWorkspace`, `PersonaShootNow`, `personaProductionGuide`, `personaBriefScenarioBridge`, `personaProjectStore`-adjacent journals, and core scenario/director/production types. **Do not split by directory alone.** Its imports and UI routing must be updated together with any extraction.

`PersonaScenarioWorkspace.tsx` (48,832 bytes) imports `PersonaAiCouncilPanel`, `PersonaCreativeDevelopmentPanel`, `personaBriefScenarioBridge`, `personaProjectStore`, core production pipeline and production brief. It is the authoring-to-production integration seam.

`PersonaAiCouncilPanel.tsx` imports the AI Council result type from `api/_persona-ai-council`, core research validation, scenario draft journal and project store. AI Council API contract and client must remain compatible.

`PersonaCarouselEditor.tsx` imports `personaGrowthReview`: carousel authoring already has a marketing heuristic dependency. The heuristic is not independent artistic acceptance.

`PersonaGrowthDashboard.tsx` imports `createPublicationMetrics` and `evaluatePublication` from `personaPublicationAnalytics`; this pair is relatively self-contained, but is mounted by `PersonaFactory`.

`personaProjectStore.ts` defines the shared `PersonaProject` and `PersonaScenarioWorkspace` types and imports core scenario intelligence, AI Council result types, production guide, color comparison and creative review signoff. This is a cross-domain contract; preserve data compatibility during extraction.

`services/persona-video-worker/server.mjs` uses Node HTTP, filesystem and child process FFmpeg with environment variables `PERSONA_WORKER_TOKEN`, `PERSONA_WORKER_DATA`, `PERSONA_MAX_UPLOAD_BYTES`, `PERSONA_MAX_QUEUED_JOBS`. A static Vercel/Render web preview cannot by itself establish durable worker processing. Inspect persistence and job lifecycle before claiming cloud autonomy.

## Safe extraction sequence
1. Keep PR #145/#146 safety fixes stacked and untouched until independent acceptance.
2. Extract **pure analytics functions + tests** first, with integration into PersonaFactory separately. Preserve existing schema and local data.
3. Extract **pure scenario intelligence, AI Council contract and tests** before UI. Preserve author approval and source provenance.
4. Extract scenario workspace, creative review and shoot planning as one integration slice with regression tests.
5. Extract carousel editor and its growth-review heuristic with UI tests.
6. Extract video worker and montage tools separately; require a real persistent job/storage design and E2E evidence.
7. Reconcile PersonaFactory and personaProjectStore as explicit final integration changes, rather than silently duplicating or rewriting them.
8. Treat Vercel config and CI workflow changes as an infrastructure-only review.

## Do not claim
- 584 passing tests at commit 82ef5b5 prove a real user-video E2E.
- Splitting 228 commits is equivalent to copying files; imports, state schema, API routes and stacked history must be checked.
- Current PR HEAD is fully verified without a fresh exact-SHA run.

## Exit gate for actual split
Before creating new PRs: inspect each feature's import closure, identify minimal diff against #146, verify test commands, and choose safe branch bases. Do not merge or force-push the existing draft stack.
