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
