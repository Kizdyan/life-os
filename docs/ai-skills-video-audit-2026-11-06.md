# AI Skills & MCP candidate audit — source-led register

Updated: 2026-11-06. **Inventory and triage, not an installation report.** This file is isolated to the PR branch; it does not change main or production.

## Evidence and scope
- Historical source: user-provided *Полный реестр вложений, идей и внедрений* (2026-11-03), bank of 65 annotated clips; 142 MP4 files were technically catalogued then. The registry explicitly says many clips were not fully transcribed and claims were not independently fact-checked.
- Other source: two conversations named «Анализ видео»; their complete original attachments are **not presently accessible in this execution context**. No claim of having reviewed every video.
- Existing code evidence: repo-local `.agents/skills/capcut-persona/SKILL.md` and `scripts/capcut-handoff.mjs` (handoff only; not native CapCut automation).
- Categories: **Connected** means ChatGPT connector only; **Repo skill** means instructions exist in repo; **Candidate** means not installed or executed; **Tested** requires reproducible execution evidence.

## Candidate register
| Candidate | Intended use | Products | Current evidence | Decision / next gate |
|---|---|---|---|---|
| Superpowers: TDD, systematic debugging, verification, code review, worktrees | Engineering quality | All | ChatGPT skill plugin connected | USE for review discipline; not evidence CI passed |
| Context7 | Current API docs | All coding | ChatGPT connector connected | USE on specific libraries |
| GitHub MCP | Branches, PRs, reviews | All | Connected | USE; no main merge without approval |
| Independent Node verifier | Typecheck/tests/build/media preflight | Persona | PR #149 script, not run on full checkout | P0: run on isolated executor and record exact SHA |
| Railway | Independent execution | All | Connected; project list empty at audit | P0: inspect billing/permissions before creating resource |
| Render sandbox / workers | Isolated jobs and media tasks | Persona, Life OS | Connector/skills available; executor not verified | P0: sandbox smoke test if quota/permissions allow |
| Playwright | Browser E2E | Life OS, Media OS, Persona | Candidate | P0: first test staging only, no production mutation |
| CodeQL / Semgrep | Static security analysis | All | Candidates | P1: trial on isolated PR |
| Remotion | Deterministic video composition | Persona | Candidate | P0: one owned-footage render vs FFmpeg baseline |
| FFmpeg / ffprobe | Encode and objective media QA | Persona | Existing pipeline | KEEP, measure actual export |
| whisper.cpp | Local transcription | Persona | Draft integration in PR #128 | P0: real model and owned clip test |
| PySceneDetect | Shot boundary detection | Persona | Candidate | P1: benchmark accuracy on 3 clips |
| CapCut Persona Skill | Editable editing handoff | Persona | Repo skill and generator exist | KEEP; verify native CapCut import manually |
| Unofficial CapCut MCP / VectCutAPI | Draft CapCut projects | Persona | Candidate, unofficial API | HOLD until source, license, security and Windows compatibility audit |
| OpenMontage / DaVinci Skills | Editing workflow | Persona | Names from historical discussions | RESEARCH exact repo before installing |
| n8n | Workflow orchestration | Life OS, AI Capacity OS | Candidate | P1: compare with existing worker before hosting |
| Claude-Mem / Headroom / Task Observer | Memory, context and agent observation | AI Capacity OS, Erika | Names from prior discussions | P1: verify upstream identity and overlap |
| Ruflo | Multi-agent orchestration | AI Capacity OS | PR #136 sandbox/evidence prototype; Ruflo itself not run | HOLD until isolated reproducible benchmark |
| OpenHands / Aider / agent-desktop | Coding / computer-use agents | AI Capacity OS, Erika | Candidates; agent-desktop named in clip #62 | P1: permissions and isolated benchmarks |
| OmniRoute / FreeLLMAPI / AirLLM / All Free Models | Model routing / local model experiments | AI Capacity OS | Historical names; clip #61 lists models | P1: measure cost, latency, quality and data policy |
| Figma | Design system and UI workflow | Life OS, Media OS | ChatGPT connector connected | USE only with a selected authorized file |
| PostHog | Product analytics and diagnostics | Life OS, Media OS | ChatGPT connector connected | Inspect project before adding SDK or events |
| vidIQ / Metricool | Content analytics and scheduling | Persona | Connected | Audit real metrics, no automatic publishing |
| Skills.sh / Anthropic Skills | Skill discovery | All | Candidate catalogs | P1: inspect each source/permission; no bulk install |
| ChatPlace MCP / JARVIS concept | Agent integrations | Erika, AI Capacity OS | Clip #46 / #65 historical summaries | RESEARCH exact repository and permission model |

## Video-source reconciliation
Prioritize clips #01, #02, #05, #08, #11, #20, #21, #25, #30, #31, #37, #44, #45, #46, #50, #52, #54, #58, #59, #61, #62, #65. They describe AI editing, agent computer control, MCP, resource catalogs and model routing. **Do not attribute a named repository to a clip unless visible or transcribed evidence confirms it.**

## Acceptance criteria
1. Confirm canonical repository, maintainer, license, release recency and dependency/security posture.
2. Compare against existing implementation; reject duplication without measurable benefit.
3. Benchmark on synthetic or expressly authorized data in an isolated environment; record SHA, exact commands, outputs, runtime, cost and errors.
4. Review scope: no credentials to untrusted agents; no arbitrary code execution on production; no paid resource, publishing, merge or modification of original media without approval.
5. Mark VERIFIED only after execution; otherwise retain CANDIDATE, BLOCKED or REJECTED.
