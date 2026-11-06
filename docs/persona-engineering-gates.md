# Persona engineering execution gates

These rules apply to extraction and stabilization of PR #147 and follow-up Persona work.

1. **No unverified PASS.** Record exact commit SHA, commands executed, executor, exit codes and any limitations. A deployment marked READY is not proof that end-to-end video production works.
2. **Fix before expansion.** Do not create another functional extraction PR while #148/#149 lack an executable verification path, unless the new change is necessary to repair verification.
3. **Complete vertical slices.** Transfer implementation, import dependencies, compatible storage contracts and relevant tests together. A partial extraction must remain a draft and be explicitly labeled incomplete.
4. **Evidence over paperwork.** Do not count documentation-only commits, workflow retries or queued jobs as verified product progress.
5. **Investigate failures.** Distinguish runner provisioning failures (zero job steps, missing log blobs) from executed test failures. Try an authorized independent executor; never silently bypass a safety block.
6. **Protect production.** No main merges, production changes, paid model calls, paid infrastructure, original-media edits, or project renames without explicit authorization.
7. **Autonomous bounded batches.** Diagnose, implement, run checks, correct and recheck within one work cycle where possible. Report the concrete outcome and blockers; do not ask the user to operate development tools.
8. **Regression and quality gates.** Require deterministic unit tests, TypeScript checks, media/FFmpeg integration where relevant, and explicit manual iPhone verification for mobile capture. Never equate synthetic test data with original user footage.

## Current incident

GitHub Actions jobs on PR #148 and PR #149 have returned `failure` with no steps and unavailable log blobs (`BlobNotFound`). This is **not evidence of a failed application assertion**. A repeat run of PR #149 did not establish a passing test. Vercel previously passed 584 tests on an earlier #147 SHA, not on these extracted PR heads. Both PRs remain drafts until an exact-SHA executor verifies them.
