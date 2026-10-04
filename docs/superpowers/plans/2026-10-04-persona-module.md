# Persona Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить существующий Media Brain в пользовательский модуль Persona внутри Life OS с циклом от идеи до утверждения, публикации, аналитики и обучения.

**Architecture:** Расширять существующие media contracts/state аддитивно, не создавая параллельное ядро. UI Persona использует существующую media API boundary; фоновые публикации используют существующий autonomous runtime и distributed lease. Площадки изолированы адаптерами.

**Tech Stack:** TypeScript 5.9, React 19, Vite 7, Vitest 3, существующие Vercel API functions и Media Brain runtime.

**Spec:** `docs/superpowers/specs/2026-10-04-persona-module-design.md`

## Global Constraints
- Не ломать чтение старых media snapshots.
- Не публиковать без явного approval там, где approval обязателен.
- Не допускать двойную публикацию при retry/concurrency.
- Использовать официальные интеграции площадок; недоступную возможность отмечать blocked.
- Persona остаётся отдельным модулем внутри Life OS.

## Review Focus
- Старый snapshot без Persona-полей должен читаться без миграционной аварии.
- Повтор одного publication job не должен создавать второй внешний пост.
- Потерянный ответ API после успешной публикации должен приводить к verify, а не слепому повтору.
- Недоступная метрика должна оставаться отсутствующей, а не превращаться в 0.
- Два автономных worker не должны одновременно публиковать один job.

---

### Task 1: Persona contracts and durable state
**Files:** Modify existing Media Brain contract/state files discovered in repo; add focused Persona contract tests.
**Produces:** PersonaCandidate/Approval/PlatformVariant/PublicationJob/MetricSnapshot/LearningSignal types and backward-compatible persisted defaults.
- [ ] Write failing tests for legacy snapshot read and Persona state round-trip.
- [ ] Run targeted Vitest and confirm failure.
- [ ] Add minimal additive contracts/defaults and persistence mapping.
- [ ] Run targeted tests and core typecheck.
- [ ] Commit `feat(persona): add durable persona state contracts`.

### Task 2: Approval state machine
**Consumes:** Task 1 Persona state.
**Produces:** approve/rework/defer/reject transitions with immutable revision history.
- [ ] Write failing transition and no-publish-before-approval tests.
- [ ] Run tests and confirm failure.
- [ ] Implement transition service and API contract.
- [ ] Run tests/typecheck.
- [ ] Commit `feat(persona): add approval workflow`.

### Task 3: Persona UI in Life OS
**Consumes:** Task 2 API.
**Produces:** Persona navigation entry and decision queue with preview + four primary actions.
- [ ] Write failing UI tests for queue, empty state and actions.
- [ ] Run tests and confirm failure.
- [ ] Implement Persona screen using existing app patterns; keep advanced controls secondary.
- [ ] Run web tests/build/typecheck.
- [ ] Commit `feat(persona): add approval center UI`.

### Task 4: Platform publication abstraction
**Consumes:** approved platform variants.
**Produces:** connector interface, publication queue, idempotency and verify-before-retry behavior.
- [ ] Write failing tests for independent platform jobs, duplicate prevention and lost-response verification.
- [ ] Run tests and confirm failure.
- [ ] Implement provider-neutral connector and queue state machine.
- [ ] Run tests/typecheck.
- [ ] Commit `feat(persona): add safe publication queue`.

### Task 5: Autonomous publication worker
**Consumes:** Task 4 jobs + existing distributed lease/runtime.
**Produces:** due-job polling with single-worker ownership, bounded retry and blocked escalation.
- [ ] Write failing concurrency/retry/block tests.
- [ ] Run tests and confirm failure.
- [ ] Implement worker on existing lease abstraction.
- [ ] Run Media Brain CI-equivalent test suite.
- [ ] Commit `feat(persona): automate publication jobs`.

### Task 6: Analytics snapshots and learning signals
**Consumes:** verified publications.
**Produces:** metric snapshots, normalized signals and confidence-weighted Content DNA updates.
- [ ] Write failing tests for missing metrics, platform isolation and single-outlier resistance.
- [ ] Run tests and confirm failure.
- [ ] Implement snapshot collector contracts and normalization/learning service.
- [ ] Run tests/typecheck.
- [ ] Commit `feat(persona): close analytics learning loop`.

### Task 7: Life OS signal bridge
**Consumes:** existing Life OS events/projects through a narrow adapter.
**Produces:** permitted content signals and Persona-generated shoot tasks without coupling Persona core to planner UI.
- [ ] Write failing adapter tests including denied/unavailable context.
- [ ] Run tests and confirm failure.
- [ ] Implement bridge interfaces and mappings.
- [ ] Run core/web tests.
- [ ] Commit `feat(persona): bridge life signals and shoot tasks`.

### Task 8: End-to-end readiness
**Consumes:** Tasks 1–7.
**Produces:** full mocked cycle signal → approval → publication → metrics → learning plus runbook.
- [ ] Add E2E tests for happy path, blocked connector, retry, restart persistence and concurrent worker.
- [ ] Run full `npm test`, `npm run typecheck`, `npm run api:typecheck`, `npm run web:build` and Media Brain CI commands.
- [ ] Fix only failures attributable to Persona changes and rerun until green.
- [ ] Document required platform credentials/capability limitations without secrets.
- [ ] Commit `test(persona): verify end-to-end automation`.

## Self-review
Spec coverage: approval, modular UI, durable state, publishing, retries, metrics, learning and Life OS bridge are mapped to Tasks 1–8. Type ownership flows forward from persisted contracts. High-risk compatibility, duplicate publication, lost responses, missing metrics and worker concurrency each have explicit tests.
