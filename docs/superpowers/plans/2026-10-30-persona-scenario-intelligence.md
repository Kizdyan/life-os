# Persona Scenario Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one Persona flow from evidence-labelled references through an approved, original script into the existing Production Brief.

**Architecture:** A compact core model owns references, trend evidence, original ideas, immutable script revisions, editorial criticism and conversion guards. The existing Persona project record persists that workspace; `PersonaFactory` exposes it as one workspace step. Research providers remain a server-only boundary: the offline/manual provider works now and the Perplexity provider always returns disabled until explicitly configured.

**Tech Stack:** TypeScript, React, existing Vite/Vitest, existing Persona project store and production pipeline; no new package.

**Spec:** `docs/superpowers/specs/2026-10-30-persona-scenario-intelligence-design.md`

## Global Constraints

- Reuse existing Persona projects, Creative Profile, Reference Evidence, Format Memory and Production Pipeline.
- Never copy source video/transcripts, fabricate metrics, claim a metadata-only item was watched, or predict views.
- Perplexity is server-only, disabled by default, requires explicit key and request/spend limit, and is never called by tests.
- No paid calls, private-media upload, auto-publication, `main` changes, or new dependency.

## Review Focus

- A malformed or duplicate URL is rejected before it can become evidence — Task 1.
- A source with only title/description remains `metadata_only` — Task 1.
- A script revision clears prior approval without losing earlier revisions — Task 2.
- A blocking editorial finding prevents Production Brief conversion — Task 2.
- A missing key/limit never produces a network request or a fake research result — Task 3.

---

### Task 1: Evidence-backed trend and reference core

**Files:**
- Create: `packages/core/src/persona-scenario-intelligence.ts`
- Create: `packages/core/src/persona-scenario-intelligence.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces `ScenarioResearchItem`, `ScenarioReferenceAnalysis`, `ScenarioIdea`, `validateScenarioResearch`, `analyseScenarioReference`, and `suggestScenarioIdeas`.
- Consumes explicit source records and a Creative Profile summary; produces only evidence-labelled original concepts.

- [x] Write tests for URL/provenance validation, metadata-only status, unavailable source, and original ideas referencing existing research IDs.
- [x] Run the new test and confirm it fails because the core module is absent.
- [x] Implement the core model and deterministic idea suggestions with no inferred reach/view count.
- [x] Export the module and rerun the test.
- [x] Commit the independently tested core.

### Task 2: Script Doctor, revisions, approval and brief conversion

**Files:**
- Modify: `packages/core/src/persona-scenario-intelligence.ts`
- Modify: `packages/core/src/persona-scenario-intelligence.test.ts`

**Interfaces:**
- Consumes `ScenarioIdea` and `ScenarioScriptRevision`.
- Produces `createScenarioScript`, `reviseScenarioScript`, `reviewScenarioScript`, `approveScenarioScript`, and `scenarioScriptToProductionBriefInput`.

- [x] Write tests for separate dramaturg/director/producer findings, blocking weak scripts, revision history and approval invalidation.
- [x] Run the new test and confirm it fails.
- [x] Implement structural editorial checks and a guarded converter to the existing brief input.
- [x] Run core tests and existing production-pipeline tests.
- [x] Commit the editor cycle.

### Task 3: Disabled-by-default research provider boundary

**Files:**
- Create: `api/persona-research.ts`
- Create: `api/persona-research.test.ts`
- Modify: `packages/core/src/persona-scenario-intelligence.ts`

**Interfaces:**
- `resolveScenarioResearchProvider(request, env)` returns manual evidence or a disabled Perplexity status.
- It may expose configuration status but never returns a key or calls network without enable flag, key, and positive limit.

- [x] Write tests for disabled, absent-key, absent-limit and manual evidence cases; mock `fetch` and assert zero calls.
- [x] Run tests and confirm the endpoint is absent.
- [x] Implement the server-only boundary and explicit disabled messages.
- [x] Run endpoint tests and full API tests.
- [x] Commit the provider guard.

### Task 4: Persist scenario workspace in Persona projects

**Files:**
- Modify: `apps/web/src/personaProjectStore.ts`
- Modify: `apps/web/src/personaProjectStore.test.ts`

**Interfaces:**
- Add optional, versioned `scenarioWorkspace` to `PersonaProject`; legacy projects deserialize unchanged.
- `savePersonaProject` persists workspace revisions without altering media assets or timeline.

- [x] Write migration/round-trip tests for a project with research, references and script revisions and a legacy project without them.
- [x] Run the test and confirm it fails.
- [x] Implement backward-compatible persistence.
- [x] Run project-store tests.
- [x] Commit persistence.

### Task 5: Integrate one Persona Scenario workspace

**Files:**
- Create: `apps/web/src/PersonaScenarioWorkspace.tsx`
- Create: `apps/web/src/personaScenarioWorkspace.test.tsx`
- Modify: `apps/web/src/PersonaFactory.tsx`
- Modify: `apps/web/src/persona-factory-v2.css`

**Interfaces:**
- `PersonaScenarioWorkspace({ project, creativeProfile, onChange, onCreateBrief })` exposes research, idea, script, critique and approval inside the existing selected project.
- `onCreateBrief` invokes the existing `importPersonaProductionBrief` path only after approval.

- [ ] Write component tests for evidence labels, selection, editorial blocking, revision preservation and enabled brief conversion.
- [ ] Run the test and confirm it fails.
- [ ] Build the small integrated screen with manual-link research, transparent provider state and source-status badges.
- [ ] Wire it into the existing Persona step navigation without a second project store.
- [ ] Run component/project tests, typecheck and web build.
- [ ] Commit UI integration.

### Task 6: Full vertical verification

**Files:**
- Modify: relevant tests only if an integration defect is found.

- [ ] Add an integration test: manual real-link-shaped evidence → original idea → revision + Script Doctor → approval → existing Production Brief QA.
- [ ] Run `npm test`, `npm run typecheck`, `npm run api:typecheck`, `npm run web:build`, and `npm run media:test`.
- [ ] Run a local-browser smoke test without network calls; verify a saved Persona project restores the scenario workspace and the brief stays blocked until approval.
- [ ] Commit any verified correction and prepare the draft PR.

## Self-review

- Trend Radar and Reference Analysis: Tasks 1, 3 and 5.
- Idea Engine and Script Doctor: Tasks 1 and 2.
- Versioned Script Editor and author approval: Tasks 2 and 4.
- Production hand-off and no raw idea-to-shoot path: Tasks 2 and 5.
- Provider safety and no-cost default: Task 3.
- Regression, browser, build and media verification: Task 6.
