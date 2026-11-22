# Erika automation runner — isolated implementation

Module: `packages/core/src/erika-automation-runner.ts`

## Implemented

- A deterministic dependency graph of typed `ActionRequest` jobs.
- Every job runs through existing `AutonomyEngine`, including policy, audit, and Observer.
- A job is **successful only if its audit state is verified**.
- Downstream jobs are blocked on failed, unverified, or approval-gated prerequisites.
- Missing dependencies, duplicate IDs, and cycles are handled explicitly.
- Bounded retries (maximum three) only for explicitly allowlisted, idempotent tools whose risks are exclusively read-only/reversible.
- Results include counts and per-job attempts, state, and audit evidence.
- No paid providers, external publishing, or production mutations.

## Important limitations

This is a **runner**, not a continuously operating scheduler. It is not yet connected to a persistent queue, lease/lock, process restart recovery, UI, or timer. The caller must enforce single-worker execution and persist results. Do not claim background autonomy or guaranteed exactly-once execution.

## Verification

Run:

```sh
npm ci
npm run typecheck
npm run api:typecheck
npm test
npm run web:build
```

Unit tests: `packages/core/src/erika-automation-runner.test.ts`.

Next acceptance block: persist job and result state, add lease-based worker and recovery, integrate with Erika runtime, exercise end-to-end in local Life OS, then verify in preview. Keep this branch separate from Codex's Persona changes. Do not merge or deploy without user approval.
