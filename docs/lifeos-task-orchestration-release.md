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
