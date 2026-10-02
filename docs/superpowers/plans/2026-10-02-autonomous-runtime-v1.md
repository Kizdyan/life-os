# Autonomous Runtime v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove AppDeploy from the Life OS production architecture and make the app offline-first but remotely durable, provider-neutral, and independently deployable.

**Architecture:** The browser/iPhone keeps a local replica and outbox for offline operation, while a remote primary store owns durable truth, audit history, memory and synchronization state. The public client talks to a same-origin Life OS API, not directly to one hosting vendor; the API can use PostgreSQL/Supabase-compatible storage behind a narrow adapter. Yandex.Disk remains the primary media-object store only, while Media Brain state may use its hidden service file where appropriate.

**Tech Stack:** TypeScript, React/Vite, provider-neutral REST API, PostgreSQL/Supabase-compatible schema, RLS, existing Life OS core and Media Brain contracts.

**Spec:** `docs/ARCHITECTURE.md`, `docs/AUTONOMY.md`, `docs/MEDIA_BRAIN.md`

## Global Constraints

- AppDeploy is not a production dependency and must not own canonical Life OS data.
- Existing DiveM Supabase projects must not be modified for Life OS.
- Local storage is an offline replica/cache, not the canonical database.
- Remote durable state is provider-neutral and replaceable without changing domain logic.
- All public-schema user-data tables use RLS and least-privilege grants.
- Browser code may use only public/publishable configuration; privileged credentials remain server-side.
- AI providers remain replaceable and do not own user memory.
- Yandex.Disk stores media and Media Brain service state, not the canonical Life OS task/memory database.
- Existing typed tools, audit, Observer, undo and risk tiers remain authoritative.

## Review Focus

- Offline writes made on two clients must not silently overwrite newer remote state.
- A stale client must receive deterministic conflict information instead of claiming success.
- An unauthenticated client must not access another user's rows.
- A network failure must preserve the local operation for retry without duplicating it later.
- Removing/changing the hosting provider must not require a data migration or domain rewrite.

---

### Task 1: Production architecture contract

**Files:**
- Create: `packages/core/src/runtime-storage.ts`
- Create: `packages/core/src/runtime-storage.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Produces: `DurableRuntimeStore`, `RuntimeRecord`, `SyncMutation`, `SyncResult`, `RuntimeConflict`.

- [ ] Write tests proving provider-neutral durable read/write, monotonic versions, idempotency keys and explicit conflicts.
- [ ] Run the focused tests and verify failure before implementation.
- [ ] Implement the minimal runtime-storage contracts and an in-memory reference implementation used only for tests.
- [ ] Run focused tests and typecheck.
- [ ] Commit.

### Task 2: Offline-first replica and deterministic sync

**Files:**
- Create: `apps/web/src/runtimeSync.ts`
- Create: `apps/web/src/runtimeSync.test.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/localRuntime.ts`

**Interfaces:**
- Consumes: Task 1 sync/version/idempotency semantics.
- Produces: `RemoteLifeOsGateway`, `syncLocalReplica`, `queueMutation`, explicit `local` / `remote` / `offline` state.

- [ ] Add failing tests for offline queueing, replay, duplicate replay protection and stale-version conflict.
- [ ] Implement a same-origin remote gateway with local replica fallback; stop treating localStorage as canonical when remote runtime is configured.
- [ ] Preserve existing local-only behavior when no remote API is configured.
- [ ] Run web tests, core tests and typecheck.
- [ ] Commit.

### Task 3: Durable PostgreSQL/Supabase-compatible schema

**Files:**
- Create: `supabase/migrations/20261002_autonomous_runtime_v1.sql`
- Create: `supabase/tests/autonomous_runtime_v1.sql`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Produces canonical tables for items, outcomes, memory, audit, mutation receipts and sync revisions.

- [ ] Define schema with `user_id`, versions, immutable audit rows and unique mutation/idempotency keys.
- [ ] Enable RLS on every exposed table, revoke broad grants, grant only required operations to authenticated, and add per-user policies using `auth.uid()`.
- [ ] Add SQL tests covering authenticated ownership and unauthenticated denial.
- [ ] Do not apply this migration to DiveM projects; commit migration only until a dedicated Life OS project exists.
- [ ] Commit.

### Task 4: Same-origin durable API boundary

**Files:**
- Create: `api/runtime/_store.ts`
- Create: `api/runtime/sync.ts`
- Create: `api/runtime/sync.test.ts`
- Modify: `api/tsconfig.json`

**Interfaces:**
- Consumes: Task 1 semantics and Task 3 schema.
- Produces `POST /api/runtime/sync`, provider adapter selected only from server environment.

- [ ] Add failing tests for auth-required access, idempotent mutation replay, conflicts and remote snapshot response.
- [ ] Implement fail-closed server configuration; no secret falls back to browser/local mode.
- [ ] Add a Supabase/PostgREST-compatible adapter behind the generic store interface.
- [ ] Run API typecheck and tests.
- [ ] Commit.

### Task 5: Hosting independence and AppDeploy removal

**Files:**
- Modify: `README.md`
- Modify: `vercel.json` if required only for generic static/API routing.
- Create: `docs/DEPLOYMENT.md`
- Modify: `.github/workflows/deploy-readiness.yml`

**Interfaces:**
- Produces a host-neutral build artifact and documented environment contract.

- [ ] Add CI assertions that production docs/source contain no AppDeploy URL/dependency.
- [ ] Document deployment as interchangeable static frontend + same-origin API + external PostgreSQL-compatible primary store.
- [ ] Document backup/export and provider-switch procedure.
- [ ] Verify web build, API typecheck, core/web/media tests and deployment-readiness checks.
- [ ] Commit.

### Task 6: Migration readiness and final verification

**Files:**
- Create: `docs/AUTONOMOUS_RUNTIME_RUNBOOK.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces exact cutover checklist from current local/app-preview state to independent production.

- [ ] Document one-time remote DB provisioning, migration application, auth/bootstrap, first sync, Observer verification, rollback and AppDeploy retirement.
- [ ] Run the complete GitHub CI matrix on the branch.
- [ ] Confirm no code path writes canonical Life OS memory/tasks to AppDeploy.
- [ ] Open a PR against `main`; do not merge until CI is green.
