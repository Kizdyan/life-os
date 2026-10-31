# Persona · Local Script Doctor (zero paid credits)

## Status / integration boundary
This is a **Windows-local two-pass Script Doctor** integrated with Persona's existing JSON export/import UI. The hosted UI does not directly call the Windows Ollama service. This increment modifies the local CLI while preserving the existing core Project Store and imported suggestion contract.

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
node tools/persona-local-script-doctor.mjs "C:\path\doctor-task.json" "C:\path\doctor-suggestion.json" --model qwen3:4b-instruct --timeout-ms 180000
```

No model is downloaded by these commands. The model must appear in `ollama list`. The local Ollama endpoint is restricted to loopback.

**Step 3 — review, don't auto-approve:**

Read `doctor-suggestion.json`, especially `diagnosis.findings`, `diff`, and `revisedBeats`. The editor may fail to propose good changes; this does **not** constitute artistic validation.

In the same Persona project, choose **Загрузить результат локального редактора**, select the suggestion JSON and inspect every changed scene. Click **Принять как новую версию** only after review. The browser calls `applyPersonaLocalDoctorSuggestion()` and saves the new *unapproved* version through the existing `PersonaProjectStore`. Stale/tampered files, changed locked frames and nonrequested changes are rejected. No Production Brief or author approval happens automatically.

## Patch-only review and durable stage artifacts (current workflow)

The critique is now intentionally minimal: actionable `summary` + `findings` are mandatory, but the full `storyMap` is **optional**. A provided Story Map is still validated. This reduces the amount of narrative metadata a small local model must produce before offering concrete editorial corrections.

**The rewrite model only returns patches for selected scenes.** Its schema is:

```json
{
  "patches": [
    {"beatIndex": 3, "line": "Новая реплика", "action": "Новое действие", "durationSec": 4}
  ],
  "changeSummary": "Почему конкретно изменён финал"
}
```

Indices are **zero-based** in model JSON; Persona's selection UI is human-numbered. `assembleDoctorPatches()` copies every untouched beat from the saved original, not from the model; it refuses missing/duplicate/locked/unrequested indices, unexpected fields, no-op changes, repeated spoken lines and invalid durations. The final output remains the existing `persona-local-doctor-suggestion-v1` with `revisedBeats`, `sourceBeats`, `diagnosis` and exact `diff` for the **unchanged** Persona import adapter.

Both Ollama JSON calls now explicitly set `think:false`. A successful schema response still passes the independent validators; technical correctness is not an artistic approval.

For `doctor-suggestion.json`, the CLI automatically creates a **separate new local directory**:

```text
doctor-suggestion.json.artifacts/
  task.json
  run.json
  diagnosis.request.json
  diagnosis.started.json
  diagnosis.raw.txt      # only when critique was newly generated
  diagnosis.source-raw.txt  # only on resume: verified copy of earlier raw critique
  diagnosis.metrics.json  # only for a new critique
  diagnosis.validated.json
  revision.request.json
  revision.started.json
  revision.raw.txt
  revision.metrics.json
  revision.validated.json
  success.json             # only after successful output
  failure.json             # only on failure
```

Each `*.request.json` records the full exact local Ollama request (including the original task, system prompt, JSON Schema, and parameters) **before** calling the model; these files can contain private screenplay material and must remain local. Each `*.started.json` records a stage start and the bounded model options. Each `*.metrics.json` records actual elapsed milliseconds and whether the model returned a parseable JSON payload; this does not establish artistic quality. The `failure.json` records the last recorded stage and distinguishes `FAILED`, `TIMEOUT` and `CANCELLED`, making interruption visible without implying that the script is bad. All three states can be resumed when a validated critique exists. Files after an incomplete phase may be absent, but earlier completed phases remain available. Raw model text is stored **unchanged**. The CLI refuses to reuse an existing output file or artifacts directory and never silently overwrites previous runs. These artifacts can contain private local screenplay text: **do not publish them to GitHub**.

### Resume a failed second pass without repeating critique

If a previous attempt saved `diagnosis.validated.json` but did not produce an accepted `suggestion.json`, create a **different output filename** and pass the failed artifacts directory:

```powershell
node tools/persona-local-script-doctor.mjs "C:\\path\\doctor-task.json" "C:\\path\\doctor-suggestion-retry.json" --model qwen3:4b-instruct --timeout-ms 180000 --resume-from "C:\\path\\doctor-suggestion.json.artifacts"
```

The old artifact set must contain `task.json`, `run.json`, `failure.json`, `diagnosis.validated.json` and the original raw critique (`diagnosis.raw.txt`, or `diagnosis.source-raw.txt` for repeated recoveries). The saved task must match the new input exactly, and the previously used model must match. The recovered critique is **independently revalidated** against the saved source task before the second call; changes to the task, invalid comments or cross-project reuse fail closed. Only the **rewrite** call is made (after the normal local model availability check). The retry directory records `diagnosis.reused.json`, the revalidated diagnosis and new patch-stage evidence. No new `diagnosis.raw.txt` is fabricated. Instead, the retry preserves a distinctly named verified copy in `diagnosis.source-raw.txt`. The saved canonical critique is checked against that original Ollama response, so even a structurally valid but manually altered finding is refused. Resume is allowed only for a recorded failure during the **rewrite** stage and when the earlier proposal file does not already exist. The same critique can be reused after multiple failed rewrite attempts without re-running diagnosis. This is not a guarantee of creative improvement.

Old unsuccessful runs whose folders contain only `task.json` cannot reconstruct missing Ollama responses retrospectively. A new local run is required to generate stage artifacts; do not claim that historic reasons have been recovered.

## Learning from an explicit rejection

The in-app suggestion comparison includes an optional free-text reason for rejecting the local model's proposal. If the author enters a reason of at least 12 characters and rejects, the browser keeps the **original screenplay unchanged** and appends the reason, current revision ID and timestamp to the existing project `scenarioWorkspace.editorialFeedback`. The next local Doctor task can reuse the latest comment. Rejecting without a reason is allowed, but creates no speculative preference or permanent prohibition.

## Scenario version history (also in Persona UI)

The existing Scenario Workspace now has a **История сценария** disclosure after the second saved version. It compares precise dialogue, action, beat purpose and duration per scene. For inserting/deleting beats the comparison is **positional**, not a semantic scene-matching algorithm.

The user can explicitly restore any prior stored version. This calls `restorePersonaScenarioRevision()`, which copies its beats to a **new unapproved revision**, preserves the entire existing history and drops approval via the canonical `reviseScenarioScript()`. It never deletes newer versions or publishes anything.

A saved version and a model-proposed edit are different things: **imported model suggestions first appear as an unaccepted diff; only clicking "Принять как новую версию" changes the script.** A restored historical version likewise requires new author approval before Production Brief handoff.

## Proposal source identity

As of the latest version, a generated proposal carries the source **idea ID**, current **revision ID** and an exact snapshot of every scene before editing. The canonical importer checks these against the saved project script before reviewing or applying any suggested diff. This blocks accidental cross-project import when two projects reuse the same generated revision ID. A proposal generated with an older CLI lacks the full source binding and must be regenerated; it will not be silently accepted.

The Scene Workspace component and both per-script tools are keyed by project ID plus revision ID, so switching between projects cannot carry an earlier project's pending suggestion or locked-scene selection into the next project.

### npm convenience commands

```powershell
npm run persona:scenario:doctor:task -- --input project.json --out task.json --target 2,3 --lock 1 --instruction "Исправь эскалацию"
npm run persona:scenario:doctor -- task.json suggestion.json --model qwen2.5-coder:7b
npm run persona:scenario:doctor:test
```

## Test commands (no running Ollama required)

```powershell
npm run persona:scenario:doctor:test
npm run typecheck
npm test
npm run web:build
```

This increment includes new patch-only, failure-preservation, raw-evidence integrity and repeat-resume regression tests. Canonical tasks without an optional `authorFeedback` are valid and tested. The patch assembler has been exercised on the GitHub source in isolated V8 checks; a full Node/npm suite, Windows Ollama, real creative acceptance and browser QA **must still run in the repository** before merging. No live creative V1→V2 success is claimed.

## Cooperation with parallel Codex work

The separate Draft PR for this increment is stacked on the last published PR #132 HEAD. Codex exhausted its usage before committing its local TDD changes, which may still be present in Windows worktree. Compare carefully, preserve local files and only cherry-pick/integrate after running repository tests. No changes to main or to the author's local files were made here.

## Not implemented here
- The browser never calls Ollama directly. UI task export/import is implemented; direct secure browser-to-local bridge is not.
- No remote iPhone-to-Windows access.
- No proof that a chosen local model writes professionally good scripts.
- No automatic user approval or video production.
- No dependency/package upgrade.
