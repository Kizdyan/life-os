# Cross-product Skills / MCP audit and rollout plan
Date: 2026-11-06
Scope: Life OS, Persona, Media OS, Dive M, Erika, AI Capacity OS.
Status: REVIEWED PLAN, not an implementation/PASS claim. Source inventory: docs/ai-skills-video-audit-2026-11-06.md.

## Baseline (verified)
- Root package.json contains Vitest, TypeScript, Vite, Persona media/core tests and persona:scenario:delivery:test.
- scripts/persona-verify-independent.mjs runs typecheck, api:typecheck, test, web:build, persona:core:test and optional media:test; **it does not run persona:scenario:delivery:test**.
- The independent verifier has not yet been executed on a complete isolated checkout. No independent PASS.
- Railway is connected but has no projects. Do not provision paid compute without explicit cost approval.
- Figma and PostHog connectors are connected; they are not yet integrated into product runtime.
- Historical 65-clip registry and 142 MP4 catalog are incomplete as source-verification evidence; do not claim all clips were rewatched.

## Rollout order and gates

### P0 — Reproducible execution (blocker)
1. Extend isolated verifier to include persona:scenario:delivery:test and clearly report skipped checks, exact SHA, ffmpeg/ffprobe and artifacts.
2. Verify package-lock / dependency installation and inspect CI failure cause separately from test failures.
3. Evaluate free/approved sandbox (Render/Railway or authorized equivalent); no secrets, no production access.
4. Execute full checks on exact PR head, store logs + artifact + SHA. Gate: all required tests PASS, or precise failing commands recorded. No PR merge.

### P1 — Security and skill governance
1. Inventory all repo-local skills, connected plugins, external MCP servers, scopes, secrets, licenses and duplicate functions.
2. Apply Superpowers verification/TDD and Context7 documentation checks in code review.
3. Run CodeQL or Semgrep read-only on a PR; assess false positives and permission requirements.
4. Add Playwright staging smoke test for key user journey; no destructive operations. Gate: reproducible tests and reviewed permissions.

### P2 — Persona video quality (one vertical slice)
1. Baseline same owned source clip: original hash, metadata, color, face/glasses integrity, audio, captions, render time.
2. Compare existing FFmpeg render with Remotion proof-of-concept, only if objective benefit.
3. Test PySceneDetect on a few authorized clips, record precision/recall against manual cuts.
4. Verify existing CapCut handoff; unofficial CapCut MCP only in disposable local Windows sandbox after code/license audit.
5. Gate: exported vertical MP4 + editable project if promised + visual author approval + reproducible QA.

### P3 — Agents, memory and routing
1. Compare Ruflo/OpenHands/Aider against existing Codex/Claude on identical bounded tasks.
2. Compare Claude-Mem/Headroom/Task Observer against current context and observation mechanisms.
3. Compare OmniRoute/alternatives on latency, quality, token cost, error rate, privacy.
4. Gate: measured improvement without exposing private code/tokens to untrusted tools.

### P4 — Automation and analytics
1. Compare n8n with existing workers and scheduled workflows; build one isolated nonproduction workflow if warranted.
2. Inspect Figma file access and PostHog projects; design minimal event taxonomy before SDK integration.
3. Review vidIQ/Metricool for Persona insights, no automatic publishing.
4. Gate: useful measured outcome and approved data access.

### P5 — Source reconciliation
1. Cross-reference BOTH «Анализ видео» chats against the 65-clip bank and 142-file technical catalog.
2. Retrieve original media/transcripts where accessible; extract exact GitHub URLs, author claims and dates.
3. Deduplicate by hashes and canonical repo; validate upstream activity, license, security, compatibility.
4. Update candidate register with EVIDENCE / VERIFIED / REJECTED / BLOCKED; do not infer names from screenshots or summaries.

## Non-negotiable guardrails
- Do not touch main, production, original media, private credentials, paid resources or publication without specific authorization.
- One new tool per isolated experiment; benchmark against existing capability; reject unjustified overlap.
- No success claim without actual execution evidence; distinguish NOT_RUN from FAIL and PASS.
- Keep changes in isolated branches and PRs; do not merge without approval.
