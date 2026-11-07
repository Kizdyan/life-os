# Ecosystem Capability Audit — 2026-10-26

Status: READ-ONLY AUDIT / EXPERIMENTAL DOCUMENT; **not production verified**.
Scope: ALL user workstreams, including Life OS / Erika, Persona, Dive M+, acting,
music/composition, research/learning, business, finance, health/fitness tracking,
household and personal organization. Nothing was renamed.

## Evidence classes
- **VERIFIED**: direct read-only inspection of connected account, source, or DB.
- **CODE_ONLY**: present in repository, not proven active in live runtime.
- **CANDIDATE**: vendor docs / community projects; not installed or benchmarked.
- **UNKNOWN**: no accessible account-level evidence.

## Inventory

| System | Observed state | Unused capability / dependency | Evidence |
| --- | --- | --- | --- |
| GitHub | VERIFIED: Kizdyan/life-os and Kizdyan/dive-m | CI, agent tasks, code review, skills, versioned acceptance tests | Connected repository listing 2026-10-26 |
| Codex / ChatGPT | AVAILABLE in current workflow; repo-local skills in experimental PR | dynamic routing + code/test reviewer; provider runtime not wired to queue | Existing working session + PR #104 |
| Claude Code | CANDIDATE; no active Claude execution verified | technical review, writing, media programming via installed tools | Anthropic Claude Code documentation |
| Local coding model | PRIOR CONTEXT: qwen2.5-coder:7b; current runtime unknown | offline non-sensitive fallback; benchmark first | Earlier project history |
| Supabase | VERIFIED: life-os-production ACTIVE_HEALTHY, 12 public tables, 6 ACTIVE Edge Functions | persistent job queue, approvals, audit, budget, typed actions | Connected Supabase inspection |
| Supabase actual DB usage | VERIFIED: 4 life records, 16 life mutations; 0 Persona projects/assets/provider jobs | instrumentation and persistence reconciliation | Read-only SQL COUNT on 2026-10-26 |
| Supabase security | VERIFIED: 6 authenticated-callable SECURITY DEFINER RPC advisories; 2 RLS tables without policies | investigate intended access policies before agent writes | Supabase advisor notices, 2026-10-26 |
| Supabase function auth | VERIFIED: 5/6 Edge Functions have verify_jwt=false; inspected runtime contains own session validation | full function-by-function threat-model and penetration tests | Connected function metadata and selected function source |
| Vercel web | VERIFIED: life-os-web latest checked production READY | integration/e2e tests; do not confuse deploy READY with functional correctness | Connected Vercel project/deploy list |
| Vercel iPhone preview | VERIFIED: latest checked production ERROR: STATIC_BUILD_NO_OUT_DIR, expected dist; branch previews READY | fix project-specific build/output settings | Connected deployment detail; Vercel project settings |
| GitHub Actions | VERIFIED: repeated recent PR checks reported failure; logs unavailable via connector | restore CI and unblock merge gates; cause UNKNOWN | workflow runs 2026-10-26 |
| Life OS core | CODE_ONLY: offline-first architecture, task outcome/logs, skills, observer, autonomy policy | make typed task queue actually dispatch agents with audits | docs/ARCHITECTURE.md, docs/AUTONOMY.md |
| Media Brain | CODE_ONLY: ingestion, media supervisor/worker, edit work packages, Yandex Disk adapter, QA tests | connect actual renderer/editor and metrics to app runtime | docs/MEDIA_BRAIN.md and packages/core/src |
| CapCut | PREFERRED local editing workbench, automatic control NOT VERIFIED | desktop draft editing once an adapter is evaluated | docs/MEDIA_BRAIN.md; no official public edit API assumed |
| FFmpeg / whisper.cpp / Remotion | EARLIER PROJECT CONTEXT / CANDIDATE runtime | cost-controlled local video processing, STT, motion graphics and subtitles | repo planning + prior project context; installation not tested |
| Yandex.Disk | CODE_ONLY OAuth and provider boundary; account connection UNKNOWN | media ingest/reference/style/asset storage | docs/MEDIA_BRAIN.md and api/media/yandex |
| Dive M+ | VERIFIED: Python Streamlit repo, research engine, diagnostic flow, optional Supabase/Resend boundaries | apply evidence-based prepublish assessments; avoid altering main product | Kizdyan/dive-m README and docs/PERSONAL_MEDIA_BRAIN.md |
| vidIQ | VERIFIED: connected service with 0 YouTube channels and 0 Instagram accounts linked | first link accounts; then analytics, ideas, scripts, packaging and research | connected vidIQ user_channels + instagram accounts |
| Metricool | VERIFIED: brand has no social networks connected | first link channels; then schedule/draft/measure content | connected getBrandSettings |
| Runway | VERIFIED: workspace authenticated, 0 credits, 0 available video models | creative generation only after plan+budget+quality test; not current production renderer | connected Runway whoami |
| Render | VERIFIED: workspace listed, services not inspected (workspace selection required) | optional long-lived background worker or cron | connected list_workspaces |
| Replit | VERIFIED: one older app accessible; no link to current portfolio verified | sandbox quick prototypes only where they beat existing stack | connected list_apps |
| Google Calendar / Drive | Tools available in current environment; current project linkage NOT audited | schedules, research files, approved document workflows | connector availability |
| Perplexity | PRIOR DISCUSSION; current connection unknown | bounded sourced research, only if incremental value verified | earlier user requirements |
| Musical score workflow | PRIOR CONTEXT: Sibelius/PDF score examples; editor/runtime integration unknown | MusicXML/engraving QA, harmony/counterpoint, export | user-provided work history |

## Capability extraction by outcome
1. **Recover reliable execution**: GitHub CI, iPhone deployment configuration,
   persisted observer and deterministic tests. Do not hide failure by reporting
   a successful Vercel preview.
2. **Secure the execution boundary**: review all six SECURITY DEFINER RPCs,
   both RLS-no-policy notices, all no-JWT Edge Functions and existing custom
   session code. Not all advisories require blindly disabling functionality.
3. **Single authoritative task record**: project/task/acceptance/source revision,
   data classification, provider, installed tool, state, spend budget, retry cap,
   artifact URL/hash and verifier result. Reuse existing queue before creating
   another tracking system.
4. **Measured capability registry**: benchmark Codex, Claude and local providers
   on comparable tasks; avoid assumed fixed roles. Select smallest sufficient
   agent/tool graph and separate author from reviewer when useful.
5. **Skill Intelligence**: discover GitHub skills/MCP/plugin candidates, inspect
   source/license/maintenance/permissions, test in an isolated environment,
   approve and pin versions, observe output quality and disable on regression.
6. **Portable workers**: keep Life OS functioning offline; use worker infrastructure
   for heavy media and long-running tasks, avoiding prolonged iPhone background
   execution. Supabase orchestrates state; the editor/renderer does real work.
7. **Media quality**: preserve immutable originals, reference-grounded grading,
   no face/eyes/glasses changes during color-only work, FFprobe/A/V checks,
   independent human creative approval, and cross-platform renditions.
8. **Social intelligence**: only after account connections, combine idea research,
   content strategy, drafts, scheduled posts and actual cross-channel analytics.
   Keep private credentials server-side; approval before publication.
9. **Daily Life OS analytics**: actual completion time, schedule adherence, move
   /miss states, subjective check-ins, sleep-energy correlations and retrospectives.
   Do not make health diagnoses or changes to care autonomously.
10. **Broader specialist workstreams**: acting portfolios, composition, learning,
    careful financial simulations and household planning all use the same task
    contract with tailored acceptance tests; bank transfers, sensitive messages,
    medical changes and purchases remain approval-gated.

## Priority order (not fabricated ROI percentages)

### P0 — unblock existing value
- Investigate/repair Vercel iPhone production `STATIC_BUILD_NO_OUT_DIR`,
  preserving the working `life-os-web` project.
- Diagnose GitHub Actions execution failures from run/check metadata and fix
  verified cause; require tests and typecheck before merge.
- Threat-model Supabase callable privileged functions and custom token boundary;
  resolve findings according to the intended authorization model.
- Reconcile actual Life OS/Persona production persistence and observer state.

### P1 — make one complete autonomous task work
- Connect a verified Codex executor to existing queue + Observer.
- Connect Claude Code only when its usage/auth and supported runner is known.
- Run comparable accepted tasks across **software and at least one non-software
  domain**, report evidence, then calibrate routing.
- Keep experimental PR #104 unmerged until QA is green.

### P2 — media and social effectiveness
- Test FFmpeg/Whisper.cpp local worker against *new synthetic footage*; QA frames,
  audio and original preservation.
- Audit CapCut MCP candidates in an isolated desktop environment; never rely
  on undocumented/private APIs as a critical dependency.
- Link actual social accounts to vidIQ/Metricool when user explicitly authorizes
  and measure results; no unapproved publishing.

### P3 — expand to all life tasks
- Calendar, Drive, personal research, actor/career, score production, learning,
  budgeting and home projects through provider-neutral adapters.
- Follow human attention, budget and data-scope gates.
- Add measurable outcome reviews and periodic skill re-evaluation.

## Cost policy
- Use existing subscriptions and local deterministic tools where suitable.
- Claude Pro provides Claude Code, but does **not** include general Claude API
  usage; OpenAI ChatGPT billing likewise differs from API billing.
- Do not auto-recharge any provider or purchase a new plan without the user's
  explicit decision.
- Evaluate actual accepted output per unit cost/human effort rather than
  credits consumed or agent-task count.

## Status statement
This audit is real read-only inspection plus scoped recommendations.
It does NOT prove that the router is deployed, that Claude/CapCut executes jobs,
that every service listed is connected, or that a release is safe.
No live data or settings were modified during the audit.
