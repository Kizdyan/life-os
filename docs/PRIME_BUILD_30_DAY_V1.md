# Prime Build — 30 days · Life OS V1

> «Интерес — сразу. Значимость — только после взаимности.»

## Independent correction status — 2026-10-13
**REVISE / CI_DEFERRED — ISOLATED BRANCH ONLY. NOT PRODUCTION-READY.**
Base reviewed commit: `786267bc6a84385c3c406cb3da3e71b46bff2815`.
Correction branch: `feature/prime-build-30-days-v1` (read exact current SHA from branch; never treat this document's earlier SHA as a new HEAD).

### Canonical Life OS reuse
- Existing Goal `goal:prime-build:30:v1`, Project `project:prime-build:30:v1`, weekly `Item` tasks and daily check-in task.
- Existing `outcome()`/`undoOutcome()`, canonical Check-ins (`dailyCheckin.ts` / `checkinRuntime.ts`), existing authenticated runtime `setting` records, offline local replica/outbox, version-aware conflict handling and audit.
- **No second Goal/Project/Task or independent server memory database.** Five weekly categories remain Body/Posture, Style, Strong Context, Life-first Social, Visual Capture.

### Privacy/storage correction
- Prime private journal `prime:private:journal:v1` is a single typed, `PRIVATE`, `personaExposure:'blocked'` canonical `setting` record through the existing owner-authenticated Life OS runtime. Legacy localStorage `life-os:prime-build:private:v1` is retained as its offline replica, **not** the sole durable authority when remote mode is configured.
- `primePrivateRuntime.ts` uses the existing mutation outbox and sealed owner-session runtime. `primePrivateReplica.ts` restores remote state and avoids overwriting pending offline edits. Existing server ingress (Edge and API) rejects misclassified Prime private writes before applying them.
- The only automatic Persona linkage is NON-SENSITIVE goal/task context. No Prime private journal or nightly reflection is automatically passed into Persona content. **Security caveat:** current Life OS runtime authenticates its owner and has RLS; it does **not yet have a separately proven purpose/agent-scoped server read ACL** for every potential same-origin component. This is NOT evidence of universal isolation against malicious same-origin scripts.
- Private data remains in localStorage while offline and can be accessed by same-origin JS; this is not a cryptographic vault. Never claim zero exposure in case of origin compromise. Secrets never belong in this journal.
- No production schema or deployments changed. A production release would require security review of server-side owner/session and scoped disclosure behavior on the exact candidate.

### Canonical nightly Check-in correction
- New private `PrimeDailyReflection` is an optional **facet of existing Daily Check-ins** persisted as an existing `setting` record `checkin:prime:<date>`, with `privacyClass:'PRIVATE'`, `personaExposure:'blocked'`, `projectId`, three answers, optional self-direction and alignment (1–10).
- Normal mood/energy/focus scores are **not fabricated** when Prime alone is filled. Normal DailyCheckin and Prime daily facet coexist in the same check-in storage domain with separate date IDs.
- Existing reflections stored in the old journal are migrated lazily and idempotently to the canonical check-in facet. Legacy journal events are voided but old audit remains as provenance. `primeCheckinMigration.ts` is a testable isolated converter; no bulk user-data migration has been initiated.

### Erika event semantics correction
- A genuine second outreach in the same words gets a **new event**.
- Duplicate delivery/retry with the same `operationId` is idempotent even if text is identical; no sentence-text hash is used as authoritative event identity.
- Explicit corrections void the target with audit history, repeated correction `operationId` cannot void another event, and retry of a voided operation cannot resurrect the old event.
- Ambiguous request to correct 'the same girl' asks only for the correction target/details rather than changing the wrong event.
- Natural language support still uses bounded pattern matching; it is not claimed to be ChatGPT-level free-form reasoning.

### Actual UX on an eligible iPhone preview (after acceptance)
1. Today → Prime Build → «Начать 30 дней» (existing goal/project/tasks).
2. One tap marks Body, Style, Strong Context, Life-first Social or Capture.
3. «Общение и импульсы · приватно» → configurable default 3 new outreach/week (nonbinding), optional 10-minute pause/reflection, explicit undo.
4. «Вечерние 2 минуты» → three quick answers, optional self-direction/Prime Alignment; stored in canonical Check-in facet and task completion.
5. «Обзор недели» → categories, outreaches, pauses, check-ins; comparisons only with enough completed weeks. Reload uses offline replica; owner-authenticated remote sync exists but has not had physical multi-device acceptance in this review.

### QA evidence — explicit distinctions
- **GitHub source check:** existing models reused and candidate changes inspected at exact branch commits.
- **Vercel Vite bundle evidence on preceding commit `59456b113f5e4ef63228b284f208f58ebf76bbcd`:** BOTH projects built 69 modules and reported `✓ built`; afterwards Vercel failed with `STATIC_BUILD_NO_OUT_DIR`: actual output `../../dist` versus expected `dist`. Category: **CONFIGURATION**, not a proven feature-code failure or platform quota. No Vercel deployment configuration changed.
- **Locally executed targeted pure regular-expression smoke:** 4/4 PASS for 'accidental repeat' matching, including negative case. This is NOT a Prime runtime test.
- **Vitest files present:** `primeBuild.test.ts`, `dailyCheckin.test.ts`, `primePrivateReplica.test.ts`, `PrimeBuildCard.test.tsx`, `api/runtime/sync.test.ts`, including legacy correction, migration, private classification, offline overwrite guard, React SSR and server-ingress cases.
- **Vitest run / npm test / full typecheck / api:typecheck / React interaction / owner authorization E2E / local Vite build at latest SHA:** **DEFERRED / NOT EXECUTED**. The private GitHub repository was not clonable in the available isolated container; no authenticated local dependencies/worktree. Written tests != passed tests.
- **No claim of release acceptance, cross-device privacy assurance, physical iPhone QA, CI green, or deployment readiness.**

### Unresolved acceptance checks
1. Execute real `npm test -- apps/web/src/primeBuild.test.ts apps/web/src/dailyCheckin.test.ts apps/web/src/primePrivateReplica.test.ts apps/web/src/PrimeBuildCard.test.tsx api/runtime/sync.test.ts` plus `npm test`, `npm run typecheck`, `npm run api:typecheck`, `npm run web:build` in the isolated authenticated #Prime branch workspace. Fix any actual failures, repeat QA.
2. Validate owner-session protection on server, ordinary Persona generate path private redaction/independence and cross-context leakage adversarial tests, including historic/as-of, raw API reads and same-origin/script risk; do not represent metadata flags as sufficient authorization.
3. Verify private journal and Prime check-in offline replay, real reload/restart, mutation conflict convergence, eventual read-your-writes and migration of old reflections using actual runtime store; no fake test fixtures as persistence proof.
4. Correct preview Output Directory configuration **only through a separately approved deployment-configuration change**; do NOT touch production/deploy configuration in this protected V1 work.
5. Do not expose private context in Persona, merge main or deploy until independent acceptance and authorization.

### Architecture boundary / protected references
- Accepted frozen Persona media integration V1 `5ce22718b4a0ccdbd5d4856baae8c291e527bff5`, immutable Video V1.1 `646f0708508c0fc603a43c555b771efe1176ee14` and unfinished `feature/media-execution-router-v2` are untouched.
- Main `f18273dbfc32439ef0c660ce21aa91a089f36bac`, production and deployment settings are untouched.
- Unified Life OS + Erika personal assistant direction is recorded as an **approved FUTURE direction in canonical #101**, not implemented wholesale in Prime Build. Sequence: Historical Knowledge Consolidation → Universal Inbox/Erika Capture → focused Today → Weekly Review/Replanning → deeper reasoning/orchestration.
- No GitHub Actions were manually dispatched and no paid services initiated. Feature branch pushes may trigger platform-owned Vercel preview builds; those are not accepted production deployments.
