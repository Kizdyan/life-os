# Autonomous Runtime v1 cutover runbook

This runbook moves Life OS from preview-host dependence to an independent, offline-first production runtime with a dedicated durable database.

## Non-negotiable constraints

- Do **not** apply these migrations to `dive-m-integration-test` or `dive-m-production`.
- AppDeploy must not receive new canonical Life OS writes.
- The browser/iPhone local replica is an offline cache/outbox, not canonical cross-device truth.
- Database elevated credentials stay inside Supabase and must never be exposed through Vercel, browser bundles or `VITE_*` variables.
- Yandex.Disk remains media/Media Brain storage only; it is not the canonical task/memory database.

## 1. Pre-cutover gate

Use the exact commit that will be deployed.

```bash
npm install
npm test
npm run typecheck
npm run api:typecheck
npm run api:smoke
npm run web:build
```

Required result:

- all tests pass;
- both TypeScript checks pass;
- the emitted API routes load and respond under the Node ESM runtime;
- `apps/web/dist/index.html` exists;
- GitHub `core`, `web`, `Media Brain CI` and `deploy-readiness` are green;
- production source/config contains no AppDeploy production dependency.

Do not cut over while any gate is red.

## 2. Dedicated Life OS database

Production uses the dedicated Supabase project `life-os-production`. It is separate from all DiveM projects.

Apply in order:

1. `supabase/migrations/20261002_autonomous_runtime_v1.sql`
2. `supabase/migrations/20261002_autonomous_runtime_server_rpc.sql`

Then execute:

`supabase/tests/autonomous_runtime_v1.sql`

Run Supabase security and performance advisors after schema/grant changes. Production cutover requires no unresolved runtime-related advisor findings.

## 3. Supabase Edge Runtime gateway

The production privileged boundary is the Supabase Edge Function:

`supabase/functions/life-os-runtime/index.ts`

Deploy it as `life-os-runtime` in the dedicated Life OS Supabase project.

The function intentionally uses custom owner authentication, so Supabase `verify_jwt` is disabled for this function. Access is still fail-closed because the function itself:

- verifies the Life OS owner passcode using its SHA-256 hash;
- issues a sealed, expiring owner-session token;
- validates that token before canonical sync;
- uses Supabase-provided `SUPABASE_SERVICE_ROLE_KEY` only inside the Edge Function;
- never returns the service-role credential to Vercel or the browser.

The Edge Function supports:

- health;
- owner login/status;
- canonical mutation sync;
- revision/snapshot reads.

Rotating the Supabase service-role credential intentionally invalidates previously sealed Edge owner sessions because the session-encryption key is domain-separated from that server-only credential.

## 4. Vercel adapter is secretless

`life-os-web` does **not** require a Supabase service key in Vercel.

The repository contains only the non-secret Edge Runtime URL:

```text
LIFE_OS_EDGE_RUNTIME_URL=https://zhehdbhpkcucgcjwuhxm.supabase.co/functions/v1/life-os-runtime
```

The client is built with:

```text
VITE_LIFE_OS_REMOTE_ENABLED=true
```

Vercel same-origin API routes keep the browser contract stable:

- `/api/runtime/session`
- `/api/runtime/sync`

The session route proxies owner authentication to Supabase Edge Runtime and stores only the opaque Edge token in an `HttpOnly; Secure; SameSite=Strict` cookie on the Life OS origin. The sync route reads that cookie server-side and proxies canonical sync to the Edge Runtime.

No `LIFE_OS_SERVICE_KEY` is required in Vercel production or preview environments.

The older direct Vercel service-key runtime adapter remains compatibility code only; it is not the production cutover path.

## 5. Deploy independently

Deploy the static web client plus `api/**` routes to an HTTPS host. Vercel is an adapter, not canonical storage; replacing it must not require migrating Life OS data.

For `life-os-web`, keep **Root Directory** at the repository root. The root `vercel.json` defines the web build, `apps/web/dist`, Edge Runtime URL and SPA fallback.

Keep the deployment within the Vercel Hobby function-count limit. Runtime health is exposed through the existing session function rather than a separate serverless route.

After deployment verify:

- `/` loads the client;
- `GET /api/runtime/session?health=1` returns `configured:true`, `databaseReachable:true` and a numeric `storeRevision`;
- `GET /api/runtime/session` returns configured-but-unauthenticated state before login;
- owner passcode login returns `HttpOnly; Secure; SameSite=Strict` session cookie;
- `/api/runtime/sync` rejects requests without the owner session;
- browser source/network payloads contain no Supabase elevated credential.

## 6. First canonical sync

Before creating new production data, preserve/export current local Life OS state as a rollback source.

On the production client:

1. authenticate the owner session;
2. sync the local replica/outbox to the dedicated database;
3. confirm server revision becomes greater than zero when data exists;
4. confirm records appear under the single expected `user_id`;
5. confirm mutation receipts and audit rows are created;
6. verify Sleep & Energy records rehydrate through the same canonical revision stream as normal Life OS items.

Do not delete the local rollback copy after first successful sync.

## 7. Offline-first acceptance test

Run on the iPhone/PWA:

1. load Life OS online and complete a successful sync;
2. disable network access;
3. create/edit at least one Life OS item and one outcome plus a Sleep & Energy measurement;
4. reload/reopen while still offline;
5. verify changes remain visible and pending/offline rather than lost;
6. restore network access;
7. sync;
8. verify every local mutation is applied exactly once and the outbox clears only after acknowledgement;
9. reload again and verify remote state returns intact.

Failure condition: any offline write disappears, duplicates, claims remote success before acknowledgement, or leaves the outbox inconsistent.

## 8. Two-client conflict acceptance test

Use two independent browser/device sessions with the same owner account.

1. sync both clients to the same record/version;
2. client A changes and syncs the record;
3. while stale, client B changes the same record and syncs;
4. verify B receives an explicit conflict with current remote version/data;
5. verify newer canonical data is not silently overwritten;
6. resolve intentionally and sync again.

Failure condition: silent last-write-wins overwrite.

## 9. Erika + audit/undo acceptance test

1. create a normal plan/task change through Erika;
2. verify it reaches the same durable runtime path;
3. verify immutable audit record exists;
4. perform supported undo/reversal;
5. verify canonical state after fresh sync;
6. reload and verify result survives restart.

Existing risk-tier rules remain authoritative for approval-gated actions.

## 10. Media Brain + Yandex acceptance test

Verify independently from canonical Life OS storage:

1. Yandex OAuth/session remains valid or can reconnect;
2. Media Brain can read its service state;
3. media/reference objects remain accessible;
4. Media Brain CI/runtime operations do not require AppDeploy;
5. canonical task/memory rows are not written to Yandex.Disk.

## 11. Restart and second-device durability test

1. close/restart the browser or PWA;
2. preserve the explicit local rollback export;
3. sign in from a second device/browser profile;
4. sync from revision zero;
5. verify canonical records, versions, Sleep & Energy and relevant audit history rehydrate correctly.

This proves the dedicated database — not one browser or hosting provider — owns recoverable truth.

## 12. Observer verification

Before declaring cutover complete, verify:

- runtime health reports database reachable;
- runtime store revision is readable;
- expected record counts and user ownership are correct;
- mutation receipts prevent duplicate replay;
- stale-version writes produce explicit conflicts;
- audit history is present;
- API/auth failures fail closed;
- no canonical Life OS write path targets AppDeploy;
- no elevated Supabase credential is stored in Vercel;
- Media Brain/Yandex remains independently functional.

Run Supabase security/performance advisors again after real traffic if schema or grants changed.

## 13. Backup policy

Immediately after cutover:

- create/export a database backup independent of the web host;
- retain migrations and Edge Function source in Git;
- retain the pre-cutover local-state export until restart/second-device acceptance passes;
- back up Yandex Media Brain service state and media separately.

The hosting provider must never be the only copy of canonical Life OS data.

## 14. Rollback

Rollback if authentication, sync, data integrity, conflict handling, audit or reload durability fails.

1. stop new writes to the public deployment;
2. preserve the dedicated database exactly as-is for diagnosis;
3. restore the last known-good frontend/API deployment or preserved local rollback copy;
4. do not write production data back into AppDeploy as canonical truth;
5. fix and re-run the full acceptance sequence before attempting cutover again.

Database rollback and web-host rollback are separate operations.

## 15. AppDeploy retirement criterion

AppDeploy is irrelevant to production only after all of the following are verified:

- owner authentication works through the Edge Runtime;
- iPhone offline writes survive restart;
- reconnection sync is idempotent;
- two-client stale writes conflict explicitly;
- Erika changes persist through durable API;
- audit/undo works after reload;
- Sleep & Energy survives second-device rehydration;
- Media Brain/Yandex works independently;
- a fresh/second client rehydrates canonical state from the dedicated database;
- backup/export is verified.

After that point the old AppDeploy preview may be disabled without loss of Life OS functionality or canonical data.
