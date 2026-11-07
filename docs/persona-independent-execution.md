# Independent Persona engineering: act and agent assessment

## Decision (2026-11-06)

**Use the portable Node verification script first.** `node scripts/persona-verify-independent.mjs --install --media` runs supported project scripts and saves a machine-readable result. It is not dependent on GitHub-hosted Actions or Vercel. For a lightweight command inventory: `node scripts/persona-verify-independent.mjs --dry-run --media`. The script is not yet validated on the exact PR head. The report's commit field must be supplied by the executor via `PERSONA_COMMIT_SHA`; without it the report cannot prove SHA provenance.

**Evaluate nektos/act as an optional compatibility layer**, not a prerequisite. Repository: https://github.com/nektos/act . It executes GitHub workflow definitions via Docker Engine. It needs a trusted Docker host, network access for initial images/actions, and potentially large images; default runner images are not fully equivalent to GitHub-hosted ubuntu-latest. It does not create free compute and should not be run with production secrets or untrusted PR workflows.

Proposed safe test on an authorized isolated host:
1. Confirm Docker daemon and CPU/RAM/disk budget.
2. Check out the **exact** PR SHA in a disposable worktree; do not execute arbitrary code from unknown contributors.
3. First run `node scripts/persona-verify-independent.mjs --dry-run --media`.
4. Install dependencies and run `node scripts/persona-verify-independent.mjs --install --media` with no production credentials. Record exit code, output JSON, commit SHA and FFmpeg availability.
5. Only after that, try `act -j test -W .github/workflows/core.yml` with an audited runner image. Do not assume it will reproduce every GitHub Actions behavior.
6. Compare results; treat runner-provisioning failure, build failure, test failure and missing tool separately.

**OpenHands** (https://github.com/OpenHands/OpenHands) is a possible future autonomous coding agent, not a replacement for the executor. Review sandbox permissions, model/API cost, secret access and ability to run local commands before any integration. **Anthropic Skills** (https://github.com/anthropics/skills) provides an instruction format, not compute. A project-specific skill can codify the gates in `docs/persona-engineering-gates.md`, but cannot prove tests passed.

## Restrictions

No automatic installs, Docker daemon access, paid API calls, production deployments, main merges or source-video changes. PR #148 and #149 remain draft until exact-commit verification. The current cloud verification blockade is GitHub jobs failing with no steps and Vercel's free daily deployment quota; neither constitutes a code-test result.
