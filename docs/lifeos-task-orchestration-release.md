# Life OS: task orchestration release

This is an **offline, explicit-approval orchestration foundation**, not an autonomous agent runner.

## First run
```bash
npm run tasks:test
npm run tasks:dispatch -- --input examples/lifeos-tasks.json --output artifacts/task-dispatch-001
```
The dispatcher writes a proposed plan, does not execute shell commands, and does not contact external providers.

## Command-line state transition
```bash
npm run tasks:journal -- --input examples/lifeos-tasks.json --id CI-001 --to RUNNING --revision 0
npm run tasks:journal -- --input examples/lifeos-tasks.json --id CI-001 --to DONE --revision 1 --evidence "Verified exact commit with full test report"
```
These commands **modify the specified JSON file**. Copy the example board to your own workspace before running them. A stale revision or missing evidence fails closed.

## Durable task transitions
Use the exported `updateBoard` API from `tools/persona-task-journal.mjs` to change state. A revision number prevents stale writes; a local lock prevents concurrent writers; DONE requires explicit evidence. Failed/running tasks are never automatically retried. Keep the board in an authorized local worktree and back it up before state changes.

## Safety and verification
- Only `DONE` tasks unblock dependencies.
- Recovery is advisory, never execution.
- Task labels are suggestions, not evidence that Codex/Claude/marketing tools ran.
- `npm run tasks:test` is included in the independent verification script and the standalone CI workflow.
- Production acceptance additionally requires a full repository test run at the exact commit.
- GitHub-hosted CI has shown failures without step details; do not treat those as test results.

## Limitations
No cloud task worker, agent API integration, secure secret broker, scheduling service, database-backed distributed locking or automatic production execution is provided. This release intentionally stops before granting execution permissions.

## Exact-commit release gate
```bash
node scripts/persona-verify-independent.mjs
npm run release:gate -- --input artifacts/persona-verification/latest.json --sha FULL_40_CHAR_SHA --output artifacts/release-gate-001
```
The release gate refuses stale SHAs, dry-runs, missing suites and unsuccessful commands. A successful gate means **eligible for human review**, not approval to merge or deploy.

**Trust boundary:** a JSON report can be edited. This gate validates internal consistency and completeness; it does not cryptographically attest that an independent runner actually executed the commands. For stronger assurance, run verification in a trusted isolated runner and retain immutable logs and commit provenance. Do not treat a locally edited JSON as authoritative.

## Current verification status
GitHub Actions previously reported failures with missing step details. Until the exact current commit passes independent verification, the release is **not verified**. New code and new tests in GitHub are not themselves proof of successful execution.

## End-to-end CLI acceptance
```bash
npm run tasks:test
npm run tasks:e2e:test
npm run release:gate:test
node scripts/persona-verify-independent.mjs
```
The E2E suite starts the real Node CLI programs in isolated temporary directories. It checks dispatch, journal state transitions, evidence requirements, dependency unblocking, refusal to overwrite reports and the release gate's dry-run rejection.

**Important:** tests have been committed but a successful run at the current GitHub SHA is not yet established. CI workflow configuration is not evidence that CI ran. The independent verifier must run on a checked-out exact commit before a release can be called verified.

## Report write protection
Dispatcher and release-gate outputs now require a **new, nonexistent directory**. They refuse existing paths and remove their newly created directory on write failure. This protects existing reports against accidental overwrite. The output directory can briefly be visible while files are being written, so this is **not a transactional multi-file publish**; downstream consumers should read reports only after successful process exit. The journal uses a local lock and same-directory temporary file before rename; distributed/multi-host writes are not supported.

## CI diagnostic
An earlier GitHub Actions run (42280275194) had an `audit` job with `conclusion=failure`, `steps=null` and no logs URL in the API response. That is insufficient to attribute the failure to a particular code line or test. A new, successful run at the current SHA is still required.

## Independent CI workflow
`.github/workflows/persona-independent-verification.yml` checks out the PR commit, uses Node 22 and `npm ci`, runs `scripts/persona-verify-independent.mjs` with `PERSONA_COMMIT_SHA`, and uploads `artifacts/persona-verification/latest.json` even on a failed run if it exists. This workflow has read-only repository permissions and does not deploy or merge.

The verifier now fails closed if the checked-out Git SHA cannot be established or if any mandatory package script is absent. Previously it silently filtered out missing scripts.

**Acceptance rule:** only mark a commit verified when a real run for that exact commit has a complete PASS report. The presence of a workflow file or a test file does not meet this rule.

## Verification hardening (November 2026)
- A task cannot transition to `READY` or `RUNNING` with unfinished dependencies.
- Journal notes and evidence must be strings within limits; malformed history is rejected.
- The independent verifier refuses missing mandatory scripts, unavailable exact Git SHA, or uncommitted changes in tracked files.
- The release gate additionally requires the Persona production brief regression suite.
- Historical workflow job 128107143021 did not expose logs: the GitHub API returned HTTP 404 / BlobNotFound. Do not infer a test failure cause from that unavailable log.
- This release remains unverified until a complete exact-commit PASS report is produced and reviewed.

## Runner provisioning diagnostic
A minimal workflow is available at `.github/workflows/runner-provisioning-diagnostic.yml`. It requests an Ubuntu runner and executes only shell commands (no checkout, npm, secrets, or external services). If it also fails with no job steps, investigate GitHub Actions runner provisioning, repository Actions settings, organization policy, billing/usage restrictions, and GitHub service health before attributing failures to application code.

The diagnostic is **not a replacement** for application tests. A passing runner smoke test proves only that a runner can start and execute shell commands.

## Release report provenance
The release gate requires schema version 1, valid chronological start/end timestamps, and a Node runtime identifier, in addition to exact commit SHA and the full mandatory test suite. This remains a consistency check, not an attestation against fabricated JSON.

## Latest correction
The task journal's `READY` dependency check was previously described as applied, but the source still guarded only `RUNNING`. This discrepancy was corrected in commit `cd63c5fe21a25ab8609548de6b2d3a5ed57833d3`; the regression test now checks both transitions. Test execution at the latest SHA remains unconfirmed.
