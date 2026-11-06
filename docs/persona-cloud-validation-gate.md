# Persona cloud validation gate — 2026-11-06

## Verified infrastructure inventory
Render workspace has four existing static sites, each on a different branch, with build command `npm install && npm run web:build`:
- life-os-hero-identity-preview — feature/hero-identity-iphone-v1 — auto deploy off
- life-os-persona-creative-v1 — feature/persona-creative-loop-v1 — auto deploy on
- life-os-persona-prototype — prototype/persona-quality-loop-v0 — auto deploy on
- life-os-production — recovery/iphone-static-supabase — auto deploy on

All report buildPlan `starter`. This field alone does not establish actual billing or remaining free allowances. None validates PR #147. Do not repoint these services or incur costs without approval.

## Current PR validation
- GitHub Actions workflows fail without usable step diagnostics; infrastructure root cause not proven.
- Recent Vercel status links show `build-rate-limit`; no current successful full-suite run on latest SHA.
- The repo now has a cloud build command in vercel.json including `web:typecheck`, plus a portable validation script.
- The Render preview blueprint is configuration only; it has not been provisioned.

## Next independent validation — no personal computer
1. Find a confirmed zero-additional-cost cloud executor with GitHub private-repo access, build logs and an explicit spending cap. Prefer reusing existing account capacity only if the service can be isolated without changing live branch or settings.
2. On exact PR HEAD, run `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run web:typecheck`, `npm run api:typecheck`, `npm test`, `npm run web:build`.
3. Preserve per-command exit codes and logs, fix code failures, rerun on the resulting SHA.
4. Do not mark the gate PASS until all six commands pass on the same SHA.
5. Only then isolate PR features and begin scenario/editorial workflow implementation.

## Decision boundary
No new paid Render service, no changes to existing Render deployments, no main merge and no production release without explicit approval.
