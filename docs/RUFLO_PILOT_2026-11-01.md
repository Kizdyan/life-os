# Ruflo (former Claude Flow) — isolated capability pilot for Life OS / Erika / Persona / Dive M+

## Source and claims
- Video uploaded 2026-11-01: 67 seconds, 512×910, Ruflo logo, terminal demo, Researching / Coding / Testing and multi-agent scheduling visuals.
- Upstream: https://github.com/ruvnet/ruflo
- CLI/docs: https://github.com/ruvnet/ruflo/blob/main/README.md
- Upstream advertises 98+ agent definitions, MCP, RAG memory, swarms, cross-provider routing and background workers. **These are vendor claims, not benchmarks of our system or proof of 100 active free models.**
- The upstream README makes a critical distinction: Claude marketplace plugins are limited; `npx ruflo init` creates `.claude/`, `.claude-flow/`, `CLAUDE.md`, config and hooks in the target project. Running that command inside our production checkout could conflict with existing agent instructions and Skill Registry.

## Security advisory and version policy (checked 2026-11-01)
- The upstream repository discloses critical **GHSA-c4hm-4h84-2cf3 / CVE-2026-59726** (CVSS 10.0), affecting the default Docker-compose MCP bridge for versions **below 3.16.3**, with unauthenticated remote code execution and possible theft of provider keys / poisoning of persistent agent memory. Fixed in 3.16.3. https://github.com/ruvnet/ruflo/security/advisories/GHSA-c4hm-4h84-2cf3
- The upstream release list also shows security fixes in 3.65.1 (DNS rebinding SSRF), 3.66.1 (federation trust) and 3.66.2 (Bearer parsing, sanitizer). Latest reviewed release here is **3.66.2** (2026-10-31). https://github.com/ruvnet/ruflo/releases
- Our evaluation gate requires an exact version number **>=3.66.2**, not a mutable `@latest` or a branch. This is a minimum preflight, **not a claim that Ruflo is free of vulnerabilities**. Audit source integrity, scripts, dependencies, config, and exposed listeners before any test execution.
- Never use default public Docker/HTTP MCP endpoints. Keep ports bound to loopback and no production API keys. No automatic federation/daemon/trader plugins.

## Architecture decision
**DO NOT run `npx ruflo@latest init` in `Kizdyan/life-os` or `Kizdyan/dive-m` yet.**

Preserve existing independent source of truth: Life OS/Erika Orchestrator + Policy Engine + Observer + Audit Log + Undo + Memory + typed tools. Treat Ruflo as an optional external adapter, never as owner of state, credentials, publication or production database. Never auto-enable a new memory store or autonomous swarm in a real user workspace.

## What is implemented in this PR
- `packages/core/src/ruflo-pilot.ts`: pure guarded **trial assessment** and paired baseline-vs-Ruflo measurement evaluation.
- `scripts/ruflo-pilot.test.mjs`: Vitest regression coverage, included in `npm test`; no external providers, agent binaries, accounts or data.
- `scripts/ruflo-pilot-report.mjs`: read-only CLI to inspect the request and compare objective measurements supplied by a separate trusted observer.
- `docs/examples/ruflo-request.json`: synthetic fixture; no real names, personal data, client projects or secrets.
- **No Ruflo install, CLI execution or MCP connection is made here.** `sandbox_ready` means the request is eligible for a separate user-authorized pilot, not that anything has run. `worth_expanding` is not production approval.

## Windows / Codex isolated experiment (requires separate review before commands that install tools)
1. Snapshot existing `.claude`, `.agents`, MCP configuration, tasks, and current baseline without leaking secrets.
2. Check upstream license, security, current pinned version and transitive dependencies. Audit installation scripts and tool permissions. Disable telemetry/daemon/background workers unless independently needed and approved.
3. Create a **new empty disposable directory** and separate Git branch/worktree with synthetic, public fixtures, zero production credentials and no access to user-owned video or finance records. In that directory only, use reviewed and pinned Ruflo version (security minimum 3.66.2 as of this assessment). Avoid `curl | bash` and `npx @latest` without preview.
4. Compare baseline single-agent vs Ruflo researcher/coder/tester on the **same 2–3 public synthetic tasks**, same snapshot and test suite, independent observer, runtime limits (<=600s per run), cost limit <=$5 per pilot, no external effects.
5. Run the local preflight: `node --experimental-strip-types scripts/ruflo-pilot-report.mjs plan docs/examples/ruflo-request.json` (this sample deliberately requires explicit owner approval; it will not invoke Ruflo).
6. When real evidence is obtained, save JSON with `TrialMeasurements` fields: runId, observer, fixture SHA256, output SHA256, measured, cases/passes/critical defects, time, total USD and tokens or null. Then use `... report.mjs compare baseline.json pilot.json fixture.json baseline-evidence.json pilot-evidence.json`; the CLI must independently hash the three supplied files and reject mismatches. A manually entered SHA-256 string or `measured: true` is not evidence by itself. Independent Observer still needs to inspect execution logs, outcomes, cost and any external effects.
7. Require no regression, independent verification, meaningful >10% gains or improved pass rate. Never accept Ruflo claims as actual measured performance. Report the results, costs, warnings and leftovers before any proposal for integration into the working app.

## What to benchmark
- **Life OS / Erika:** simple tasks stay one agent; only independent tasks (research/code/QA) may be parallelized. Check that action policy and Observer cannot be bypassed.
- **Persona:** source-owned footage only, deterministic render and independent media QA; test a synthetic video pipeline first, no model permission to change face and no publishing.
- **Dive M+:** read-only public marketing research and testable hypotheses, not automatic comments or collection of personal profiles.
- **AI Capacity OS:** compare the current routing/cost baseline to Ruflo; don't add redundant permanent memory, orchestrators or invisible autonomous loops.

## Release gates
- Real exact-head full CI and independent E2E in trusted Windows checkout.
- Narrow contract for a typed Ruflo adapter and explicit read-only permissions; all provider network actions must have separately authorized egress.
- Proof of no mutation outside sandbox and no secret disclosure.
- Human approval for any install in user workspace, external effects, production changes or public publication.
- Never describe this as a completed multi-agent integration until a real Ruflo run is independently observed.

## CI remediation (2026-11-01)
The initial CI attempt ran 207 existing Vitest tests successfully but failed to collect `scripts/ruflo-pilot.test.mjs`: it imported `node:test`, which Vitest does not collect as a suite. This test file now imports `test` from `vitest` and participates in the repository's normal test runner. Use `npm test` (or `npx vitest run scripts/ruflo-pilot.test.mjs`) to verify the checked-out PR. The earlier isolated `node --experimental-strip-types --test` invocation applies only to the **pre-fix** copy and must not be reported as the current verification command.
