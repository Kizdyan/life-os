# Persona Generator-Critic Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task, with a final fresh-context review.

**Goal:** One local button generates five commercial ideas, separately critiques all five, and offers only up to two with an exact mean >=8.

**Architecture:** Reuse Persona's proposal flow, local model client, jury module, Worker and project storage. A shared pure audit policy validates four integer scores and computes filtering/ranking. The same configured Qwen is invoked with fresh messages for the critic; this is not an independent-model jury. Preserve rejected drafts on disk as diagnostic evidence while removing them from selection.

**Tech Stack:** Node22, existing Ollama/Qwen, React, FFmpeg regressions, Python Playwright/installed Chrome.

**Spec:** Current user request: five drafts; scores 1–10 for visuality, acting range, selling potential, hook; mean <8 rejected; top two shown with reasons. Banal ideas/no acting receive 1 for the respective criterion, which guarantees rejection even if other scores are10.

## Global Constraints

- Keep current isolated feature branch, main and personal media unchanged; no merge or publication.
- Never invent model responses, raise scores, fill missing winners, or silently retry/rewrite failed audits.
- Legacy saved proposals and script histories remain readable.
- Keep stable candidate IDs through filtering and screenplay handoff; reject selection of filtered IDs on the server.
- Persist generation and critique provenance, hashes and exact rejected evidence; malformed/offline critic yields no selectable proposal.

## Review Focus

- All five reviews must cover exact IDs once; extra/missing/duplicate IDs and invalid scores fail closed.
- Exact average8 passes;7.75 fails; ties preserve original order.
- Zero/one surviving idea is valid; do not force two.
- Reload and older optional records must not quarantine/delete projects.
- Same model means self-critique, not claimed independent experts or proven commercial performance.

## Tasks

- [x] Write failing shared-policy tests; implement validation, rule enforcement, ranking and audit snapshot verification.
- [x] Test two separate requests, same provider, failed critic and stable-ID selection; wire existing proposal/jury/Worker paths.
- [x] Run a real local five-idea generation and critic; retain exact output and reasons.
- [x] Test and update existing Idea UI and record validator: top2 only, rejection summary, no survivors and legacy history.
- [x] Run real browser flow/reload/390px, unit/media/type/API/build, final review; commit verified changes and report actual critic results.

## Execution ledger

- Ruling: rejected ideas are excluded from choice, not physically erased from evidence or previous user data.
- Ruling: automatic two-pass button avoids manual producer work. No automatic regeneration if all five fail.
- Real browser attempt 1 failed after exactly five minutes: non-streaming HTTP
  headers were not returned while CPU Ollama was still generating. No result was
  represented as successful. Added a failing then passing streamed UTF-8/JSON
  regression and opt-in NDJSON handling for these two calls, retaining a bounded
  total request budget, mandatory completion and output limits.
- Read-only fresh-context code review reported no actionable findings.
- Real Chrome/Qwen run completed: all five rejected (means 3, 2.75, 2.75,
  2.5, 2.75 after mandatory rules); empty result restored after reload;
  rejected-ID selection HTTP400, 390px without overflow, no page errors.
  Local evidence: `artifacts/persona-generator-critic-20261109` in the parent
  ChatGPT workspace. TypeScript/API/build passed; unit554 passed; media220
  passed,0 failed,5 existing platform-specific skips.
