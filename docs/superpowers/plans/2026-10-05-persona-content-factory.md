# Persona Content Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Persona prototype with an autonomous, QA-gated content factory from idea discovery through approval, distribution and learning.

**Architecture:** Introduce a persistent content-job state machine and specialist adapters around the existing Persona UI/API. Voice feedback becomes durable manual-stop audio followed by transcription and semantic revision; content passes independent marketing/media/final QA before Approval Center. Distribution and analytics are capability-driven so Instagram/VK/YouTube integrations can be added without coupling UI to one provider.

**Tech Stack:** Existing Life OS React/TypeScript web app, existing API/server stack and Supabase persistence, connected publishing/media capabilities, Vercel deployment.

**Spec:** `docs/superpowers/specs/2026-10-05-persona-content-factory-design.md`

## Global Constraints
- Mobile-first iPhone UX.
- `Persona` is internal-only and forbidden in generated public content unless explicitly requested.
- Persona voice capture stops only by explicit user action.
- Preserve original audio before transcription.
- Never show routine pre-QA drafts as ready-to-publish.
- Final publishing requires user approval.
- Idea Bank is dynamic and not limited to three hard-coded topics.

## Review Focus
- Long voice feedback with pauses must remain complete until manual stop.
- Natural multi-part revision instructions must apply all intended changes.
- Oversized/duplicated carousel copy must fail QA rather than reach Approval Center.
- Missing media/publisher capability must surface honestly and request only the necessary user action.
- Previously rejected/used ideas must not be recycled as fresh recommendations without a reason.

---

### Task 1: Content Factory domain model and state machine
**Files:** create focused Persona domain/state modules under `apps/web/src/` following existing project conventions; add corresponding tests.
**Interfaces:** produces typed Idea, ContentJob, Revision, QAReport, StylePreference and job transition functions consumed by later tasks.
- [ ] Write failing tests for valid workflow transitions, QA rejection loop, approval gate and forbidden direct publish-before-approval.
- [ ] Run focused tests and verify failure.
- [ ] Implement typed models and deterministic transition reducer/state machine.
- [ ] Run focused tests and verify pass.
- [ ] Commit.

### Task 2: Persistent Idea Bank and anti-duplicate strategy
**Files:** add Idea Bank service/persistence adapter and migrate Persona UI away from the three-item primary selector; tests.
**Interfaces:** consumes content history; produces ranked dynamic ideas with use-now/keep-later/not-interested/used states.
- [ ] Test >=10 candidates when context supports it, state persistence, used/rejected suppression and similarity dedupe.
- [ ] Verify tests fail.
- [ ] Implement ranking/state/dedupe and dynamic UI list.
- [ ] Verify tests pass.
- [ ] Commit.

### Task 3: Durable push-to-record voice feedback
**Files:** replace Persona speech-recognition/autostop path with recorder + upload/transcription boundary; tests.
**Interfaces:** produces `{audioRef, rawTranscript, normalizedTranscript}` revision input only after explicit stop.
- [ ] Test that pauses do not stop recording, explicit stop does, and long input is not truncated/duplicated.
- [ ] Verify failure.
- [ ] Implement manual start/stop recording, durable audio persistence and post-stop transcription call.
- [ ] Verify pass on unit/integration tests and iPhone browser flow.
- [ ] Commit.

### Task 4: Semantic revision orchestrator
**Files:** add revision-intent/orchestrator service; replace heuristic string rules in current Persona revision flow; tests.
**Interfaces:** consumes full transcript + current job/draft/style/history; produces structured revision operations routed to responsible specialists.
- [ ] Test multi-part Russian instructions including removing internal `Persona`, fixing overlap/readability and marketing-strength requests.
- [ ] Verify failure.
- [ ] Implement LLM-backed semantic revision contract with schema validation and safe fallback preserving the user's command.
- [ ] Verify pass.
- [ ] Commit.

### Task 5: Production specialist pipeline
**Files:** add orchestrator plus Writer, Designer, Photo, Video, Platform Adapter interfaces and capability registry; tests.
**Interfaces:** consumes ContentJob brief/assets; produces platform-specific candidate packages and missing-asset requests.
- [ ] Test carousel, photo and video job routing and concrete capture assignment when source material is missing.
- [ ] Verify failure.
- [ ] Implement specialist contracts and sequential/conditional orchestration; wire currently available capabilities without claiming unavailable transformations.
- [ ] Verify pass.
- [ ] Commit.

### Task 6: Marketing, media/design and independent final QA loop
**Files:** add critic services, scoring/issues schema and automatic reroute loop; tests.
**Interfaces:** produces QAReport and either `qa_passed` or target-role rework request.
- [ ] Test hook/readability/CTA, internal-word ban, duplicated copy, overflow, photo/video/audio checks and max-loop failure handling.
- [ ] Verify failure.
- [ ] Implement independent critics and final controller; route failures automatically to responsible role until pass or explicit blocked state.
- [ ] Verify pass.
- [ ] Commit.

### Task 7: Approval Center UX
**Files:** replace prototype correction area with final-package Approval Center while retaining natural voice/text revision; tests.
**Interfaces:** consumes only QA-passed packages; produces approve/change/reject/keep-later events.
- [ ] Test non-QA content cannot appear as ready; approved package shows platform preview, timing and QA summary; voice revision re-enters pipeline.
- [ ] Verify failure.
- [ ] Implement mobile-first Approval Center and remove public-facing internal branding.
- [ ] Verify pass with responsive/browser checks.
- [ ] Commit.

### Task 8: Distribution adapters and publishing gate
**Files:** add publishing capability adapters and orchestration around connected Instagram/VK/YouTube paths; tests.
**Interfaces:** consumes approved platform package; produces scheduled/published/blocked result with external IDs where available.
- [ ] Test approval requirement, per-platform adaptation, capability errors and idempotency.
- [ ] Verify failure.
- [ ] Implement adapters for capabilities actually available in the environment; keep unsupported actions explicitly blocked rather than simulated.
- [ ] Verify pass.
- [ ] Commit.

### Task 9: Analytics and style-learning feedback loop
**Files:** add publication-result ingestion and preference-learning service; tests.
**Interfaces:** consumes outcomes + explicit revisions/approvals/rejections; updates strategy/style memory without overfitting one correction.
- [ ] Test explicit always/never rules, repeated preference strengthening, one-off correction non-overfit and performance feedback into ranking.
- [ ] Verify failure.
- [ ] Implement learning/update logic and strategy hooks.
- [ ] Verify pass.
- [ ] Commit.

### Task 10: Migration, end-to-end verification and deploy
**Files:** migration glue, E2E tests, deployment configuration as needed.
**Interfaces:** proves the whole path: Sense/Idea → Create → Critic loop → Approval → Distribution result → Learn.
- [ ] Add E2E scenarios for carousel, photo, video, long voice revision and blocked integration.
- [ ] Run full unit/integration/E2E suite; fix regressions until green.
- [ ] Build production bundle and verify no public `Persona` branding leaks into generated fixtures/output.
- [ ] Deploy preview to Vercel and run iPhone-sized browser verification including long voice capture and overflow checks.
- [ ] Inspect CI/deployment status; do not claim completion until all required checks are green and the preview responds successfully.
- [ ] Commit final fixes and provide the verified preview URL.
