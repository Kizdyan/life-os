# Persona Media Processing Integration V1 — local-first contract

**Base frozen Persona Creative V1:** `35b9da920d035402f94269d49acd2a747d83d5c3` (never modify).
**Canonical external engine:** Persona Video Engine V1.1 commit `646f0708508c0fc603a43c555b771efe1176ee14`. The unchanged history is published on isolated branch `persona-video-engine-v1.1-source`; it is never merged into Creative V1. The Windows worker runs the pinned clean local worktree and fails closed on a HEAD mismatch or tracked worktree change.

## Bounded V1 workflow

PersonaIdea + signed revision → ShootingSession → captured IndexedDB MediaAsset → immutable VideoProcessingRequest (assetId, revision, session) → authenticated local desktop bridge → local persisted queue → external V1.1 adapter → Instagram output → review → ready.

The PWA only stores/ships bytes and renders status. **No FFmpeg, Whisper.cpp, paid cloud API, or video encode in Safari**. Supabase coordination is optional, not on the critical processing path.

## Processing contract

* Job key `job-<32-character assetId>`, stable across retries/reloads; one job per MediaAsset. The request references the current signed idea revision, session ID and input media metadata; never rewrite origin lineage.
* States: `queued`, `processing`, `review`, `ready`, `failed`. `queued` can include transfer pending. A job is runnable **only after full bytes are durably present** and sizes match.
* `POST /v1/jobs` is idempotent and returns an existing job for the same immutable request; mismatched same-key payload returns 409.
* `PUT /v1/jobs/:id/input` commits the media by atomic rename, never queues partial uploads. `GET /v1/jobs/:id` is idempotent, read-only. `POST /v1/jobs/:id/retry` explicitly resets only failed jobs with retained input. `POST /v1/jobs/:id/approve` marks only a completed `review` job ready. `GET /v1/jobs/:id/output?token=<per-job-secret>` serves verified output with byte ranges.
* Desktop stores JSON and video on disk. Before spawn, the adapter atomically records a launch intent; after spawn it atomically publishes the PID and attempt. After a crash during `processing`, restart waits for that process to finish before changing the attempt to recoverable `failed`, so retry cannot overlap an orphaned V1.1/FFmpeg tree. An unresolved post-spawn launch intent fails closed. One worker claim at a time.
* Desktop adapter is **not the engine**: `scripts/persona-v11-original-engine-adapter.mjs`, configured through `PERSONA_V11_ADAPTER`, exports `process(input)` and invokes the frozen `scripts/persona-video.mjs <input> --output <dir>` entrypoint. It reads the completed V1.1 report and returns the actual `instagram-reels` output. The worker verifies the local worktree HEAD exactly equals the pinned commit; mock adapters are tests only. Missing adapter or wrong commit fails closed.
* Inputs are bounded, paths and IDs validated, CORS exact allowlist, constant-time bearer secret check, loopback-only HTTP; non-loopback requires HTTPS with a certificate the iPhone trusts. PWA private-network browser permissions / TLS must be validated in WebKit before marking real iPhone acceptance.
* Output is Instagram-ready only if the actual external engine produced a real file. The desktop path never leaks to the browser. `review` is explicit; no auto-publishing.

## Final acceptance

Use the **single exact checklist below**. No ready claim from source-only checks.

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

Local desktop verification commands (V1.1 remote source access resolved; execute against exact integration HEAD):
- `node scripts/persona-processing-contract.check.mjs`
- `node scripts/persona-video-desktop-worker.check.mjs`
- `node scripts/persona-video-desktop-worker.mjs` with documented environment variables.
- Validate actual V1.1 integration, browser privacy/network policies, and exact-HEAD iPhone acceptance separately.

**V1.1 SOURCE ACCESS RESOLVED.** The pinned engine is reachable remotely and the original CLI adapter is committed. The remaining acceptance scope is the physical iPhone/trusted-LAN journey and deferred exact-HEAD CI evidence. [Operator runbook](persona-iphone-desktop-physical-acceptance.md). `scripts/persona-v11-real-e2e.check.mjs` exercises a real H.264/AAC source through the authenticated worker, frozen engine, manifest, review, approval and restart recovery. Missing configuration still intentionally fails with `v11_local_adapter_not_configured` or `v11_commit_mismatch`. No GitHub Actions are required or triggered by this check.

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
node --test scripts/persona-desktop-crash-recovery.check.mjs
node --test scripts/persona-transfer-contract.check.mjs
node --test scripts/persona-v11-adapter-contract.check.mjs
node --test scripts/persona-v11-original-engine-adapter.check.mjs
node --test scripts/persona-v11-engine-lease.check.mjs
node --test scripts/persona-v11-worktree-guard.check.mjs
# With PERSONA_V11_WORKTREE, FFMPEG_PATH and FFPROBE_PATH set locally:
node --test scripts/persona-v11-real-e2e.check.mjs
npm run typecheck
npm run api:typecheck
npm run web:build
npx vitest run apps/web/src/personaProcessingClient.test.ts apps/web/src/personaProcessingSnapshot.test.ts apps/web/src/personaMediaIntakeChunk.test.ts
```
The desktop worker smoke uses a **real H.264 MP4 generated by local FFmpeg**, and tests idempotent registration, incorrect lengths, CORS/private-network preflight, a second competing worker, restart, persistent bytes, explicit retry and fail-closed missing V1.1. This is a transport/queue test, **not** evidence that V1.1 processed an input.

### Risks that require the actual Windows engine / browser environment

1. The real CLI is `node scripts/persona-video.mjs <input> --output <directory>`. It writes an isolated run directory and reports `platformOutputs`; the adapter selects only the `instagram-reels` artifact and confines it to the current attempt directory.
2. An OS kill during execution may leave V1.1 finishing its current attempt. Its durable PID/attempt marker makes restart wait for it to exit; only then is the attempt marked failed and explicit retry enabled. This prevents concurrent duplicates without changing the frozen engine.
3. iPhone now reads one 2 MiB IndexedDB chunk at a time, hashes that chunk and resumes from desktop receipts. The 5 GiB declaration is an upper input bound, **not** evidence of Safari IndexedDB quota, transfer longevity or WebKit memory performance. WebKit physical testing remains mandatory.
4. HTTPS certificates and private-network permission in the iPhone Safari/PWA runtime must be validated in the real LAN. The desktop token is stored by the prototype browser origin; use a dedicated random token and rotate it after testing. This design should not be exposed to the public Internet.
5. The desktop worker authenticates its own bearer token but does **not independently verify the Persona Edge HMAC approval**. Approval gating remains within the Persona signed session flow. Treat the desktop endpoint as trusted-local and do not claim production-grade authorization.
6. No auto-publishing, artistic selection, paid AI or substitute editor is introduced.

### Bounded video transfer and transport contract (implemented, WebKit unverified)

The PWA does not call `readCapturedAsset` for processing. It uses `readCapturedAssetChunk` to read exactly one 2 MiB IndexedDB slice, computes one SHA-256 digest in memory, and sends it to the desktop. It never base64-encodes or hashes a complete video in Safari.

- `GET /v1/jobs/:id/transfer` returns only durable chunk receipt indexes, total count and chunk size.
- `PUT /v1/jobs/:id/chunks/:index` requires exact Content-Length and `X-Chunk-SHA256`. Repeating identical chunks is idempotent; different content under the same job/index conflicts. Malformed, missing, truncated and corrupted parts are rejected.
- `POST /v1/jobs/:id/commit` checks all parts in order, re-hashes each without allocating a whole-file buffer, writes the complete original through a bounded stream, fsyncs and atomically promotes it. Only then is the job runnable.
- Crash/reload before commit: existing validated chunk receipts survive, old temp files are discarded, and iPhone resends only missing parts. Crash after input promotion but before manifest save: restart detects the complete input. The source SHA-256 is pinned across retries, so re-uploading a different file under the same MediaAsset ID is rejected.
- IndexedDB partial-capture cleanup uses an IDB key range and background cleanup of orphan chunks older than one day. Fresh unfinished captures are not collected.
- The legacy `PUT /input` is restricted to 16 MiB; iPhone uses chunked transfer. **The declared 5 GiB limit does not mean iPhone can store/transmit a 5 GiB file.**
- CORS permits only one exact configured PWA HTTPS origin, `Authorization`, `Content-Type`, `X-Chunk-SHA256` and private-network permission preflight. LAN requires trusted HTTPS.
- The desktop bearer has a durable fingerprint-scoped lease (default 168 hours, configurable 1–720 hours). Rotation requires changing the token; old tokens expire even after restart. Result video links are short-lived (24 hours) and may be renewed with an authenticated `POST /output-access`. Secrets and raw engine stderr are not displayed as status.
- Strict result validation requires MP4 container, decodable H.264 vertical video, finite non-empty duration, sensible dimensions, immutable source ID/session/version/attempt, full SHA-256, and a completed processed-asset manifest. No `review` or `ready` state without that proof.

### Exact original V1.1 adapter boundary (no implementation of the engine)

`PERSONA_V11_WORKTREE` must point to the original clean checkout with HEAD `646f0708508c0fc603a43c555b771efe1176ee14`. `PERSONA_V11_ADAPTER` is an explicitly configured local absolute ESM module that exports `process(input)`.

`input` contains `inputPath`, `outputDir`, the immutable `request`, `processingRequestId`, `mediaAssetId`, `projectId`, `contentItemId`, `ideaId`, `ideaVersion`, `sessionId`, `attempt`, `outputProfile` (Instagram Reels 9:16 H.264 MP4), `signal` and `timeoutMs` (30 minutes). The adapter must invoke **the original V1.1 code only**. It must honor the abort signal and await child-process termination before resolving/rejecting so that retry never races a still-running engine.

The adapter must return `{success:true,instagramPath:<absolute path>, stderrSummary?:<sanitized string>}`, with the output path inside the exact per-attempt directory. Explicit failure/exit-code error rejects. The worker independently probes, fully decodes, hashes and publishes the resulting file; never trusts the adapter's success flag alone. Temporary outputs are quarantined until the manifest is durable. The original V1.1 CLI and report contract are verified from the pinned source; the adapter adds no media implementation.

### Exact real V1.1 + physical acceptance checklist

- [x] Publish the **existing unchanged** V1.1 local commit to `persona-video-engine-v1.1-source`; verify full SHA `646f0708508c0fc603a43c555b771efe1176ee14` and clean worktree. It is not merged into frozen Creative V1.
- [x] Inspect the actual V1.1 CLI and connect the thin `scripts/persona-v11-original-engine-adapter.mjs` to **that** entrypoint. No engine rewrite or substitute.
- [x] Confirm input MediaAsset ID, idea approval version, shooting session, content item and VideoProcessingRequest ID across the local worker handoff and committed manifest.
- [ ] Select a real decodable H.264 source MP4 on iPhone; verify IndexedDB stores full bytes and preserves original MediaAsset ID after Safari reload.
- [ ] Verify bounded 2 MiB iPhone chunk transfer and resume after Safari reload / interrupted Wi-Fi. Inject missing, duplicate, corrupted and reordered chunks; prove exact byte integrity and cleanup after interrupted capture, desktop restart and retry. Include oversized declared file and practical Safari quota/memory evidence.
- [ ] Verify authenticated HTTPS desktop transfer on trusted LAN with `Access-Control-Allow-Private-Network`, `X-Chunk-SHA256`, expired/rotated bearer and 24h expiring output URLs; wrong origin, bearer and traversal inputs must fail closed.
- [x] Verify desktop job starts at `queued`, transitions through durable `processing`, and invokes pinned V1.1 in the local E2E.
- [x] Verify actual V1.1 emits a real vertical H.264 MP4 with file signature/full desktop decode and commits `result.json` with SHA256/source IDs. Physical iOS playback remains deferred.
- [ ] Verify `review` displays the video on iPhone, manual approval changes status to `ready`, and no auto-publication occurred.
- [ ] Close/relaunch PWA and desktop worker; result metadata, original asset reference and video remain recoverable.
- [x] Kill the desktop worker during the real frozen-engine invocation; verify restart waits for the recorded engine PID, cleans the lease, marks the interrupted attempt failed and permits a non-overlapping explicit retry.
- [ ] Complete physical network-failure, malformed-output and duplicate-request acceptance on the actual iPhone/LAN environment.
- [ ] Execute exact-HEAD WebKit/Chromium tests, source tests, typechecks and build once CI budget becomes available. **Do not infer PASS from tests merely existing in GitHub.**
