# Persona — Strategic & Pre-production Intelligence (Ref. #134 + light + author voice)

## Already implemented (PR #169)
- Seven `strategy` fields in all new projects and ten Architect Reels, legacy-safe migration for browser `localStorage` and disk `ProductionJob`.
- `tools/strategy_analyzer.py` + opt-in `/api/persona-strategy`, real OpenRouter/OpenAI JSON only. Valid model assessments are versioned in the browser project, with source snapshot; disk jobs store `output/strategy-analysis.json`.
- Dashboard shows seven fields, current `WARNING` makes the project card yellow and provides a precise professional-positioning comment.

## Lighting
`tools/lighting_planner.py` and the browser's `personaLightingPlan` consume the same fixed contract:
`packages/core/src/persona-lighting-presets.json`.
This is **rule-based**, not a claim that a camera, a room or actual lamps were inspected.

CLI:
```powershell
python tools/lighting_planner.py --scene "Актёр за пианино"
python tools/lighting_planner.py --scene "Актёр за пианино" --json --output "lighting-reel01.json"
```

Browser: **Съёмка → План съёмки → Схема света**.
The button shows Key/Fill/Back, background and what to check for the **currently selected shot**.
Changing the active shot changes the advice; no media upload, LLM request or publication is triggered.

For Reel-01 *Последняя сцена*, first shot (actor at the grand piano):
- **Key:** soft source to one side of camera, approximately 45° and slightly above eye level, keep face and hands visible.
- **Fill:** preferably none; only add a weaker white reflector opposite Key when the shadow-side eye is lost.
- **Back:** if available, weaker source behind/side and above shoulders. Without it, increase the distance to the background.
- **Background:** darker than the face, restrained warm practical if appropriate; avoid glare on the polished lid/white keys.
- **Test:** 5–10 seconds of head movement and piano hands; check exposure and unwanted reflections.

These are preproduction ideas; equipment, ambient daylight, room geometry and actual appearance still need author verification.

## Writing style
`docs/my-writing-style.md` describes the desired authorial voice. Updated prompts:
- `tools/director_agent.py`
- `tools/strategy_analyzer.py`
- `api/persona-director.ts` and `api/persona-strategy.ts`
- `packages/core/src/persona-agent-system-prompts.ts`
- `tools/persona-local-scenario.mjs`, `tools/persona-commercial-prompt.mjs`

Concise human Russian, medium-length sentences, a little situational irony, action and pause.
No inflated promotional slogans, fabricated biography, or generic AI phrasing. Prompts guide
new generations but **do not rewrite the author's previously approved content**.
A human editorial review is still necessary to establish actual fit to the author's voice.

## Real versus simulated audits
Without `OPENROUTER_API_KEY` or `OPENAI_API_KEY`, the ten scenario LLM calls **cannot be reported as done**.
The test suite mocks provider responses to confirm JSON schema, failure modes and no implicit approval.
To perform actual audits on the file-backed ten jobs after seeding:
```powershell
npm run persona:architect:seed10
$env:OPENROUTER_API_KEY="YOUR_KEY"
python tools/strategy_analyzer.py --batch-root "$env:LOCALAPPDATA\LifeOS\Persona\architect-jobs"
```
Do not commit keys or generated private user content. The batch writes ten separate audit files and
exits nonzero if any model request fails. Individual browser audits are persisted through the
**Проверить стратегию** action on the script page when the server is explicitly configured.

## CI acceptance gates
```powershell
node --test tools/persona-strategy.test.mjs tools/persona-lighting.test.mjs tools/seed_10_projects.test.mjs
python -m unittest discover -s tools -p "test_strategy_analyzer.py" -v
python -m unittest discover -s tools -p "test_lighting_planner.py" -v
npm run api:typecheck
npm run typecheck
npm test
npm run web:build
```
The browser E2E captures `architect-10-cards-{390,1440}.png` plus
`architect-01-lighting-{390,1440}.png` after real user clicks.
These screenshots are **real browser captures**, not AI renderings.
