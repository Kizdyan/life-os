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
