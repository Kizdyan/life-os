# Persona dependency and delivery order

1. **Reproducible cloud validation**: install, typecheck, unit tests, build, logs, and immutable commit identity. Independent of the user's computer.
2. **Isolate PR #147 changes**: inventory, split or cherry-pick coherent features only after verified checks; no automatic merge.
3. **Idea and editorial workflow**: goal -> research and sources -> multiple concepts -> independent critique -> author approval -> versioned script.
4. **Shoot-ready production**: approved Reel script -> shot list and capture checklist; approved carousel script -> slide-by-slide structure.
5. **Media foundations**: authenticated upload -> durable asset storage -> persistent jobs -> renderer -> output download and preview.
6. **Quality gates**: visual fidelity, skin tone, white balance, audio, subtitles, continuity, carousel legibility; user approval.
7. **Publishing and analytics**: export and publishing preparation -> real Instagram metrics -> hypothesis tracking -> next iteration.
8. **Automation and resilience**: reusable footage, 90-day planning, backups, provider migration and cost controls.

## Dependency policy
Do not describe a stage as done until its exit criteria in ACCEPTANCE_CRITERIA.md pass. A later feature may be prototyped in an isolated branch, but must not bypass earlier gates.

## Current bottleneck (2026-11-06)
PR #147 GitHub Actions runs fail before job steps are available. Vercel has shown build-rate-limit failures on recent commits. This is an infrastructure verification gap, not proof that application tests pass or fail. Existing Render services must be inspected before adding resources. No new paid service is authorized.
