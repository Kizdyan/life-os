# Persona Research-to-PreEdit Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present three provenance-labelled ideas and a complete canonical pre-filming plan in existing Persona screens.

**Architecture:** `ScenarioResearchItem` remains the evidence source. `ScenarioIdea` receives an explicit production-risk explanation; `PersonaPreEditPlan` carries optional visual and colour intent, then Production Brief and semantic montage preserve it without treating it as footage.

**Tech Stack:** TypeScript, React SSR tests, Vitest, existing Persona core models.

**Spec:** `docs/superpowers/specs/2026-11-04-persona-research-preedit-delivery-design.md`

## Global Constraints

- No Instagram metrics, Insights, popularity or retention claims without stored evidence.
- Existing persisted PreEditPlan JSON remains readable.
- No publication approval or changes to media/render pipelines.
- Do not create a separate Persona editor or storage path.

## Review Focus

- A three-idea request must not weaken the evidence gate or fabricate source attribution.
- A legacy pre-edit plan without visual intent must remain importable.
- AI-director scene-level camera/light/performance/cut fields must survive canonical conversion.
- A script revision must continue to invalidate a dependent shoot approval.
- Planning copy must not describe intent-only directions as real footage or final colour work.

### Task 1: Evidence-labelled three-idea output

**Files:**
- Modify: `packages/core/src/persona-scenario-intelligence.ts`
- Modify: `packages/core/src/persona-scenario-intelligence.test.ts`
- Modify: `apps/web/src/PersonaScenarioWorkspace.tsx`
- Modify: `apps/web/src/personaScenarioWorkspace.test.tsx`

- [ ] Write a failing core test that `suggestScenarioIdeas(..., count: 3)` returns three ideas with an explicit filming risk and preserves hypothesis/research labels.
- [ ] Run the focused core test and verify it fails because three ideas are rejected or the risk is absent.
- [ ] Permit 2–10 ideas, add a deterministic production-risk field, and request three cards from the existing workspace.
- [ ] Render evidence label, creative-profile fit, complexity and risk in each existing idea card.
- [ ] Run focused core and workspace tests; commit the completed task.

### Task 2: Canonical visual pre-edit direction

**Files:**
- Modify: `packages/core/src/persona-production-brief.ts`
- Modify: `packages/core/src/persona-scenario-intelligence.ts`
- Modify: `packages/core/src/persona-director-model.ts`
- Modify: `packages/core/src/persona-production-pipeline.ts`
- Modify: `packages/core/src/persona-scenario-intelligence.test.ts`
- Modify: `packages/core/src/persona-director-model.test.ts`

- [ ] Write failing tests for generated visual/colour intent and preservation of all AI-director scene directions.
- [ ] Run focused tests and verify they fail because visual intent is absent from the plan.
- [ ] Add optional backward-compatible parsing plus populated visual/colour intent for new plans; reuse it while building the production brief.
- [ ] Run focused tests and the core suite; commit the completed task.

### Task 3: Single pre-filming author view

**Files:**
- Modify: `apps/web/src/PersonaScenarioWorkspace.tsx`
- Modify: `apps/web/src/PersonaFactory.tsx`
- Modify: `apps/web/src/personaScenarioWorkspace.test.tsx`
- Modify: `apps/web/src/PersonaFactory.test.ts`

- [ ] Write failing SSR tests for complete scene details and explicit intent-only wording.
- [ ] Run tests and verify failure.
- [ ] Render camera, light, acting, edit, sound, subtitles and colour beside existing scenario/brief content.
- [ ] Run focused frontend tests, typecheck and production build; commit the completed task.
