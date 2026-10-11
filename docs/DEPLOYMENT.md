# Life OS deployment contract

Life OS production is deliberately independent from any single hosting or AI vendor.

## Production layers

### 1. Web/iPhone client

The client is offline-first. It keeps a local replica and durable outbox so Today, Erika capture and outcome marking continue when the network or backend is unavailable.

The local replica is **not** the canonical cross-device database.

Build-time configuration:

- `VITE_LIFE_OS_REMOTE_ENABLED=true` — enables the autonomous remote runtime.
- `VITE_LIFE_OS_API_URL` — optional. Leave empty for the preferred same-origin `/api/*` deployment. Set only when the API is intentionally hosted on another origin.

Legacy `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` remain migration compatibility only. New production deployments must use the same-origin runtime.

### 2. Same-origin Life OS API

The API owns authentication, sync semantics and backend credentials. The browser never receives a database service/secret key.

Required server-only configuration:

- `LIFE_OS_OWNER_ID` — stable UUID identifying the personal Life OS owner.
- `LIFE_OS_OWNER_PASSCODE_SHA256` — SHA-256 of the owner connection passcode.
- `LIFE_OS_SESSION_SECRET` — random secret of at least 32 characters used to seal the HttpOnly session cookie.
- `LIFE_OS_DATA_URL` — PostgreSQL/PostgREST-compatible data endpoint for the first adapter.
- `LIFE_OS_SERVICE_KEY` — server-only elevated database key. Prefer a current Supabase `sb_secret_*` key. A legacy `service_role` JWT remains compatibility-only. Never expose either form through `VITE_*`, source code or client logs.

For current Supabase secret keys, the server adapter sends the credential as the `apikey` header only. Legacy service-role JWTs retain the bearer header for backwards compatibility. Do not put an `sb_secret_*` key into `Authorization: Bearer`.

The owner passcode creates a sealed `HttpOnly; Secure; SameSite=Strict` Life OS session. The passcode itself is not persisted by the browser.

### 3. Canonical durable store

The first implementation is PostgreSQL/Supabase-compatible, but domain and sync semantics live behind provider-neutral interfaces.

Canonical Life OS data includes:

- tasks/events/routines/habits;
- outcomes and plan→fact history;
- user-owned memory/rules/settings;
- projects/goals;
- sync versions and mutation receipts;
- immutable audit history.

Apply, in order, to a **dedicated Life OS database**:

1. existing Life OS migrations required by the selected deployment;
2. `supabase/migrations/20261002_autonomous_runtime_v1.sql`;
3. `supabase/migrations/20261002_autonomous_runtime_server_rpc.sql`.

The server-RPC migration grants `service_role` access only to the runtime tables, audit identity sequence and RPC required by the adapter. This is intentional: current Supabase projects do not necessarily auto-grant new public-schema tables to Data API roles.

Run `supabase/tests/autonomous_runtime_v1.sql` against the dedicated database and run Supabase security/performance advisors before production cutover.

Do not apply Life OS runtime migrations to DiveM integration-test or DiveM production.

### 4. Media storage

Yandex.Disk remains the primary store for large photos/video/audio, References, Projects and Media Brain service state. It is not the canonical Life OS task/memory database.

The Media Brain connection has separate server-only Yandex OAuth configuration documented in `docs/YANDEX_DISK.md`.

## Host requirements

Any production host is acceptable if it can provide:

- HTTPS;
- static serving of `apps/web/dist`;
- same-origin TypeScript/JavaScript HTTP functions for `api/**` or an equivalent adapter;
- encrypted server-side environment secrets;
- optional scheduled execution for Media Brain workers;
- no forced ownership of canonical application data.

`vercel.json` is one deploy adapter, not an architectural dependency. The same built client/API can be adapted to another serverless provider or a conventional Node runtime without migrating user data.

## Build and verification

```bash
npm install
npm test
npm run typecheck
npm run api:typecheck
npm run web:build
```

The deploy artifact must contain `apps/web/dist/index.html`.

GitHub `deploy-readiness` also rejects AppDeploy domains/SDK imports in production source and configuration.

For the complete provisioning, cutover, offline/two-client acceptance, rollback and AppDeploy-retirement procedure, follow `docs/AUTONOMOUS_RUNTIME_RUNBOOK.md`.

## Backup and restore

Back up the canonical database independently from the hosting provider:

1. export the dedicated Life OS PostgreSQL database on a regular schedule;
2. retain schema migrations in Git;
3. export/download Yandex Media Brain service state and media according to the media backup policy;
4. treat the local client replica as an additional recovery source, not the only backup.

A restore is complete only after Observer verifies:

- runtime store revision is readable;
- expected Life OS records and audit history exist;
- a fresh authenticated client can sync without silently overwriting a conflict;
- Media Brain can read its Yandex storage independently.

## Switching providers

### Hosting provider

Build the same frontend, expose the same `/api/runtime/*` and `/api/media/*` routes on the new host, migrate server secrets, change DNS, and verify. Canonical user data does not move.

### Database provider

Export canonical PostgreSQL data, provision a compatible database, apply schema/migrations, import data, implement/select the matching `RuntimeRemoteStore` adapter, then run Observer verification. Client/domain code does not change.

### AI provider

Switch the model adapter. Durable memory, rules, audit and user state remain in Life OS storage.

## Explicit non-dependencies

AppDeploy is not a production host, database, memory store, scheduler, secret store or required build service for Life OS. The old preview may remain reachable temporarily for comparison, but it receives no new production work and contains no canonical state.
