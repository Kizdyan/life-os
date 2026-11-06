# AI work protocol — Life OS / Persona

## Default execution loop
1. Read PROJECT_GOALS.md, DEPENDENCIES.md, ACCEPTANCE_CRITERIA.md and current PR status.
2. Select the first unmet dependency. State one measurable task outcome and how it will be proven.
3. Inspect existing code and services before writing. Check actual file content and current blob SHA.
4. Change the smallest coherent surface on an authorized feature branch. Preserve main, approved media and existing services.
5. Read back every changed file or inspect the diff. Check imports/exports and call sites; do not assume a string replacement succeeded.
6. Run available automated validation on the exact commit. If unavailable, identify the blocker and implement an independent cloud route; do not invent a pass.
7. If a test fails, reproduce, fix and rerun. If a provider quota or runner fails, classify as infrastructure, not code.
8. Report: implemented, verified, blocked, cost, and next dependency. One task at a time.

## Decision rights
Autonomous: read repository, inspect connected service status, propose design, modify authorized non-main branch, add tests and documentation, review changes.
Requires user approval: merge into main, production release, spending money, creating paid services, deleting data, changing existing production settings, overriding an approved creative choice.
When approval is missing, perform all safe preparatory work and present the smallest decision needed.

## Incident-derived lessons
- A commit does not mean the change was applied correctly: read back the changed content.
- Do not claim full TypeScript coverage when only selected files are checked.
- Do not claim cloud verification when Vercel or GitHub returns a quota/startup failure.
- Do not create infrastructure as a substitute for diagnosis.
- Do not repeatedly request a desktop computer: the product must be operable from iPhone.
- Avoid mixing unrelated features into one large PR.
- Separate creative quality from engagement optimization; the user approves the final artistic direction.

## Independence limitation
Chat execution stops when the turn ends. Continuous unattended execution requires a separately configured agent or automation with permissions, limits, logs and an explicit schedule. Never claim background work is running without such a mechanism.
