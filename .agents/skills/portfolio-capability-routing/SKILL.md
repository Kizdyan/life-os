---
name: portfolio-capability-routing
description: Route user-authorized work from any project or personal workstream to Codex, Claude or another agent using proven skills, available tools, privacy constraints and independent QA.
---

# Portfolio-wide capability routing

This skill applies to **every** task that can benefit from agent execution:
engineering, research, writing, marketing, photography, video, music,
composition, education, planning, analytics, career, everyday logistics and
other future workstreams. Do not restrict it to one product.

## Before working
1. Identify the exact existing project or workstream. Do not rename it.
2. Capture the desired user-visible output, acceptance criteria, current
   repository/file versions, access scope, available tools and budget.
3. Distinguish drafting/research from a consequential external action.
4. Classify source data as public, internal or sensitive. Only send the data
   to an agent with explicitly permitted access; otherwise do not route.
5. Check whether a single local tool is sufficient before invoking AI.

## Agent selection
- Use observed success on similar tasks, real runtime availability and
  installed verified tools, not assumptions about model superiority.
- Codex, Claude, local models, specialized tools and humans can each perform
  or review different kinds of work.
- Missing credentials, denied capabilities, unsupported interfaces and
  unknown scores must be reported as BLOCKED, not quietly bypassed.
- A GitHub skill/MCP integration found online is a CANDIDATE until inspected,
  sandbox-tested, permission-scoped, version-pinned and explicitly approved.
- Small reversible tasks can follow AUTO policy. Purchases, financial
  transfers, sensitive outreach, medical action, publishing, deletion or
  irreversible changes require their applicable human approval.

## Execution and QA
Plan -> execute -> independently inspect output -> verify actual files/state ->
document uncertainties -> accept or revise. Keep loops bounded and auditable.
Never mark tasks complete because an agent claims success. Preserve original
media, creative references, user data and existing production behavior.

## Output record
Record task ID, project, selected provider/tool, evidence behind assignment,
source versions, files changed, verified artifacts, test results, known
limitations, elapsed human work, estimated/actual costs, and the next blocker.

Full policy: docs/AI_CAPACITY_OS.md.
Video-specific QA: media-quality-audit skill.
