# Autonomous Development Engine 2.0 M1.5–M2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue automatically from accepted M1 into approved work and add conservative, durable Codex budget control without changing `LOCAL_ONLY`.

**Architecture:** Extend the single checked-in requirement registry with milestone dependencies and persist activation decisions in SQLite. Add a provider-neutral budget module that parses the official Codex app-server contract, derives conservative policy state, and runs only outside `LOCAL_ONLY`.

**Tech Stack:** Python 3, SQLite, Codex app-server JSON-RPC over stdio, unittest.

**Spec:** GitHub issue #86 and `MASTER EXECUTION — Autonomous Development Engine 2.0` supplied 2026-10-17.

## Global Constraints

- Preserve SQLite, worktrees, dirty user files, `AUTO_HYBRID`, and selected `LOCAL_ONLY`.
- Never run Codex or query Codex quota in `LOCAL_ONLY`.
- Activate only approved registry work; do not manufacture activity.
- Persist unknown/stale states truthfully; never invent quota percentages.
- Use small reversible TDD slices and install through the existing service.

## Review Focus

- Accepted milestone activates an approved successor exactly once.
- Missing or failed evidence blocks dependent activation.
- One blocked task does not stop eligible work for another product.
- Missing, stale, malformed, or partial usage data yields conservative `UNKNOWN`.
- Weekly reserve blocks expensive work even when the short window has capacity.

---

### Task 1: Milestone Orchestrator

**Files:** `supervisor.py`, `planner-registry.v1.json`, `test_supervisor.py`.

**Interfaces:** Produces `advance_milestones(store, mission) -> list[str]`; consumes registry milestones and durable job states.

- [ ] Write and run RED activation, evidence, deduplication, and independent-work tests.
- [ ] Implement durable activation and event history.
- [ ] Seed only explicitly activated milestone items.
- [ ] Run focused/full Supervisor tests and commit.

### Task 2: Codex Budget Contract and Policy

**Files:** Create `codex_budget.py` and `test_codex_budget.py`; modify `supervisor.py` and `config.example.json`.

**Interfaces:** Produces `read_rate_limits`, `normalize_rate_limits`, and `evaluate_budget` for the official `account/rateLimits/read` contract.

- [ ] Write and run RED parser/policy tests for multi-bucket data, reserve, stale data, and task estimates.
- [ ] Implement provider-neutral snapshots and `NORMAL/CAUTION/DRAIN/QUOTA_BLOCKED/UNKNOWN`.
- [ ] Write RED Supervisor test proving `LOCAL_ONLY` performs zero probes.
- [ ] Add bounded refresh outside `LOCAL_ONLY`, durable state, and API exposure.
- [ ] Run focused/full regressions and commit.

### Task 3: Installed Acceptance

**Files:** Update registry; create durable audit under `~/.life-os-supervisor/audits/`.

- [ ] Run Supervisor tests, repository regression, typechecks, and build.
- [ ] Restart only idle Supervisor and verify systemd recovery.
- [ ] Verify `LOCAL_ONLY`, SQLite integrity, zero Codex probes, and activation history.
- [ ] Observe an approved bounded next task execute or record its genuine blocker.
- [ ] Save exact SHA, rollback SHA, and machine-readable audit.

