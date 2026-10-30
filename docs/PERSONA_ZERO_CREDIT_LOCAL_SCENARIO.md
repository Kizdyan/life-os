# Persona: Zero-Credit reference → locally edited scenario → canonical Production Brief

**Status:** opt-in local CLI implementation, **not** automatic discovery, a live browser AI integration or artistic certification. No paid API, API keys, external Vercel AI Gateway, token credits, social-account actions or automatic publication.

## Why a local CLI instead of a Vercel → Ollama call?
`127.0.0.1` on Vercel means the **Vercel server**, not the user's Windows computer. A hosted iPhone/browser page also cannot safely assume a locally running Ollama endpoint is reachable. This first vertical slice deliberately uses an explicit Windows-local CLI and imported JSON instead of making a non-working or unsafe browser-side network shortcut.

## Prerequisites
- Windows machine running the project with Node 22+ and npm.
- Local [Ollama for Windows](https://ollama.com/download/windows) installed and running.
- A locally downloaded model. After checking PC RAM and GPU, one possible starting point:
  ```powershell
  ollama pull qwen2.5:7b
  ollama list
  ```
  This is an example, not a claim that the model is suitable for the user's exact hardware. A smaller locally installed model can be passed by `--model <name>`. The CLI **never downloads models automatically**, rejects names containing `cloud`, and connects only to `http://127.0.0.1:11434`.

## End-to-end usage
1. Open Persona → free trend reference board; save a **public** Reel link. A bookmark is only `Только ссылка` until genuinely viewed and annotated.
2. Open reference → `Создать оригинальную идею` → fill in the nine story fields. These are author input; structural checks are **not AI** and never claim a joke is funny.
3. Enter a title, select `Перенести структуру в новый проект Persona`. The canonical project persists the original public reference URL and story outline.
4. In the project use `Скачать задание для локального ИИ · 0 кредитов`. This exports `persona-scenario-input.json`. No network upload happens.
5. On the **same Windows machine**, from the existing Life OS repository:
   ```powershell
   npm run persona:scenario:local -- "C:\\path\\persona-scenario-input.json" "C:\\path\\persona-draft-brief.json"
   ```
   Optional for a model already downloaded locally: append `--model qwen2.5:3b`.
6. The tool creates two new files, refusing to overwrite anything:
   - `persona-draft-brief.json`: compatible **draft** Production Brief.
   - `persona-draft-brief.json.review.json`: separate dramaturg, director and producer critique and provenance disclaimer.
7. Read both. Open the **same Persona project**, choose `Импортировать съёмочный бриф JSON` and select the first file. Existing import QA validates the brief and **resets editorial approval**. Only the author can approve shooting.
8. Edits through the canonical Persona editor run QA again. No publication or content upload is performed.

## Safe failures
- Ollama missing/unavailable → explicit error, no paid fallback.
- Model is not listed in Ollama's local `/api/tags` → error, **no `pull` and no cloud inference**.
- Cloud model or remote hostname → rejected before requests.
- Malformed model answer, missing critical editorial critique, bad timing → rejected without creating a fake brief.
- Existing output file → rejected instead of overwriting the author's work.
- Source facts or model assertions → must still pass author/editor review; `factReferences` remains empty unless the author explicitly supplies verified facts in the canonical process.

## Run tests
```powershell
npm run persona:scenario:local:test
npm test
npm run typecheck
npm run api:typecheck
npm run web:build
```

## Explicit limits
- The quality of the local draft depends on the selected model and hardware; this is **not** a promise of professional-quality automated screenwriting.
- This implementation does not consume or analyze actual video pixels, inspect trend performance, or validate the originality of a comedy sketch.
- The local CLI is for Windows/desktop usage. Cloud-based Persona and iPhone cannot directly access a user's Windows-local Ollama service.
- A single structured model request includes critical notes but does not replace actual author dramaturgy and producer review. Human shoot approval is mandatory.
- PR #128's existing audio/video pipeline is not modified, and the parallel Codex Scenario Intelligence worktree is not touched.
