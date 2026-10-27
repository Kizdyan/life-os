# Persona local Qwen execution — experimental milestone

## What is real and what is not

- `tools/persona-local-ai.mjs` performs an **actual generation request** to an already installed Ollama model on the local computer. Default invocation only lists models; no generation, installation or network exposure.
- Explicit `--run --model=<exact installed id>` is required. The tool sends a synthetic theatre-Reels task unless the operator explicitly supplies `--brief-file`.
- Responses are measured and scored for **structural correctness**, not actual originality or video/colour quality. Bad model responses get REVIEW_REQUIRED or a thrown error; no fake templates are inserted.
- Model calls are limited to HTTP loopback `localhost`/127.0.0.1/[::1]; `:cloud` tags rejected, but a locally configured custom/proxied model could still send content elsewhere. Use synthetic prompts only until privacy is assessed.
- Model downloads, connection to the user's computer, automatic Codex invocation, publishing, actual creative quality and integration with iPhone Persona are **not** verified here.

## How to run with Codex/terminal (trusted computer)

```powershell
node tools/persona-local-ai.mjs --probe
# choose a model ID that /api/tags actually lists; DO NOT assume installed:
node tools/persona-local-ai.mjs --run --model=qwen2.5-coder:7b --out=persona-ai-output.json
```

If no Ollama is running, expect BLOCKED. Model must be downloaded using a separate explicit decision; the script never downloads anything.

```bash
npm test -- tools/persona-local-ai.test.ts
```

Only use the `--brief-file` option with prompts you consent to send to the **selected locally operated model**. Outputs can contain unpublished creative materials: protect the JSON file and avoid committing it.

## Integration target

Next work item: import `persona-local-ai-result` JSON into Persona, verify it locally again before display, and retain label `Imported local AI, not server-verified`. The browser must not send imported JSON to Vercel except on explicit user action.

## Acceptance

1. Real local `GET /api/tags` lists an installed model.
2. Real `POST /api/chat` returns actual JSON; usage captured.
3. Structural QA is GREEN for a real response (not mocked).
4. A human creative/technical review approves hook, performances, feasibility, pacing and final twist.
5. An imported scenario appears correctly on iPhone, without using Vercel AI Gateway or paid API.

As of initial commit, 1–5 are **NOT confirmed on the owner's machine**. Mocked tests are not substitutes.
