# Persona · Local Script Doctor (zero paid credits)

## Status / integration boundary
This is a **standalone Windows-local two-pass Script Doctor**, not a claim that the hosted Persona UI can already call Ollama. It is an additive module on top of PR #132. No existing code or Project Store contracts are modified.

- Ollama `/api/tags` verifies the **already installed** local model.
- First local `/api/chat` call critiques specified screenplay frames with concrete role, evidence and proposed solution.
- Second local `/api/chat` call rewrites **only** permitted frames with the first pass's diagnosis.
- Hard validators reject changed locked/untargeted frames, changed beat count or purpose, empty changes, duplicate lines, mechanical timing and invalid structure.
- Output `SUGGESTION_NOT_APPROVED` has exact per-frame diffs, **no publication or author approval**.
- A separate, typed core adapter `applyPersonaLocalDoctorSuggestion()` can convert this output into a **new unapproved revision**, strictly matching the current script revision and entire change diff. UI import wiring is still needed.
- No paid cloud APIs, model downloads, background tasks, public network exposure or software installation. Author still decides whether the revision is any good.

## Windows CLI (uses the existing repo and installed Ollama)

Export a *saved* Persona project containing `scenarioWorkspace.script`, or a plain saved `ScenarioScript` JSON. For a multi-project collection, include `--project-id <id>`.

**Step 1 — make a task for the specific scenes (numbers start at 1):**

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

A future Persona UI addition can invoke `applyPersonaLocalDoctorSuggestion(workspace.script, parsedSuggestion, timestamp)`, then save the returned script through the **existing** `PersonaProjectStore`. That adapter rejects stale or tampered changes and drops any previous author approval. It must **not** call Production Brief approval automatically.

## Test commands (no running Ollama required)

```powershell
node --test tools/persona-local-script-doctor.test.mjs tools/persona-local-script-doctor-task.test.mjs
npm run typecheck
npm test
```

The 12 new local Node tests were executed successfully in an isolated Node 22 environment. The full repository checks, new Vitest adapter tests, Windows real Ollama output and browser integration **have not** been verified by this authoring environment.

## Cooperation with parallel Codex work

PR #132's local Windows worktree may contain unpublished modifications to existing `persona-scenario-intelligence.ts`, `PersonaFactory.tsx` and tests. This PR only adds new modules and documentation, and is intentionally **stacked on the published #132 head**. Check for live conflicts and cherry-pick/integrate carefully; don't merge blindly or overwrite Codex changes.

## Not implemented here
- No in-browser button for local model requests.
- No remote iPhone-to-Windows access.
- No proof that a chosen local model writes professionally good scripts.
- No automatic user approval or video production.
- No dependency/package upgrade.
