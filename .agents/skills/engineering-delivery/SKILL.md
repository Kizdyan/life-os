---
name: engineering-delivery
description: Use when implementing, debugging, reviewing, or verifying code changes in Life OS, Persona, Media OS, Dive M, or shared services.
---
# Engineering delivery
## Goal
Deliver small, verifiable changes, not large speculative rewrites. Use Superpowers test-driven-development, systematic-debugging, and verification-before-completion when available.
## Workflow
1. Inspect current branch, relevant files, package scripts, dependencies, and existing tests. Do not assume a PR is green.
2. Define one acceptance test and failure condition. Prefer a failing test first; keep implementation minimal.
3. Read current API documentation via Context7 when a third-party library API matters.
4. Work on an isolated feature branch. Never edit or merge main, production configuration, secrets, or source media without explicit approval.
5. Run the smallest relevant test first, then typechecks, full unit tests, build and affected media/integration tests. Record exact SHA, commands, exit codes and artifacts.
6. If runner is unavailable, mark NOT_RUN rather than PASS. Distinguish infrastructure failure from test failure.
7. Produce a PR summary: behavior, evidence, risks, rollback, remaining blockers. Ask for approval before merge.
## Definition of done
The user-visible flow works end-to-end and has reproducible evidence. A skill file or CI configuration alone is not evidence of execution.
