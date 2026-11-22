# Scheduled local production — bounded partial autonomy

Persona's existing Media Worker can execute explicitly scheduled local work while it is running. No new service, editor or queue database is introduced. The optional `productionSchedule` in the existing `ProductionJob/job.json` stores calendar/content IDs, due timestamps, stage leases, at most two attempts, blocked reasons and SHA-256 artifact receipts. Existing canonical states and original media remain authoritative.

This is **technical production**, not complete creative autonomy. The implemented `local-media` stage calls the existing media engine directly for a complete selected Reel take, or existing photo/carousel tools for selected local archive images. It verifies real media, output decode/dimensions, source hashes and receipts. It does not generate captions, research facts, infer dialogue, create new images, approve artistic quality or publish. Required research/image stages persist BLOCKED with a reason; independent local work continues. The three-format actual-media acceptance uses one existing six-second author Reel and existing Codex-generated archive JPEGs, with provenance recorded. Its image outputs are archive QA derivatives, not new authored posts.

## Opt in to an existing production root

The existing launcher/Worker reads these environment settings:

```powershell
$env:PERSONA_PRODUCTION_QUEUE_ENABLED='1'
$env:PERSONA_PRODUCTION_QUEUE_ROOT='C:\existing\Persona\production-root'
```

The directory must already exist and contain existing ProductionJob folders. The queue scans at most 100 jobs/1000 entries and never scans private libraries or arbitrary user folders. It does not create an empty parallel library. Default behavior remains opt-out. Programmatic Worker configuration accepts `productionQueue:{enabled:true,root,intervalMs:60000,maxJobsPerTick:3}`; interval is at least one second and the tick cap is 1–3 stages. The Worker performs one tick on startup and then periodically. An authenticated manual request is admitted synchronously before awaiting its body/handler, preventing overlap with scheduled processing; the existing manual render busy guard also remains in force.

Existing token-protected loopback routes:

- `GET /production-queue`: common review projection with existing canonical job ID, operation ID, content ID and calendar slot ID. A ready result is hash-verified on read; missing/tampered artifacts are retained and never advertised ready.
- `POST /production-queue/schedule`: `{jobId,schedule}` for an existing job. No filesystem paths, commands or arbitrary tool names are accepted. Duplicate slot bindings are rejected; identical scheduling of the same job is idempotent. Already-rendered/manual FAILED jobs cannot be rescheduled silently.
- `POST /production-queue/tick`: `{}` invokes the same bounded tick as the timer.

All requests use the existing `X-Persona-Worker-Token`; same-origin launcher paths retain `/persona-worker` prefix. A schedule is an explicit draft production plan, not an author decision or posting instruction:

```json
{
  "slotId":"persona:2026-12-01:reel",
  "contentId":"existing-content-id",
  "format":"reel",
  "productionAt":"2026-11-22T00:00:00.000Z",
  "publicationAt":"2026-12-01T15:00:00.000Z",
  "stages":["local-media","research","images"],
  "sources":[{"name":"existing-staged-take.mp4","sha256":"64-lowercase-hex-characters","bytes":123456}],
  "budget":{"paidCalls":0,"maxAttempts":2,"maxInputBytes":20000000,"maxStageMs":60000}
}
```

The calendar slot must match existing Tuesday Reel, Thursday carousel or Saturday photo cadence. Production must be scheduled 7–14 days before proposed publication. Sources are basename-only references inside that job's existing `input` directory; actual bytes/hashes are checked before scheduling and again before/after execution. A Reel stage currently supports one selected complete take of 0.25–900 seconds; a photo stage supports one image, carousel supports selected images up to 12. Resource limits: up to 500 MiB staged input, 1–120 seconds per stage, at most two total attempts, zero paid calls. Actual FFmpeg/FFprobe subprocesses are directly owned and terminated at their deadline; the existing media engine accepts the bounded runner directly, so no Node wrapper can leave an FFmpeg descendant behind.

## Restart and failure behavior

Completed stages are not run again; receipts are verified rather than trusted. Interrupted queue-owned stages retain attempt artifacts and resume only when the recorded owner PID is proven dead. Live/unknown owners are never stolen, even after lease expiry. Transient failures retry after 30 seconds and become exhausted after the second attempt. Capability blocks do not consume retries and do not prevent independent stages/jobs. The existing Quick Render restart path leaves scheduled jobs to this recovery while preserving legacy manual failure behavior.

Atomic scheduling mutations, canonical transitions and the root schedule admission mutex use one shared owner/token lock helper. An exited-process regression creates a real lock through that helper, then proves both job/transition and root route recovery. **Unknown legacy/empty locks remain blocked for manual inspection.** A crash during the tiny `.recovery` guard window also requires inspection; the Worker does not delete that guard speculatively. Optional legacy full-render/batch locks retain their existing separate behavior. These limits are deliberate; no claim is made that every possible crash window self-heals.

The Windows computer must be on and the Worker running to execute. Jobs survive shutdown on disk; this feature does not provide 24/7 processing. No login task/service is installed. No rolling calendar refill, source discovery, paid provider access, autonomous editorial approval, publication delivery, or DiveM service is claimed. Existing task-dispatcher/local-executor/task-journal are retained with their current engineering/manual semantics; this change does not pretend their PLAN_ONLY/HUMAN_REVIEW_REQUIRED flows already execute creative work.

## Evidence and checks

`tools/persona-scheduled-production.test.mjs` covers validation, immutable IDs, paid denial, exclusive/live leases, two-attempt cap, actual exited-owner/mutex recovery, receipt tampering and source verification. `tools/persona-scheduled-worker.test.mjs` covers real loopback authentication, direct process deadline, real missing-processor retries across restart, manual request admission, 901-second input block, legacy-vs-scheduled recovery and actual FFmpeg Reel/carousel/photo execution with restart and zero duplicate stages. Both files are included in `npm run media:test`.

Default FFmpeg test sources are explicit technical fixtures. Optional acceptance variables `PERSONA_QUEUE_ACCEPTANCE_ROOT`, `PERSONA_QUEUE_REAL_REEL` and `PERSONA_QUEUE_REAL_PHOTOS` (two exact paths separated by `;`) switch the same test to copies of selected existing media and preserve an `ACCEPTANCE.json`. This artifact records original paths/hashes, blocked stages and limits. It is not external-model or artistic proof. The retained current actual-media run is in project artifacts `persona-autonomy-continuation-20261122/queue-real-media/`.
