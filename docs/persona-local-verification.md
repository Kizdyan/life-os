# Local verification — GitHub Actions is not a dependency

The project uses local, reproducible checks. GitHub Actions failures or missing logs do not block development of isolated changes. No CI job is required to run the commands below.

## Fast offline smoke (Node.js 22+)
From a clean checkout at the intended exact commit:

```sh
npm run verify:local:smoke
```

Runs seven independent Node built-in test suites for orchestration, end-to-end CLIs, release gate, marketing and production. No `npm install`, hosted runner, account token, network, AI API or deployment is invoked by the smoke wrapper. The test suites themselves must be reviewed before running against untrusted code. It writes an immutable report to `artifacts/persona-local-verification/<timestamp>-<uuid>/report.json`. The command exits nonzero on the first failing suite. It **does not** authorize merge, publication or deployment and **does not** satisfy the full release gate.

## Full local verification
Install project dependencies from the lockfile **only if needed**, then run:

```sh
npm ci --no-audit --no-fund
npm run verify:local:full
```

The full verifier requires a real 40-character Git HEAD and a clean tracked working tree. It runs typechecks, application unit tests, web build, Persona regression suites, skills validation, marketing, production, orchestration and release-gate regressions. It writes `artifacts/persona-verification/latest.json`. If FFmpeg and FFprobe are available, optional media checks may be added with `node scripts/persona-verify-independent.mjs --media`.

To evaluate a complete report against its exact SHA:

```sh
node tools/persona-release-gate.mjs --input artifacts/persona-verification/latest.json --sha <FULL_40_CHARACTER_SHA> --output artifacts/manual-gate-unique-name
```

The gate yields only `ELIGIBLE_FOR_HUMAN_REVIEW`, never automatic approval. JSON reports are locally editable and are **not cryptographic attestations**. For high-trust release review, inspect the exact source checkout, test console output and provenance independently.

## Known limits
- This project branch is not merged to `main`.
- A smoke PASS is not proof of end-to-end Persona video quality or real agent execution.
- The task dispatcher proposes work; it does not execute paid agents.
- A user-entered DONE evidence string is a journal note, not independent proof of completion.
- Existing unrelated workflows may still trigger in GitHub; their status is not a dependency for this local workflow.

## Local task evidence
A file-backed task completion can record the SHA-256 and byte size of an existing artifact. For example:

```sh
npm run tasks:journal -- --input board.json --id TASK-001 --to DONE --revision 1 --evidence "Reviewed local test output" --evidence-file artifacts/test-output.txt
```

The journal distinguishes `LOCAL_FILE_HASH` from `USER_TEXT_ONLY`. The file hash proves only that a particular byte sequence was read; it does not prove that the file is trustworthy or that the task's acceptance criteria were satisfied. Use `npm run evidence:test` for evidence regressions. The standalone `npm run evidence:hash -- --input FILE --output NEW_DIRECTORY` creates a separate non-overwriting evidence record. `verifyEvidence` can compare a current file with an earlier record and return `MATCH` or `MISMATCH`.

These tests are now mandatory in both the local smoke and full local verification, and in the full release review gate.

## Explicit offline task execution (new)
The task dispatcher remains planning-only. The new local executor performs **actual** Node test work, but only for an allowlisted repository test file and only when invoked explicitly. It never starts an AI agent or arbitrary shell command.

A task may opt in with `"kind":"engineering","execution":{"type":"node-test","file":"tools/persona-evidence.test.mjs"}`. Only hard-coded approved test paths are accepted.

Run one READY task:

```sh
npm run tasks:execute:local -- --input board.json --id TASK-001 --output artifacts/task-001-run --revision 0
```

This changes the board from READY to RUNNING, executes `node --test` with no shell, writes `execution.json`, and records DONE only for exit code 0. A failed test becomes FAILED. An interrupted or infrastructure-failed attempt remains RUNNING for human recovery, never automatically retried. A DONE task receives file-backed evidence but this is **not** a semantic quality assessment.

Run a dependency-aware batch (up to 10 tasks by default, max 50):

```sh
npm run tasks:batch:local -- --input board.json --output artifacts/batch-unique --max-tasks 10
```

The batch executes sequentially, moves unblocked QUEUED tasks to READY, stops on failure or unsupported execution metadata, and writes `batch-summary.json`. It does not execute remote agents or publish outputs. Never point it at untrusted repository test files.

Tests: `npm run tasks:execute:test` and `npm run tasks:batch:test`. Both suites are included in offline smoke and full verification, and required by the full release gate.
