# Autonomous Runtime v1 cutover runbook

This runbook moves Life OS from preview-host dependence to an independent, offline-first production runtime with a dedicated durable database.

## Non-negotiable constraints

- Do **not** apply these migrations to `dive-m-integration-test` or `dive-m-production`.
- AppDeploy must not receive new canonical Life OS writes.
- The browser/iPhone local replica is an offline cache/outbox, not canonical cross-device truth.
- Database elevated credentials stay server-side and must never be exposed through `VITE_*` variables.
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

## 2. Provision a dedicated Life OS database

Create a new Supabase/PostgreSQL-compatible project dedicated to Life OS. Prefer the region closest to the primary user/device.

The project must be separate from both existing DiveM projects.

Apply in order:

1. `supabase/migrations/20261002_autonomous_runtime_v1.sql`
2. `supabase/migrations/20261002_autonomous_runtime_server_rpc.sql`

The second migration explicitly grants only the runtime tables, audit identity sequence and server RPC required by `service_role`. This is required for current Supabase projects where public-schema tables are not automatically granted to the Data API.

Then execute:

`supabase/tests/autonomous_runtime_v1.sql`

The SQL verification must complete without an exception.

Run Supabase security and performance advisors after migration and resolve any runtime-related warning before production cutover.

## 3. Create production secret

For the current `life-os-web` Vercel adapter, the repository pins only non-secret deployment configuration (`LIFE_OS_DATA_URL`, `LIFE_OS_OWNER_ID`, the owner passcode hash and remote-mode build flag). The host secret store therefore needs only:

- `LIFE_OS_SERVICE_KEY` — preferably a modern Supabase `sb_secret_*` key; legacy `service_role` JWT is compatibility only.

The runtime adapter sends a modern `sb_secret_*` key only in the `apikey` header. Legacy service-role JWTs keep the bearer header for compatibility.

If `LIFE_OS_SESSION_SECRET` is not explicitly set, the owner-session encryption key is domain-separated and derived server-side from `LIFE_OS_SERVICE_KEY`; rotating the service key therefore invalidates existing owner sessions, which is an intentional fail-closed behavior.

Never place `LIFE_OS_SERVICE_KEY`, the raw owner passcode or a session secret in the browser bundle, logs, screenshots or `VITE_*` variables.

## 4. Configure the public client

The Vercel adapter builds the client with remote runtime enabled:

```text
VITE_LIFE_OS_REMOTE_ENABLED=true
```

Prefer same-origin API routing and leave `VITE_LIFE_OS_API_URL` empty. Set it only when the API is intentionally hosted on another origin and that deployment has explicit CORS/session handling.

Build the exact production artifact after environment configuration.

## 5. Deploy independently

Deploy the static web client plus `api/**` routes to an HTTPS host that supports same-origin server functions and encrypted environment secrets.

Vercel is an initial deployment adapter, not canonical infrastructure. Another compatible host must be able to replace it without migrating Life OS data.

For the `life-os-web` Vercel project, leave **Root Directory** empty (repository root). The root `vercel.json` sets the web build, `apps/web/dist`, runtime non-secret configuration and the SPA fallback, while the root `api/**` directory supplies the server functions. Keep the deployment within the Hobby function-count limit; runtime health is exposed through the existing session function rather than a separate function.

After deployment, verify:

- `/` loads the client;
- `GET /api/runtime/session?health=1` returns `configured:true`, `databaseReachable:true` and a numeric `storeRevision`;
- `GET /api/runtime/session` returns configured-but-unauthenticated state before login;
- owner passcode login returns a sealed `HttpOnly; Secure; SameSite=Strict` session cookie;
- `/api/runtime/sync` rejects requests without that owner session;
- no elevated database key appears in browser source/network payloads.

## 6. First canonical sync

Before creating new production data, preserve/export the current local Life OS state as a rollback source.

On the production client:

1. authenticate the owner session;
2. sync the local replica/outbox to the dedicated database;
3. confirm the server revision becomes greater than zero when data exists;
4. confirm records appear under the single expected `user_id`;
5. confirm mutation receipts and audit rows are created;
6. verify Sleep & Energy records rehydrate through the same canonical revision stream as normal Life OS items.

Do not delete the local rollback copy after the first successful sync.

## 7. Offline-first acceptance test

Run this on the iPhone/PWA:

1. load Life OS online and complete a successful sync;
2. disable network access;
3. create/edit at least one Life OS item and one outcome plus a Sleep & Energy measurement;
4. reload/reopen the client while still offline;
5. verify the changes remain visible and are pending/offline rather than lost;
6. restore network access;
7. run sync;
8. verify each local mutation is applied exactly once and the outbox clears only after acknowledgment;
9. reload again and verify the remote state returns intact.

Failure condition: any offline write disappears, duplicates, claims success before remote acknowledgement, or leaves the local outbox in an inconsistent state.

## 8. Two-client conflict acceptance test

Use two independent browser/device sessions with the same owner account.

1. sync both clients to the same record/version;
2. client A changes and syncs the record;
3. while still stale, client B changes the same record and syncs;
4. verify client B receives an explicit conflict with current remote version/data;
5. verify the newer canonical value is not silently overwritten;
6. resolve intentionally and sync again.

Failure condition: last-write-wins silently overwrites a newer record.

## 9. Erika + audit/undo acceptance test

Using the production client:

1. create a normal plan/task change through Erika;
2. verify the typed action reaches the same durable runtime path;
3. verify an immutable audit record exists;
4. perform the supported undo/reversal;
5. verify the resulting canonical state after a fresh sync;
6. reload the client and verify the result survives restart.

For high-risk or approval-gated actions, existing risk-tier rules remain authoritative.

## 10. Media Brain + Yandex acceptance test

Verify independently from the canonical Life OS database:

1. Yandex OAuth/session is still valid or can reconnect;
2. Media Brain can read its service state;
3. media/reference objects remain accessible;
4. Media Brain CI/runtime operations do not require AppDeploy;
5. canonical task/memory rows are not written to Yandex.Disk.

## 11. Restart and second-device durability test

After the acceptance writes are synced:

1. close/restart the browser or PWA;
2. if possible, clear only ephemeral runtime state without deleting the explicit rollback export;
3. sign in from a second device/browser profile;
4. sync from revision zero;
5. verify canonical records, versions, Sleep & Energy and relevant audit history rehydrate correctly.

This proves the durable database — not one browser or hosting provider — owns recoverable truth.

## 12. Observer verification

Before declaring cutover complete, verify:

- runtime health reports the database reachable;
- runtime store revision is readable;
- expected record counts and user ownership are correct;
- mutation receipts prevent duplicate replay;
- stale-version writes produce conflicts;
- audit history is present;
- API/auth failures fail closed;
- no canonical Life OS write path targets AppDeploy;
- Media Brain/Yandex remains independently functional.

Run Supabase security/performance advisors again after real traffic if schema or grants changed during cutover.

## 13. Backup policy

Immediately after cutover:

- create/export a database backup independent of the web host;
- retain migrations in Git;
- retain the pre-cutover local-state export until production has passed the restart/second-device test;
- back up Yandex Media Brain service state and media separately.

The hosting provider must never be the only copy of canonical Life OS data.

## 14. Rollback

Rollback if authentication, sync, data integrity, conflict handling, audit or reload durability fails.

1. stop new writes to the new public deployment;
2. preserve the dedicated database exactly as-is for diagnosis;
3. restore the last known-good frontend/API deployment or use the preserved local rollback copy;
4. do not write production data back into AppDeploy as a new canonical source;
5. fix and re-run the full acceptance sequence before attempting cutover again.

Database rollback and web-host rollback are separate operations. Reverting the host must not require moving canonical data.

## 15. AppDeploy retirement criterion

AppDeploy is irrelevant to production only after all of the following are verified on the independent deployment:

- owner authentication works;
- iPhone offline writes survive restart;
- reconnection sync is idempotent;
- two-client stale writes conflict explicitly;
- Erika changes persist through the durable API;
- audit/undo works after reload;
- Sleep & Energy survives second-device rehydration;
- Media Brain/Yandex works independently;
- a fresh/second client rehydrates canonical state from the dedicated database;
- backup/export is verified.

After that point the old AppDeploy preview may be disabled without loss of Life OS functionality or canonical data.
