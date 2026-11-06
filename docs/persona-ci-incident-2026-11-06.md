# CI incident diagnosis — 2026-11-06

PR: https://github.com/Kizdyan/life-os/pull/147
HEAD at inspection: ff070bc20a9d1741583a72a858e8145e2619c514

## Observations

All four pull_request workflow runs started at 2026-11-06T11:52:41Z and were marked failed at approximately 11:52:44Z:

- deploy-readiness — run 42213455527, job 127877520251
- Media Brain CI — run 42213455647, job 127877520301
- core — run 42213455554, job 127877519661
- Persona Comparison Studio Chrome E2E — run 42213455519, jobs 127877519659 and 127877519889

GitHub API job-step queries returned empty step arrays for all five jobs. Job-log downloads returned 404 BlobNotFound.

## Assessment

The evidence is consistent with a runner provisioning, Actions billing/quota, account restriction, or workflow startup issue. It is **not** evidence that the TypeScript or test suite itself failed. Exact cause is unconfirmed until GitHub Actions run UI diagnostics and account billing/usage are inspected.

## Required next checks

1. Open each run in GitHub Actions and inspect the run-level failure banner / annotations, including runner allocation or billing messages.
2. Check Actions permissions, runner availability and usage/billing status for the repository/account.
3. Run `npm ci && npm run typecheck && npm test && npm run web:build` in an independent local or self-hosted environment, capturing command exit codes.
4. Only after establishing actual test failures should source fixes be made.

Do not rerun repeatedly until the external failure condition is identified. Do not merge the draft PR based on unexecuted checks.
