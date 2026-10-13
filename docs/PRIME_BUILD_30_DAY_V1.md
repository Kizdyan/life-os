# Prime Build — 30 days · Life OS V1

> «Интерес — сразу. Значимость — только после взаимности.»

## Runtime status

This is a **branch-only**, iPhone-first V1 candidate in \`feature/prime-build-30-days-v1\`. It is **not deployed** to the user's existing iPhone production PWA. The feature deliberately does not alter main, production, frozen Video V1/V1.1 or Media Execution Router V2. No GitHub Actions have been requested.

## Existing model reuse

- **Goal**: \`goal:prime-build:30:v1\`, via existing \`goals()/saveGoal()\`.
- **Project**: \`project:prime-build:30:v1\`, via \`projects()/saveProject()\`.
- **Weekly activity tasks**: five \`Item\` records per active 7-day block, IDs \`prime:v1:<startDate>:week:<index>:<category>\`; status and completion use \`outcome()\`, \`undoOutcome()\`.
- **Daily nightly check-in task**: one existing \`Item\` per day (21:30–21:32), ID \`prime:v1:checkin:<date>\`. The associated 3 reflection answers are private observations, not a second goal/task system.
- **Remote/offline**: project, goal and task operations use the existing Life OS local runtime replica/outbox and, if configured, Supabase Edge sync. Setup is idempotent and lazy; a new week and day's check-in are seeded on opening Today, rather than flooding the queue with 55 immediate remote writes.
- **Erika**: deterministic natural-language interception before existing planning and analytics, only for clearly recognized Prime inputs. General conversation and other commands retain current Erika flow. Explicit user input, not inference from arbitrary unrelated messages.

## iPhone interaction

1. Open **Today** → the **Prime Build** card is first, above other sensors.
2. Tap **Начать 30 дней** once. This registers the existing goal/project and the first week's five tasks.
3. Tap a category to mark a concrete action done; **Отменить последнее действие** uses Life OS outcome undo.
4. Expand **Общение и импульсы · приватно** to set a weekly **nonbinding** new-initiative limit (default 3), log actual **new** initiatives, optionally add a local-only context, or start the voluntary 10-minute pause. Replies, ongoing dialogue and nonromantic interactions are not new initiatives.
5. Expand **Вечерние 2 минуты** → three short questions, optional self-respect and alignment 1–10 → save. One dated private reflection is updated, not duplicated; its existing daily task is marked complete.
6. Expand **Обзор недели** for completed categories, social and visual capture, outreach, pauses, reflection, and Prime Alignment. Week-over-week comparison uses only two **completed** weeks; no causal claim.
7. Reload/reopen on the **same device/browser profile**: goal/project/tasks use existing runtime; private journal and guardrail/settings restore from localStorage.

## Privacy and its explicit limitation

The raw/private romantic initiative context, impulse and validation notes, reflection answers and scores are **not written to the Persona stores** or to normal Life OS task descriptions/goal titles. They remain in the local-only Prime private journal \`life-os:prime-build:private:v1\`, with per-event version history and reversible changes. Automatic Erika fingerprints are a nonreversible integer digest of a normalized utterance, not the utterance itself. The Persona module receives **no integration** or private Prime journal object; only the project/goal and safe activity task names exist in shared Life OS runtime.

**Important limitation:** localStorage is origin-scoped, not a cryptographically isolated vault. Same-origin application JavaScript could technically read it. No production server-enforced agent-purpose ACL for the private Prime journal is claimed. Local-only notes will **not** follow the user across devices, and can be lost if browser site data is erased. Do **not** connect the private journal to Persona or upload it without a separate authorization and protected API policy.

## Acceptance evidence and remaining checks

- Source-exact deterministic JS verification of pure \`primeBuild.ts\` logic after erasing TypeScript-only type annotations: **20/20 PASS** (dates, week boundaries, soft guardrail, private event dedupe, audit/undo, reflection correction).
- Source-exact deterministic JS classifier verification: **17/17 PASS** for six user examples and targeted negative/overlap/future-intent cases, after two discovered classifier bugs were fixed.
- Source-exact Erika correction flow with deterministic storage: **PASS** — a mistakenly claimed outreach is voided, active count becomes zero, and two audit entries remain.
- Source-exact weekly seeding concurrency test, with existing API substituted by a deterministic in-memory adapter: **PASS** (3 concurrent initializers, exactly 1 Goal + 1 Project + 6 Item writes).
- \`apps/web/src/primeBuild.test.ts\`: **19 Vitest test cases authored, execution DEFERRED** — no authenticated GitHub working-copy package/dependency environment was available in this chat container. Their existence is not a PASS.
- Full app regression, React UI test, app/API typecheck and production Vite build: **NOT EXECUTED** in this environment; required before merge/release.
- iPhone physical behavior and production sync: **NOT TESTED**, no user QA requested.

Suggested independent follow-up in an isolated developer workspace:
\`npm test -- apps/web/src/primeBuild.test.ts\`, \`npm test\`, \`npm run typecheck\`, \`npm run api:typecheck\`, \`npm run web:build\`. Note the repository's root \`tsconfig.json\` currently includes only \`packages/**/*.ts\`; a dedicated web typecheck is needed to validate new React/TSX files. Do **not** enable paid CI, merge or deploy automatically.

## Scope and known V1 limitations

No second habit system. No Media/Persona source edits. No complete Hero Identity migration. No guaranteed universal conversational parsing beyond current deterministic intents. Corrections of same dated private entries and reflection updates are idempotent; an explicit 'Нет, я не написал' reverses the most recent same-day outreach with audit. Ambiguous cross-category/retroactive verbal corrections still need explicit context or a future Erika NLP layer. Private notes are same-device only. No cross-device sensitive journal sync, and no production guarantee is made.

## Protected boundaries

Base: \`recovery/iphone-static-supabase\` SHA \`bfcfa84c7e1a579c8c029f777ddf57e711bba4a6\`. A *new* feature branch was created. The base branch, \`main\`, production/deployment configuration, frozen V1 \`5ce22718b4a0ccdbd5d4856baae8c291e527bff5\`, immutable V1.1 \`646f0708508c0fc603a43c555b771efe1176ee14\`, current \`feature/media-execution-router-v2\` and GitHub Actions were left untouched.
