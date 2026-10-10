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
