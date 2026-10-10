# Persona Media Processing Integration V1 — local-first contract

**Base frozen Persona Creative V1:** `35b9da920d035402f94269d49acd2a747d83d5c3` (never modify).
**Canonical external engine:** Persona Video Engine V1.1 commit `646f0708508c0fc603a43c555b771efe1176ee14`. This commit is located in the owner's local Windows Codex worktree, **not available in the connected GitHub repo**. We must not copy or rewrite it. The runner fails closed until the exact local engine and its real entrypoint are wired in.

## Bounded V1 workflow

PersonaIdea + signed revision → ShootingSession → captured IndexedDB MediaAsset → immutable VideoProcessingRequest (assetId, revision, session) → authenticated local desktop bridge → local persisted queue → external V1.1 adapter → Instagram output → review → ready.

The PWA only stores/ships bytes and renders status. **No FFmpeg, Whisper.cpp, paid cloud API, or video encode in Safari**. Supabase coordination is optional, not on the critical processing path.

## Processing contract

* Job key `job-<32-character assetId>`, stable across retries/reloads; one job per MediaAsset. The request references the current signed idea revision, session ID and input media metadata; never rewrite origin lineage.
* States: `queued`, `processing`, `review`, `ready`, `failed`. `queued` can include transfer pending. A job is runnable **only after full bytes are durably present** and sizes match.
* `POST /v1/jobs` is idempotent and returns an existing job for the same immutable request; mismatched same-key payload returns 409.
* `PUT /v1/jobs/:id/input` commits the media by atomic rename, never queues partial uploads. `GET /v1/jobs/:id` is idempotent, read-only. `POST /v1/jobs/:id/retry` explicitly resets only failed jobs with retained input. `POST /v1/jobs/:id/approve` marks only a completed `review` job ready. `GET /v1/jobs/:id/output?token=<per-job-secret>` serves verified output with byte ranges.
* Desktop stores JSON and video on disk. Crash during `processing` becomes recoverable `failed` at startup; it never starts a second process automatically. One worker claim at a time.
* Desktop adapter is **not the engine**: external module configured at `PERSONA_V11_ADAPTER` exports `process({inputPath, outputDir, request})` and returns `{ instagramPath }`. The adapter invokes the existing V1.1 pipeline and must verify its local worktree HEAD exactly equals the pinned commit; mock adapters are tests only. Missing adapter or wrong commit fails closed.
* Inputs are bounded, paths and IDs validated, CORS exact allowlist, constant-time bearer secret check, loopback-only HTTP; non-loopback requires HTTPS with a certificate the iPhone trusts. PWA private-network browser permissions / TLS must be validated in WebKit before marking real iPhone acceptance.
* Output is Instagram-ready only if the actual external engine produced a real file. The desktop path never leaks to the browser. `review` is explicit; no auto-publishing.

## First acceptance / evidence

1. Select one recorded video; IndexedDB asset ID survives reload.
2. Immutable job ID and full request persisted.
3. Desktop receives binary, verifies exact byte count and durably stores it.
4. Worker claims one queued request.
5. Real V1.1 is called **from its existing local worktree**; no substitutes.
6. Output references, review and ready survive reload.
7. Video opens via authenticated local output endpoint.
8. Failure + deliberate retry do not produce duplicate jobs or concurrent processing.
9. Chromium/WebKit phone geometry, network failure, HTTPS/private-network access and PWA persistence are verified against exact branch HEAD.
10. CI and physical iPhone acceptance are deferred, never reported as PASS until executed.

### Explicitly out of scope
Creative Router, conversational editing, artistic take scoring, automatic publishing, Runway/Descript/CapCut, Hero Style Profile.

### Environment (local desktop only)
* `PERSONA_BRIDGE_TOKEN`: nonempty, long random bearer secret.
* `PERSONA_BRIDGE_ORIGIN`: exact PWA HTTPS origin (no wildcard).
* `PERSONA_BRIDGE_HOST`: `127.0.0.1` by default; LAN requires TLS.
* `PERSONA_TLS_CERT` and `PERSONA_TLS_KEY`: trusted HTTPS files for LAN.
* `PERSONA_V11_ADAPTER`: explicit local absolute module file URL / path, **must wrap the original V1.1**.
* `PERSONA_V11_WORKTREE`: actual engine worktree for HEAD verification.
* `PERSONA_BRIDGE_DATA`: durable local folder; defaults to `.persona-processing`.

## Current implementation / deferred verification

The isolated branch adds:
- a pure immutable job lifecycle contract, plus a Node-only contract check;
- authenticated desktop HTTP/HTTPS bridge with idempotent POST, atomic chunk-free file transfer, durable manifests, one worker claim, explicit review and retry;
- an external V1.1 loader with exact Git HEAD guard; **no alternate encoder or transcription implementation**;
- atomic Instagram output publication, crash recovery without reprocessing an already committed output, and FFprobe H.264 vertical validation;
- a Persona iPhone panel for one source video, manual submission, status, review, retry and open-video links.

Local desktop verification commands after the canonical engine becomes accessible:
- `node scripts/persona-processing-contract.check.mjs`
- `node scripts/persona-video-desktop-worker.check.mjs`
- `node scripts/persona-video-desktop-worker.mjs` with documented environment variables.
- Validate actual V1.1 integration, browser privacy/network policies, and exact-HEAD iPhone acceptance separately.

**HUMAN_REQUIRED dependency:** access to the *actual* local V1.1 worktree and its callable entrypoint/CLI at commit `646f0708508c0fc603a43c555b771efe1176ee14`. GitHub has neither this commit nor an importable engine module. There is no basis to invent an adapter or mark the real video engine processing test passed. Until connected, the worker intentionally fails the job with `v11_local_adapter_not_configured` or `v11_commit_mismatch` and permits explicit retry. No GitHub Actions have been triggered by this milestone branch.

## Adversarial review / hardening completed in Persona 5

- **Queue fairness and concurrency:** a coalesced drain records arrivals while V1.1 is running; no lost queue wake-up. A durable desktop PID/nonce ownership file prevents two worker processes sharing one job directory, including different network ports. A stopped worker can recover stale ownership.
- **Immutable lineage:** the MediaAsset ID is the immutable request key; request, output manifest and UI all check the originating project/content item, idea, revision, session and asset. Client discards stale asynchronous responses when navigating between recordings.
- **Input persistence:** completed media is atomically promoted to the desktop queue. On restart, partial temp uploads are removed; a missing/corrupted persisted input reverts to the same queued job and requires re-upload, preserving the asset and request IDs.
- **Output persistence:** successful engine results are written to a per-attempt staging directory, checked for MP4 signature, H.264, approximately 9:16 dimensions and full desktop FFmpeg decodability (validation, **not an encoding replacement**). The published MP4 has a SHA-256-backed `result.json` describing source asset ID, processing request ID, idea revision, session, engine commit and attempt. A crash after the manifest commit recovers `review` without re-running the external engine. A manifest from an earlier retry attempt cannot authorize an old output.
- **Output privacy:** private random capability tokens are never included in `result.json`; full source filesystem paths never reach the phone. GET output requires a per-job capability and supports byte ranges. Result integrity is verified on first access, then cached by attempt/hash/file stat to avoid repeated full-file hashing during iPhone playback.
- **Offline UI:** a minimal last-known status is cached in iPhone storage without URL tokens or authority to mark a job `ready`. On reconnect, current server state replaces that cache; buttons and processed-video links are disabled while the desktop is offline. A different revision or shooting session cannot inherit the cached state.
- **Browser UX:** connecting the desktop is the only primary action before configuration; after connection, each state offers the relevant action. The browser never runs FFmpeg/Whisper locally.

### Non-Action CI_BUDGET_SAVER checks

The following test sources are included and must be executed in a Node environment before accepting a commit:
```sh
node --test scripts/persona-processing-contract.check.mjs
node --test scripts/persona-processed-asset.check.mjs
node --test scripts/persona-processing-drain.check.mjs
node --test scripts/persona-video-desktop-worker.check.mjs
npm run typecheck
npm run api:typecheck
npm run web:build
npx vitest run apps/web/src/personaProcessingClient.test.ts apps/web/src/personaProcessingSnapshot.test.ts
```
The desktop worker smoke uses a **real H.264 MP4 generated by local FFmpeg**, and tests idempotent registration, incorrect lengths, CORS/private-network preflight, a second competing worker, restart, persistent bytes, explicit retry and fail-closed missing V1.1. This is a transport/queue test, **not** evidence that V1.1 processed an input.

### Risks that require the actual Windows engine / browser environment

1. The real adapter entrypoint/CLI and output directory conventions are unknown without publishing the pinned local commit. The integration deliberately **does not guess the command**.
2. Exactly-once external engine invocation across an OS kill *during* its execution cannot be guaranteed without an idempotency/recovery contract from V1.1. Immutable job IDs and single-owner execution prevent concurrent duplicates; an incomplete attempt can be re-run only by explicit retry.
3. Large videos currently use `readCapturedAsset` to assemble browser IndexedDB chunks into one Blob before transferring. This needs a WebKit memory/transfer-size acceptance test; it is **not** a verified 5 GB streaming upload.
4. HTTPS certificates and private-network permission in the iPhone Safari/PWA runtime must be validated in the real LAN. The desktop token is stored by the prototype browser origin; use a dedicated random token and rotate it after testing. This design should not be exposed to the public Internet.
5. The desktop worker authenticates its own bearer token but does **not independently verify the Persona Edge HMAC approval**. Approval gating remains within the Persona signed session flow. Treat the desktop endpoint as trusted-local and do not claim production-grade authorization.
6. No auto-publishing, artistic selection, paid AI or substitute editor is introduced.

### Exact real V1.1 + physical acceptance checklist (all deferred)

- [ ] Publish the **existing unchanged** V1.1 local commit to a separate GitHub branch; verify full SHA `646f0708508c0fc603a43c555b771efe1176ee14` and worktree status clean. Do not merge into the frozen Creative V1 branch.
- [ ] Inspect actual existing V1.1 CLI/functions and write a thin `PERSONA_V11_ADAPTER` import calling **those** entrypoints. No engine rewrite or substitute.
- [ ] Confirm input MediaAsset ID, idea approval version, shooting session, content item and VideoProcessingRequest ID at every handoff boundary. Record exact SHA/build IDs.
- [ ] Select a real decodable H.264 source MP4 on iPhone; verify IndexedDB stores full bytes and preserves original MediaAsset ID after Safari reload.
- [ ] Verify authenticated HTTPS desktop transfer on trusted LAN with `Access-Control-Allow-Private-Network`; wrong origin and bearer must fail closed.
- [ ] Verify desktop job starts at `queued`, transitions to `processing` exactly once for an ordinary attempt, and invokes pinned V1.1. Save worker traces.
- [ ] Verify actual V1.1 emits a real vertical H.264 MP4 (file signature, full decode, playable in iOS) and commit `result.json` with SHA256/source IDs.
- [ ] Verify `review` displays the video on iPhone, manual approval changes status to `ready`, and no auto-publication occurred.
- [ ] Close/relaunch PWA and desktop worker; result metadata, original asset reference and video remain recoverable.
- [ ] Induce network failure, partial transfer, worker crash, wrong engine SHA, malformed output and duplicate requests; verify safe error, bounded recovery/retry and no concurrent duplicate invocation.
- [ ] Execute exact-HEAD WebKit/Chromium tests, source tests, typechecks and build once CI budget becomes available. **Do not infer PASS from tests merely existing in GitHub.**
