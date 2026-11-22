# AI Capacity OS — portfolio-wide agent orchestration

**Scope: every user-authorized workstream**, not just media and not just software.
Life OS / Erika is the coordination layer. Persona, Dive M+, Media OS,
acting/career, composition/musical production, creative writing, photography,
learning, research, personal planning and finance can all submit tasks.
This is a *policy and prototype*, not a claim of live multi-agent operation.

## Non-negotiable principles

1. Choose Codex, Claude, a local model, a tool, or a human specialist using
   **measured task-specific quality**, not an assumed permanent role.
2. Reuse the existing product architecture and current names. Never rename
   folders, projects, or chats without the user's explicit direction.
3. Use one accountable task record with a project reference, task context,
   acceptance criteria, required capabilities, access scope and budget.
4. Treat GitHub skills, MCP servers, templates and community agents as
   **untrusted candidates** until reviewed, tested and approved for installation.
5. Require verified evidence for completion; agent self-report is not proof.
6. Preserve the provider-independent offline-first core. AI unavailability may
   defer AI work but must not break the daily planner or existing user data.
7. Protect sensitive records and prohibit consequential external actions
   without the appropriate approval and tool permissions.
8. Keep independent review and bounded retry loops; do not let agents endlessly
   rewrite each other's work.

## Representative capability families (non-exhaustive)

| Workstream | Example tasks | Verification |
| --- | --- | --- |
| Life OS / Erika | typed tool actions, scheduling, offline sync, analytics, voice UX | integration tests, persistence and state observer |
| Software / Dive M+ | product features, accessibility, web/mobile, architecture, deployment | builds, static analysis, tests, deployed checks |
| Persona / Media OS | scripts, captions, publishing plans, content analytics, video and photos | original-vs-output quality, analytics evidence, approval before publish |
| Acting / personal brand | casting self-tapes, portfolio, character analysis, copy, outreach drafts | brief adherence, creative review, no unsent messages marked sent |
| Music / musical | harmony, counterpoint, orchestration, vocal scores, arrangements | theoretical review, score/audio consistency, playable notation |
| Learning / research | courses, literature synthesis, quizzes, source validation | citations, answer keys, exercises, spaced review |
| Home / everyday | plans, material estimates, shopping research, routines | units, dimensions, constraints, prices and user approval to buy |
| Personal finance | budget, debt simulation, cash-flow scenarios, income ideas | reconciled arithmetic, assumptions, no transactions without approval |
| Health / fitness | educational explanations, non-clinical tracking and plan drafts | medical uncertainty, source review, no autonomous diagnosis/prescribing |
| Relationships / communication | reflection, conversations, rehearsal, message drafts | user judgment; no autonomous interpersonal outreach |

Capability names are extensible via `custom:<capability>`.
Each workstream supplies its own specialist acceptance criteria while sharing
the same admission, routing and evidence contract.

## Execution graph

Intake -> context/permissions -> plan -> discover tools and skills ->
select an eligible agent -> execute in a bounded sandbox -> independent QA ->
verify persisted or external artifacts -> present / request approval ->
record metrics -> learn from corrected outcomes.

- The smallest sufficient execution graph wins. Do not multiply agents for
  trivial tasks.
- Use different performers for independent verification where useful and
  eligible; never invent an independent review if none occurred.
- When no verified agent or integration is available, report BLOCKED or ask
  for the missing explicit connection; do not pretend tools are installed.
- A task in another repository retains its real source owner, repo, branch,
  current file versions and change-approval scope.
- `main` and production data must remain unchanged during capability trials.

## Skill Intelligence lifecycle

Discover -> inspect source, license, maintenance, dependencies and permissions ->
security review -> benchmark in isolation -> approve -> pin version ->
register installed tool/capability -> observe success -> replace/disable on
regression.

Prefer small, versioned, testable skills. Never execute unreviewed startup
scripts from a discovered repository or give them secrets by default.

## What is *actually* in the pilot

- Generic provider-neutral `routeAgentTask`, with extensible capability
  families and explicit access classification (public/internal/sensitive).
- Synthetic tests that exercise multiple workstreams. Their scores are sample
  fixtures, **not measured statements** about Claude or Codex quality.
- One video edit-plan adapter prototype; no video rendering or CapCut execution.
- Two media QA skills and this cross-portfolio policy.
- No API credentials, model usage charges or production changes.

## Metrics for rollout

For each comparable task type measure:
accepted deliverables; task completion time; number of revisions;
human minutes; total paid costs; regressions caught before release;
verification coverage; and user-rated usefulness.

The selected model may change over time as benchmarks change. Reports separate
measured outcomes from opinions and unknowns.

## Approval and safety

Analysis, drafts and reversible internal changes may be eligible for AUTO under
explicit policy. Real financial transactions, healthcare changes, public
publication, sensitive outreach, credential grants, deletions and irreversible
production changes require separately scoped human approval.
Data scopes are explicit and least-privilege. Neither vendor receives personal
records merely because it is generally strong at a task.

## Next concrete gates

1. Restore reliable CI so router tests and typechecking can be evidenced.
2. Calibrate model capability scores on actual **small, comparable tasks**
   across two or more workstreams; never infer from marketing claims alone.
3. Wire the generic task record and agent registry to the existing queue /
   Skills and Observer abstractions through an approval-reviewed PR.
4. Connect Claude Code, Codex and optional local agents only where
   subscriptions/API permissions and runtimes actually permit execution.
5. Pilot an output in each priority domain before scaling orchestration.
6. Expand through bounded, budget-aware jobs and audited measurable results.
