# Offline outcome queue — issue #215

This limited fix retains the existing `life-os:web-outbox` localStorage array and existing outcome RPC. It does not introduce a database, new runtime, or migration.

## Verified defects and fixes

| Severity | Reproduction / cause | Fix | Regression |
|---|---|---|---|
| P1 | Queue flush saw no matching task after a day switch, then discarded an unconfirmed action | Persist the original item context; retain legacy entries as NEEDS_RESOLUTION when no context exists | Missing-day, return-to-day, reload, changed-item context tests |
| P1 | Whole-array replacement after network I/O erased actions enqueued during the request | Re-read the queue and acknowledge only the matching operation after matching item/status/successor confirmation | In-flight persistence, enqueue-during-flush, invalid response, retry tests |
| P1 | Old failed `not_complete` remained queued while newer `complete` was acknowledged; retry overwrote the newer result | Stop later commands for the same item behind the failed or unresolved earlier action; unrelated items may continue | Failed/unresolved same-item barrier and ordered recovery tests |
| P1 | Online UI commands bypassed the queue and could overwrite/reorder retained offline actions or bypass writer admission | All remote UI commands now enqueue first, online and offline, then flush when online. Pending is distinguished from server-confirmed status | Retained failed action → new online command → ordered retry; second-writer online denial |
| P1 | Separate renderers could read stale localStorage snapshots even under per-write Web Locks; a stale ACK erased the other tab's pending write | Admit exactly one writer document using a lifetime Web Lock. Other documents fail before queue/network mutation and must close the owner and reload before retry | Real Chrome two-tab denial, retained action, owner close, required reload and successful retry |
| P2 | Click-derived carry successor identity created two next-day tasks after `not_complete → complete → not_complete` | Deterministic SHA-256-derived UUID for source occurrence + next date, separate from operation identity | Retry equality and toggle sequence tests |

## Deliberate safety limits

Concurrent writer tabs are **not supported**. Merely waiting for a storage event, timer or task boundary did not establish safe cross-renderer visibility in the actual Chrome reproducer; those designs were rejected. The second document shows that its change was **not saved**. A denied document remains denied until reload, even after the owner closes. Read-only tabs are allowed. Web Locks are required; unsupported browsers fail closed rather than quietly losing an action.

The short storage mutation lock never covers network I/O. Same-document enqueues remain possible during a flush. Failed/malformed responses leave entries persisted. A stable operation request is retried unchanged; an acknowledged entry is not resent by a later flush. Damaged queue data is never interpreted as an empty queue and overwritten.

Live server acceptance is **UNVERIFIED**. The existing SQL increments version on replay and has no exactly-once request ledger. This change does not claim server-level exactly-once execution; it prevents client queue loss and duplicate client acknowledgement/removal, and stabilizes carry identity. No cloud credentials or records were modified.

## Actual checks on 2026-11-22

- Final focused offline/API regressions: **23 PASS**. Full existing Vitest: **128 suites /647 tests PASS**.
- Core typecheck, targeted strict queue/API typecheck and production build are checked separately. A broad standalone strict App typecheck also exposes existing unrelated web errors; it is not claimed green.
- Installed Chrome /actual production outbox module: **three independent runs PASS** for the single-writer safety design, plus a fresh final **PASS** including online-command writer denial.
- `--multiwriter-repro` preserves the negative reproducer for the rejected multiwriter design; it is not a success test for the new safety policy.

To repeat the real-browser check, start the existing Vite app for this branch and run:

```text
python tools/test_lifeos_outbox_browser.py --url http://127.0.0.1:4175 --chrome PATH_TO_INSTALLED_CHROME
```

The test uses a blank document on the actual local app origin and imports its real outbox module. No HTTP success mock, live RPC or cloud operation is used. Network acknowledgements and day-switch ordering are separate explicit unit contract tests.
