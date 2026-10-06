# Life OS architecture audit — 2026-10-06

## Executive finding

The project already has a substantial execution/runtime foundation, but the product surface is narrower than the core. The safest direction is evolutionary: keep the current runtime record + version + mutation + audit model as the durable sync substrate, add explicit domain contracts on top, and avoid a database rewrite while iPhone stability is P0.

## Current state

### Implemented
- Today execution surface with planned/completed/partial/moved/missed-time/not-completed states.
- Offline-first runtime sync with versioned records, mutation idempotency and audit history.
- Undo path for outcomes.
- Natural planning, recurrence, reminders, dependencies, calendar-sync primitives and recovery/attention helpers in core.
- Sleep + morning energy capture, including duration and concrete sleep/wake interval; records sync through runtime storage.
- Persona v3 pipeline: planning, generation, semantic revision, independent QA and prepublish gate.
- Media Brain/Yandex integration primitives and media pipeline primitives exist in core.

### Partial
- Erika: UI/voice exists, but the current web execution path is mostly planner parsing + deterministic task outcome matching. It is not yet a general reasoning/memory/tool assistant.
- Analytics: outcome adherence exists and sleep has a local summary, but there is no unified longitudinal Life Analytics Engine.
- Active sensing: energy and sleep quality exist; mood, focus, work quality, wellbeing and day satisfaction are not yet a coherent low-friction check-in model.
- Memory: core has memory-related primitives, but no durable user-editable memory contract with source/date/confidence/fact-vs-inference semantics exposed as a product.
- Persona: content factory and media primitives exist, but Capture Director, durable media metadata, publishing analytics and learning loop are not yet a complete autonomous product.
- Mobile: responsive web/iPhone path exists, but the navigation and information architecture still expose only a subset of the intended OS.

### Missing
- Goal hierarchy (vision → 5y → year → quarter/month → week → today → next action).
- Weekly Outcome as a first-class entity.
- Unified event/measurement model for passive life telemetry.
- Correlation/insight engine with minimum sample sizes and explicit non-causal language.
- Anti-perfectionism execution signals based on age, transfers and lack of shipped outcomes.
- Erika durable memory ledger and permissioned tool/action registry.
- Knowledge ingestion pipeline (capture → classify → verify → extract → connect → action/knowledge → review).
- Persona Shooting Director/Capture Engine and durable content-performance learning loop.

### Requires external integrations / permissions
- Health/sleep system sources.
- External calendar write/read beyond existing primitives.
- Restaurant booking, messaging, routes, purchases, tickets and smart-home actions.
- Social publishing and platform analytics APIs.
- Yandex Disk autonomous media storage requires configured OAuth credentials/secrets.

### Future / intentionally deferred
- AI Trading.
- Smart Home.
- Broad autonomous external action layer.
- Deep health integrations.

## Database audit

Current production Supabase is `life-os-production` in `eu-north-1`. The public schema currently contains four runtime substrate tables:

- `life_runtime_records`: user-scoped versioned JSON payload records, soft delete, server revision.
- `life_runtime_mutations`: idempotency/version application ledger.
- `life_runtime_audit`: before/after version audit events with payload.
- `life_runtime_state`: per-user store revision.

Decision: do not replace this substrate now. New domain objects first use typed runtime records so offline sync, version conflicts, audit and undo remain consistent. Dedicated relational projection tables are introduced only when analytics/query cost justifies them.

## Target bounded contexts

1. **Execution** — tasks, events, recurrence, dependencies, outcomes, actual execution.
2. **Life Sensors** — sleep and sparse subjective measurements.
3. **Goals** — goal graph, projects, weekly outcomes and next actions.
4. **Analytics** — normalized observations → daily aggregates → insights.
5. **Erika** — reasoning, memory, tools, permissions, execution, audit; voice is an adapter, not the brain.
6. **Knowledge** — captured sources, evidence quality, extracted knowledge and actions.
7. **Persona** — separate Content OS with an integration contract to Life OS, not a hard dependency.

## Canonical runtime record kinds

Keep the physical runtime store generic while standardizing payload contracts:

- `task`, `event`, `project`, `goal`, `weekly_outcome`
- `life_measurement`, `sleep_log`
- `memory_item`, `knowledge_item`
- `analytics_snapshot`, `analytics_insight`
- `action_audit`
- `persona_opportunity` (bridge only; Persona owns content production data)

Every new durable payload must include `schemaVersion` and stable entity identifiers. Measurements include `occurredAt`, `source`, and optional confidence. Memory includes source provenance, confidence, epistemic type (`fact|preference|inference|temporary`), validity and deletion semantics.

## API boundary decisions

- Existing `/api/runtime/session` + `/api/runtime/sync` remain the sync transport.
- Domain services produce/consume typed runtime records; UI must not learn database table details.
- Erika routes intents into domain tools. Tool execution returns an auditable result; irreversible/sensitive tools require confirmation.
- Persona remains separately owned. Future integration uses a narrow opportunity/task contract rather than importing Persona internals into Life OS.

## Phased roadmap

### Phase 0 — iPhone stability (P0)
Preserve runtime/offline behavior; tighten mobile navigation, voice lifecycle, error/retry states and regression coverage. No broad schema rewrite.

### Phase 1A — Life Analytics foundation (P1)
Introduce canonical observations and daily aggregate contracts, normalize execution + sleep/energy into them, calculate 7/30/90-day summaries, then add guarded correlations only after minimum sample thresholds.

### Phase 1B — Erika foundation (P1)
Separate STT adapter → reasoning/intent → tools → permission gate → execution → audit → response → TTS adapter. Add durable memory ledger with provenance/confidence and editable/deletable semantics.

### Phase 1C — Goals + Weekly Outcome (P1)
Add goal graph, project links, weekly outcome and next-action derivation. Anti-perfectionism signals consume execution history rather than hard-coded motivational prompts.

### Phase 1D — Persona standalone Content OS (P1)
Finish Capture Director, Media Brain metadata, production jobs, platform adaptation, publication ledger, analytics and learning loop independently of Life OS.

### Phase 2 — Persona ↔ Life OS bridge (P2)
Life event → content opportunity → Persona shooting brief → optional Life OS capture task → media ingest. Contract-only integration.

### Phase 3 — external autonomous actions (P3)
Permissioned adapters for bookings, messaging, routes, purchases, smart home and future modules. AI Trading remains separately gated behind research/backtest/paper/risk evaluation.

## Verification policy

Every large block requires: unit/integration tests, typecheck, production build, browser/mobile verification and regression check of runtime sync/offline/undo. Database changes additionally require RLS/security review and Supabase advisors.
