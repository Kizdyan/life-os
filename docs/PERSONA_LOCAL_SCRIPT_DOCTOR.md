# Persona · Local Script Doctor (zero paid credits)

## Status / integration boundary
This is a **standalone Windows-local two-pass Script Doctor**, not a claim that the hosted Persona UI can already call Ollama. It is an additive module on top of PR #132. No existing code or Project Store contracts are modified.

- Ollama `/api/tags` verifies the **already installed** local model.
- First local `/api/chat` call critiques specified screenplay frames with concrete role, evidence and proposed solution.
- Second local `/api/chat` call rewrites **only** permitted frames with the first pass's diagnosis.
- Hard validators reject changed locked/untargeted frames, changed beat count or purpose, empty changes, duplicate lines, mechanical timing and invalid structure.
- Output `SUGGESTION_NOT_APPROVED` has exact per-frame diffs, **no publication or author approval**.
- A separate typed core adapter `applyPersonaLocalDoctorSuggestion()` converts this output into a **new unapproved revision**, strictly matching the saved revision, model/diagnostic fields and full diff.
- **Persona UI integration is wired:** open the Script Doctor panel, choose which scenes may change, lock protected scenes, export a task, import the suggestion, inspect evidence and before/after, and explicitly accept as a new unapproved revision.
- No paid cloud APIs, model downloads, background tasks, public network exposure or software installation. Author still decides whether the revision is any good.

## Windows CLI (uses the existing repo and installed Ollama)

Export a *saved* Persona project containing `scenarioWorkspace.script`, or a plain saved `ScenarioScript` JSON. For a multi-project collection, include `--project-id <id>`.

**Step 1 — export from Persona's new Script Doctor panel** (preferred): open a saved scenario, select rewritable scenes and locked scenes, add instructions and previous author feedback, and click **Скачать локальное задание · 0 кредитов**. This creates `persona-doctor-task.json` without contacting any network service.

For offline project JSON files, the CLI alternative remains (scene numbers begin at 1):

```powershell
node tools/persona-local-script-doctor-task.mjs --input "C:\path\project.json" --out "C:\path\doctor-task.json" --target 3,4 --lock 1 --instruction "Make the climax and ending less predictable without changing the opening" --author-feedback "The original punchline is predictable"
```

Here, scenes 3 and 4 can change; scene 1 is explicitly locked; all other scenes are automatically protected by the rewrite validator.

**Step 2 — run the two-pass editor (local only):**

```powershell
node tools/persona-local-script-doctor.mjs "C:\path\doctor-task.json" "C:\path\doctor-suggestion.json" --model qwen2.5-coder:7b
```

No model is downloaded by these commands. The model must appear in `ollama list`. The local Ollama endpoint is restricted to loopback.

**Step 3 — review, don't auto-approve:**

Read `doctor-suggestion.json`, especially `diagnosis.findings`, `diff`, and `revisedBeats`. The editor may fail to propose good changes; this does **not** constitute artistic validation.

In the same Persona project, choose **Загрузить результат локального редактора**, select the suggestion JSON and inspect every changed scene. Click **Принять как новую версию** only after review. The browser calls `applyPersonaLocalDoctorSuggestion()` and saves the new *unapproved* version through the existing `PersonaProjectStore`. Stale/tampered files, changed locked frames and nonrequested changes are rejected. No Production Brief or author approval happens automatically.

## Scenario version history (also in Persona UI)

The existing Scenario Workspace now has a **История сценария** disclosure after the second saved version. It compares precise dialogue, action, beat purpose and duration per scene. For inserting/deleting beats the comparison is **positional**, not a semantic scene-matching algorithm.

The user can explicitly restore any prior stored version. This calls `restorePersonaScenarioRevision()`, which copies its beats to a **new unapproved revision**, preserves the entire existing history and drops approval via the canonical `reviseScenarioScript()`. It never deletes newer versions or publishes anything.

A saved version and a model-proposed edit are different things: **imported model suggestions first appear as an unaccepted diff; only clicking "Принять как новую версию" changes the script.** A restored historical version likewise requires new author approval before Production Brief handoff.

## Test commands (no running Ollama required)

```powershell
node --test tools/persona-local-script-doctor.test.mjs tools/persona-local-script-doctor-task.test.mjs
npm run typecheck
npm test
npm run web:build
```

The 12 standalone Node tests were previously executed in an isolated Node 22 environment with mocked Ollama. Newly authored Vitest task-builder and adapter tests, the full repository suite, TypeScript/web build, real Windows Ollama output and Playwright browser integration **have not been executed in this GitHub-only session**.

## Cooperation with parallel Codex work

PR #132's local Windows worktree may contain unpublished modifications to existing `persona-scenario-intelligence.ts`, `PersonaFactory.tsx` and tests. This PR only adds new modules and documentation, and is intentionally **stacked on the published #132 head**. Check for live conflicts and cherry-pick/integrate carefully; don't merge blindly or overwrite Codex changes.

## Not implemented here
- The browser never calls Ollama directly. UI task export/import is implemented; direct secure browser-to-local bridge is not.
- No remote iPhone-to-Windows access.
- No proof that a chosen local model writes professionally good scripts.
- No automatic user approval or video production.
- No dependency/package upgrade.
