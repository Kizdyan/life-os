# Life OS Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Life OS into an iPhone-first execution, sensing, analytics, memory and AI-assistant system while keeping Persona independently evolvable.

**Architecture:** Preserve the versioned runtime store as the offline/audit substrate. Add typed domain contracts and pure engines in core, then thin web/mobile adapters. Erika orchestrates domain tools through permission/audit boundaries; Persona integrates later through a narrow opportunity contract.

**Tech Stack:** TypeScript, React/Vite, Vitest, Vercel Functions, Supabase/Postgres runtime store.

**Spec:** `docs/architecture/life-os-audit-2026-10-06.md`

## Global Constraints
- P0 is a stable, convenient iPhone Life OS.
- Do not rewrite working runtime/sync paths without a demonstrated need.
- Passive collection before manual entry; active check-ins stay sparse.
- Analytics may report associations, never unqualified causality.
- Persona stays a standalone Content OS until both products stabilize.
- Sensitive/irreversible external actions require user confirmation and audit.
- Voice is an adapter around Erika, not Erika's memory/personality layer.

## Review Focus
- Offline edits and retries must remain idempotent and must not duplicate measurements or tasks.
- Time-zone/day-boundary behavior must not assign sleep or outcomes to the wrong local day.
- Sparse datasets must not generate fake correlations or confident insights.
- Memory inference must never silently become a user fact or permanent preference.
- Persona/Life OS integration must not create circular ownership or duplicate source-of-truth records.

---

### Task 1: Canonical Life Analytics contracts
**Files:** Create `packages/core/src/life-analytics.ts`; create `packages/core/src/life-analytics.test.ts`; modify `packages/core/src/index.ts`.
**Interfaces:** Produces `LifeObservation`, `DailyLifeAggregate`, `LifeAnalyticsSummary`, `buildLifeAnalyticsSummary(observations, rangeDays)`.
- [ ] Write tests for completion/on-time/transfer/deep-work/sleep/energy aggregation, sparse data, and local-day grouping.
- [ ] Run core tests and confirm the new tests fail before implementation.
- [ ] Implement pure aggregation with no UI/storage dependency.
- [ ] Export the module and run core tests/typecheck.

### Task 2: Normalize current execution and sleep data
**Files:** Create `apps/web/src/lifeAnalyticsRuntime.ts`; create tests; modify sleep/runtime adapters only where necessary.
**Interfaces:** Consumes runtime task/outcome and sleep records; produces `LifeObservation[]`.
- [ ] Add fixture tests for task outcomes, transfers, planned/actual duration and sleep intervals.
- [ ] Implement normalizers without changing persisted legacy payloads.
- [ ] Verify old sleep records still load and sync.

### Task 3: iPhone Analytics surface
**Files:** Create `apps/web/src/LifeAnalyticsCard.tsx`; add focused CSS; modify navigation/App integration.
**Interfaces:** Consumes `LifeAnalyticsSummary` only.
- [ ] Add component tests for 7/30-day summaries and insufficient-data states.
- [ ] Implement compact mobile-first summary; no chart wall.
- [ ] Browser-check iPhone viewport, Today navigation and offline behavior.

### Task 4: Sparse active check-in model
**Files:** Extend life-sensor core/web modules and tests.
**Interfaces:** `LifeMeasurement` with energy, mood, sleepQuality, wellbeing, focus, workQuality, daySatisfaction; all optional except timestamp/type/source.
- [ ] Test partial measurements and one-tap update semantics.
- [ ] Implement payload schemaVersion/provenance and runtime sync.
- [ ] Add progressive UI so the user is never required to answer every metric.

### Task 5: Erika orchestration boundary
**Files:** Create focused core modules for intent, tool registry, permission decision and action audit; refactor web Erika adapter incrementally.
**Interfaces:** `ErikaRequest -> ErikaDecision -> ToolCall[] -> ErikaActionResult -> ErikaResponse`.
- [ ] Pin existing planner/outcome commands as regression tests.
- [ ] Add read-only intents: today, productivity summary, repeated deferrals.
- [ ] Add permission classifications `read|reversible_write|sensitive_write|external_irreversible`.
- [ ] Keep voice lifecycle separate from reasoning.

### Task 6: Erika durable memory ledger
**Files:** Create `memory-ledger.ts` + tests + runtime adapter.
**Interfaces:** `MemoryItem {id, kind, value, source, sourceDate, confidence, epistemicType, validFrom, validUntil, deletedAt}`.
- [ ] Test fact/preference/inference/temporary separation, supersession and deletion.
- [ ] Persist as versioned runtime records.
- [ ] Add read/update/delete APIs before automatic memory extraction.

### Task 7: Goal graph + Weekly Outcome
**Files:** Create goal/weekly-outcome core modules, tests and mobile surface.
**Interfaces:** typed hierarchy links plus exactly one measurable active weekly outcome per active project/week.
- [ ] Test hierarchy validation and next-action links.
- [ ] Implement runtime payload contracts.
- [ ] Add weekly outcome UI and Erika read/write tools.

### Task 8: Anti-perfectionism execution signals
**Files:** Create `execution-friction.ts` + tests; connect to Erika suggestions.
**Interfaces:** pure signal evaluator using task age, move count, work sessions and shipped outcome.
- [ ] Test repeated transfer, long-running work and legitimate long projects.
- [ ] Require multiple signals before suggesting a minimum viable finish.
- [ ] Phrase output as a suggestion, not a diagnosis.

### Task 9: Persona Capture Director
**Files:** Persona core/API/UI modules and tests, kept outside Life OS domain modules.
**Interfaces:** `ContentOpportunity -> ShootingBrief` with purpose/result/reference/shotList/camera/light/audio/performance/editAware/finalCheck.
- [ ] Test context-aware camera guidance and prohibit universal exposure magic values.
- [ ] Generate 5–7 second shot guidance, handles, spare takes and final checklist when relevant.
- [ ] Keep user workload/time budget in the brief.

### Task 10: Persona media + publication learning loop
**Files:** Extend existing media brain/analytics/publication modules.
**Interfaces:** durable media metadata, publication record and performance samples; insight engine with minimum sample sizes.
- [ ] Add tests preventing conclusions from one post.
- [ ] Implement platform-specific adaptations and publication ledger.
- [ ] Add learning summaries feeding the next content plan.

### Task 11: Persona ↔ Life OS bridge
**Files:** Create contract package/module only after Tasks 3–10 stabilize.
**Interfaces:** `LifeEvent -> ContentOpportunity`; `CaptureRequest -> optional LifeTask`; completion returns media references, not Persona internals.
- [ ] Contract-test idempotency and ownership boundaries.
- [ ] Implement bridge behind a feature flag.
- [ ] Verify either product still runs independently.

### Task 12: Knowledge engine foundation
**Files:** Create knowledge contracts/evidence scoring/review queue and tests.
**Interfaces:** capture → classify → verify → extract → connect → action/feature/knowledge → review.
- [ ] Test opinion-vs-fact and sensitive-domain verification requirements.
- [ ] Reuse existing reference-evidence primitives where possible.
- [ ] Add compact inbox/review UX only after core semantics pass.

### Task 13: External action adapters (P3)
**Files:** Future adapters only after permission/audit layer is stable.
**Interfaces:** every adapter declares permissions, confirmation policy, audit payload and undo capability.
- [ ] Start read-only; add writes service-by-service.
- [ ] Never auto-enable financial/trading execution.
- [ ] Run full mobile/runtime regression suite before enabling any external write tool.
