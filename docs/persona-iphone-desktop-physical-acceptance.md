# Persona V1 — operator-run iPhone ↔ desktop acceptance

**Status:** PREPARED, not executed on a physical iPhone. The original V1.1 is remotely published at branch `persona-video-engine-v1.1-source`, exact commit `646f0708508c0fc603a43c555b771efe1176ee14`. The engine is **not** to be changed or reimplemented.

This runbook is for the developer/operator. **The user is not QA.** Carry out all preflight and network debugging before asking for any physical acceptance action. Do not change production or `main`.

## Preflight — Windows desktop, zero recurring cost

Use the integration branch HEAD and the separate immutable V1.1 checkout. For the worker you need Node.js, Git, FFmpeg/FFprobe, and the current repository dependencies. Use the existing Windows worktree if verified; do not overwrite a working clone.

In PowerShell, from the **integration branch worktree**, verify:

```powershell
git rev-parse HEAD
git -C "$env:PERSONA_V11_WORKTREE" rev-parse HEAD
git -C "$env:PERSONA_V11_WORKTREE" status --porcelain=v1 --untracked-files=no
node --version
ffmpeg -version
ffprobe -version
Test-Path .\scripts\persona-v11-original-engine-adapter.mjs
Test-Path "$env:PERSONA_V11_WORKTREE\scripts\persona-video.mjs"
```

The second HEAD must be **exactly** `646f0708508c0fc603a43c555b771efe1176ee14`. Tracked status must be empty. The operator must ensure both checkouts exist and that the engine's dependencies are installed **without modifying tracked engine files**. If required, configure explicit `FFMPEG_PATH` and `FFPROBE_PATH` for the worker and original engine.

## Trusted local-network TLS

A PWA at an HTTPS origin cannot call arbitrary HTTP on a LAN. The desktop worker refuses non-loopback HTTP by design. Use a **LAN-only HTTPS endpoint** with a certificate whose **Subject Alternative Name covers the desktop's actual LAN IP/DNS name** and whose CA is trusted by the iPhone. There is **no paid tunnel, hosted backend, port-forwarding or public Internet exposure**.

A zero-cost option for a dedicated test network is `mkcert`. On the desktop, use a trusted local CA, create a certificate for the actual LAN IPv4/DNS name and configure the worker with paths to its cert and private key. On the iPhone, install the local CA certificate through the approved device process and explicitly enable full trust in Settings → General → About → Certificate Trust Settings. Keep the CA private key on the desktop **only**; never transfer the key file to the phone.

The certificate must be valid for the exact address typed in Persona; do not use `https://localhost` from the phone (that would address the iPhone). Confirm that local-network permission is granted to Safari/the PWA when prompted. If a local-network HTTPS or Private Network Access preflight fails, solve it on the operator's test devices; do not ask the user to troubleshoot.

Restrict the Windows inbound firewall rule to the **Private profile and local subnet / trusted phone**, prevent routing to the public Internet, and do not forward the desktop worker port on the router. Treat the worker bearer as a secret and use a dedicated random token.

## Worker configuration and launch

From the **integration worktree** on Windows, set these environment variables to real values (below are **placeholders, not working addresses or secrets**):

```powershell
$env:PERSONA_V11_WORKTREE = "C:\PATH\TO\EXISTING\V11\WORKTREE"
$env:PERSONA_V11_ADAPTER = (Resolve-Path ".\scripts\persona-v11-original-engine-adapter.mjs").Path
$env:PERSONA_BRIDGE_DATA = "C:\PATH\TO\PRIVATE\PERSONA-PROCESSING-DATA"
$env:PERSONA_BRIDGE_HOST = "192.168.X.Y"
$env:PERSONA_BRIDGE_PORT = "8787"
$env:PERSONA_BRIDGE_ORIGIN = "https://EXACT-PERSONA-PWA-ORIGIN"
$env:PERSONA_TLS_CERT = "C:\PATH\TO\TRUSTED\desktop.pem"
$env:PERSONA_TLS_KEY = "C:\PATH\TO\PRIVATE\desktop-key.pem"
# Supply a dedicated 32-byte-or-longer cryptographically random bearer token
# in PERSONA_BRIDGE_TOKEN. Never commit, screenshot or log the token.
node .\scripts\persona-video-desktop-worker.mjs
```

Do not proceed until the engine SHA/clean-tree guard, adapter import, TLS key permissions, port binding, token expiry, private-network CORS and local-only firewall access are confirmed. Rotating `PERSONA_BRIDGE_TOKEN` invalidates the old token; its lease defaults to 168 hours. Browser results use 24-hour capability URLs and the PWA can renew them with authenticated `POST /output-access`.

## Free internal checks — before involving the user

```powershell
node --test scripts/persona-processing-contract.check.mjs
node --test scripts/persona-processed-asset.check.mjs
node --test scripts/persona-processing-drain.check.mjs
node --test scripts/persona-transfer-contract.check.mjs
node --test scripts/persona-v11-adapter-contract.check.mjs
node --test scripts/persona-v11-worktree-guard.check.mjs
node --test scripts/persona-v11-engine-lease.check.mjs
node --test scripts/persona-v11-original-engine-adapter.check.mjs
node --test scripts/persona-video-desktop-worker.check.mjs
node --test scripts/persona-desktop-crash-recovery.check.mjs
node --test scripts/persona-v11-real-e2e.check.mjs
npm test
npm run typecheck
npm run api:typecheck
npm run web:build
```

The original-engine E2E requires `PERSONA_V11_WORKTREE`, FFmpeg and FFprobe, and must **not be treated as PASS if skipped**. Record test counts and the exact integration SHA. The Codex report of 459 passing tests at `1adc0e887a8192d69cff5bfcd9090cd6fae0e2f8` is historical evidence; it does **not** automatically validate later commits. No GitHub Actions are necessary for local checks.

## One short physical acceptance journey (operator observed)

1. On the iPhone, open the already signed-in Persona PWA, use an existing approved idea and its shooting session, and select **one video already captured**. Do not duplicate the MediaAsset.
2. On the **Монтаж** screen, configure the trusted LAN desktop address/token once, then press **Отправить на обработку**. The device sends at most one 2 MiB IndexedDB chunk at a time. The operator privately records original asset ID, immutable request ID and idea/session revision.
3. Observe **В очереди → Обрабатывается → Нужна проверка**. The desktop operator confirms that the frozen V1.1 CLI ran at the exact SHA, with no second engine process for the same attempt.
4. Persona shows an inline playable Instagram MP4. Review it on the device, press the **single primary approval action** and observe **Готово**. If unsuitable, the secondary action selects another original video; do not automatically rerun an unchanged deterministic source expecting a different artistic result.
5. Leave/reopen the PWA and restart/reconnect the desktop worker. The original MediaAsset ID, approved version/session, status, validated output and playback must remain intact. Expired playback capability URLs must renew without exposing bearer details.
6. The operator then independently injects one interrupted upload, duplicate/corrupt chunk, wrong token/origin, worker restart during execution and stale-output retry. These are *internal reliability checks*, **not additional tasks for the user**.

**Fail-closed conditions:** no certificate trust, blocked LAN/private-network access, missing original input chunk, dirty/wrong V1.1 SHA, failed full MP4 decode, mismatched source/attempt/hash, stale worker PID, expired bearer, or missing output manifest. None may show a forged **Готово** state.

## Consolidated exact-HEAD CI after the budget is restored

On the **one stable candidate SHA**, run: core/Vitest regression tests; web and API typecheck; production build; worker transport/queue/recovery checks; original V1.1 H.264/AAC MP4 end-to-end and report/hash proof; deterministic interruption/retry, manifest and lineage tests; Chromium and WebKit Persona flows; deployed preview/runtime/HTTPS/CORS checks; physical iPhone Safari upload, review/ready and reload/reconnect. Capture machine-readable logs/artifacts and original V1.1 SHA. Do not dispatch intermediate commits to Actions.

**Exit gate:** only report `READY_FOR_PHYSICAL_ACCEPTANCE` when no internal code issue remains and all locally executable checks pass against the final integration SHA. Physical Safari/LAN/CI evidence is then still separate and deferred; never claim production READY from a source audit.
