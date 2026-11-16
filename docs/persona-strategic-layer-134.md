# Persona: Strategic Layer #134 — 7 elements

## Goal and evidence boundary
Seven project-owned fields: `worldview`, `visualStyle`, `delivery`,
`targetAudience`, `formatType`, `mainGoal`, `retentionStrategy`.
A strategy **intention** is not evidence of actor performance, footage, a finished soundtrack,
industry reach or publication readiness.

Only a successful OpenRouter/OpenAI JSON response yields `PASS`, `WARNING`
or `BLOCKED`. Model availability/errors produce **no audit status**, never fake PASS.
The status does not modify `ProductionJob.status`, `editorialApproved`,
`publicationApproved`, the video's QA status or any author gate.

## Two stores; no phantom synchronization
- **Disk**: `job.json.strategy`, plus `output/architect-shot-list.json.strategy`.
  Existing ten jobs are enriched on rerunning the seed command **only** if their source
  and manifest match the original Architect fixture and their state is still
  `WAITING_FOR_FOOTAGE`. It retains status, IDs, assets, user edits and transition history.
- **Browser**: `lifeos:persona:projects:v1` stores `strategy` and optional
  `strategyAudit`. Visit `#persona/seed10` again to upgrade only proven
  Architect-seeded cards with missing strategy; other project IDs and authored
  strategies are not overwritten. Existing valid legacy projects load unchanged.
- Disk audit files and browser audit records remain separate. A Python CLI cannot
  secretly update Safari/Chrome's localStorage. The browser button calls the
  server endpoint and persists its own model result with an exact scenario snapshot.

## LLM configuration
Set server-side `PERSONA_STRATEGY_AI_ENABLED=true` and one of
`OPENROUTER_API_KEY` or `OPENAI_API_KEY`. Optional
`PERSONA_STRATEGY_MODEL` overrides defaults (`openai/gpt-4.1-mini` via
OpenRouter, `gpt-4.1-mini` via OpenAI). Never use `VITE_...` for API keys.
On Vercel this endpoint is intended for protected **Preview** deployments;
production is disabled even if the flag is enabled. It is rate-limited,
not a substitute for Preview access protection. Browser shows provider errors,
not a mocked audit.

The scenario screen's **Проверить стратегию** button rejects unsaved drafts,
calls `/api/persona-strategy`, checks the result schema and saves it only if
project revision and exact input snapshot still match. Project cards display
seven compact tags; a current `WARNING` highlights the card in yellow with
**Внимание: этот сценарий может не привлечь индустрию**. An outdated audit
automatically ceases to count after changes to the content or strategy.

## Ten real Architect Reels
Windows after updating to the integrated commit:
```powershell
npm ci
npm run persona:architect:seed10
# re-open https://YOUR_PERSONA_SITE/#persona/seed10 in the browser you use
$env:OPENROUTER_API_KEY = "YOUR_KEY"
python tools/strategy_analyzer.py --batch-root "$env:LOCALAPPDATA\LifeOS\Persona\architect-jobs"
```
A real model call happens **only** with the key and command above.
Each job receives `output/strategy-analysis.json` with status, recommendation,
provider/model, timestamp and input SHA-256. No render or publishing happens.
Any failed job is listed and the batch exits nonzero; do not call the batch PASS
until every individual model response is verified.

Individual audit:
```powershell
python tools/strategy_analyzer.py --input scenario-with-strategy.json --output audit.json
```

## Acceptance checks
```powershell
node --test tools/persona-strategy.test.mjs tools/seed_10_projects.test.mjs
python -m unittest discover -s tools -p test_strategy_analyzer.py -v
npm run typecheck
npm run api:typecheck
npm test
npm run web:build
```
GitHub CI additionally runs actual Playwright browser tests and uploads 390px/1440px
screenshots of dashboard cards. Until those jobs are green and the real API key
calls complete, mark the UI/LLM audits **UNVERIFIED**, not PASS.
