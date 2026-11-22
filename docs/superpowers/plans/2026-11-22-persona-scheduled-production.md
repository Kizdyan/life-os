# Persona scheduled production implementation plan

**Goal:** Persist a small, opt-in mixed-format production queue using existing ProductionJob and local Worker, without paid calls or publication.

**Architecture:** Optional schedule, bounded attempts, leases and artifact receipts live in existing job.json. The existing Worker executes allowlisted local media stages and exposes a common review projection; calendar slot/content IDs remain attached. Existing manual jobs are unchanged.

**Spec:** User continuation mission, priorities 3–4; bounded inventory in the continuation queue-audit artifact.

1. [x] Add focused failing tests for slot validation, paid-budget denial, atomic claim, two-attempt cap, dead-owner recovery and verified receipt idempotency.
2. [x] Implement optional scheduling methods in `tools/persona_orchestrator.mjs` with atomic locks, same-file receipts, source references and existing lifecycle authority.
3. [x] Add opt-in queue tick/routes to `tools/persona-media-worker.mjs`; reuse media-engine and quick-platforms for actual media. Block unavailable research/images individually, enforce one stage and bounded local resources.
4. [x] Prove three actual format jobs through loopback Worker, restart, retry and repeated ticks; retain artifact evidence, hash originals, document partial autonomy. Run focused adjacent regression tests only, then report for root-coordinated commit.

Constraints: main/PR225 untouched; originals immutable; paid budget zero; retries at most two attempts; no new database/orchestrator/editor; no author approval; no 24/7 claim while Windows is off.
