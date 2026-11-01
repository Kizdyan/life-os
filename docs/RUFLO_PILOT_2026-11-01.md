# Ruflo (former Claude Flow) — isolated capability pilot for Life OS / Erika / Persona / Dive M+

## Source and claims
- Video uploaded 2026-11-01: 67 seconds, 512×910, Ruflo logo, terminal demo, Researching / Coding / Testing and multi-agent scheduling visuals.
- Upstream: https://github.com/ruvnet/ruflo
- CLI/docs: https://github.com/ruvnet/ruflo/blob/main/README.md
- Upstream advertises 98+ agent definitions, MCP, RAG memory, swarms, cross-provider routing and background workers. **These are vendor claims, not benchmarks of our system or proof of 100 active free models.**
- The upstream README makes a critical distinction: Claude marketplace plugins are limited; `npx ruflo init` creates `.claude/`, `.claude-flow/`, `CLAUDE.md`, config and hooks in the target project. Running that command inside our production checkout could conflict with existing agent instructions and Skill Registry.

## Architecture decision
**DO NOT run `npx ruflo@latest init` in `Kizdyan/life-os` or `Kizdyan/dive-m` yet.**

Preserve existing independent source of truth: Life OS/Erika Orchestrator + Policy Engine + Observer + Audit Log + Undo + Memory + typed tools. Treat Ruflo as an optional external adapter, never as owner of state, credentials, publication or production database. Never auto-enable a new memory store or autonomous swarm in a real user workspace.

## What is implemented in this PR
- `packages/core/src/ruflo-pilot.ts`: pure guarded **trial assessment** and paired baseline-vs-Ruflo measurement evaluation.
- `scripts/ruflo-pilot.test.mjs`: regression coverage; no external providers, agent binaries, accounts or data.
- `scripts/ruflo-pilot-report.mjs`: read-only CLI to inspect the request and compare objective measurements supplied by a separate trusted observer.
- `docs/examples/ruflo-request.json`: synthetic fixture; no real names, personal data, client projects or secrets.
- **No Ruflo install, CLI execution or MCP connection is made here.** `sandbox_ready` means the request is eligible for a separate user-authorized pilot, not that anything has run. `worth_expanding` is not production approval.

## Windows / Codex isolated experiment (requires separate review before commands that install tools)
1. Snapshot existing `.claude`, `.agents`, MCP configuration, tasks, and current baseline without leaking secrets.
2. Check upstream license, security, current pinned version and transitive dependencies. Audit installation scripts and tool permissions. Disable telemetry/daemon/background workers unless independently needed and approved.
3. Create a **new empty disposable directory** and separate Git branch/worktree with synthetic, public fixtures, zero production credentials and no access to user-owned video or finance records. In that directory only, use reviewed and pinned Ruflo version. Avoid `curl | bash` and `npx @latest` without preview.
4. Compare baseline single-agent vs Ruflo researcher/coder/tester on the **same 2–3 public synthetic tasks**, same snapshot and test suite, independent observer, runtime limits (<=600s per run), cost limit <=$5 per pilot, no external effects.
5. Run the local preflight: `node --experimental-strip-types scripts/ruflo-pilot-report.mjs plan docs/examples/ruflo-request.json` (this sample deliberately requires explicit owner approval; it will not invoke Ruflo).
6. When real evidence is obtained, save JSON with `TrialMeasurements` fields: runId, observer, fixture SHA256, output SHA256, measured, cases/passes/critical defects, time, total USD and tokens or null. Then use `... report.mjs compare baseline.json pilot.json`.
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