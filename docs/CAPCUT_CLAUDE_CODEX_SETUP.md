# CapCut Skill — Claude Code, Codex, and ChatGPT

## Status
- The repository contains `.agents/skills/capcut-persona/SKILL.md` for Codex-compatible Agent Skills, mirrored at `.claude/skills/capcut-persona/SKILL.md` for Claude Code. **Not** a global installation into the user's accounts or computer.
- `scripts/capcut-handoff.mjs` is an actual dependency-free local generator that validates the existing Persona `CapCutWorkPackage` and outputs `timeline.json`, `captions.srt`, `manifest.json`, `NEXT_STEPS.md`. It **cannot edit CapCut directly** or render an MP4.
- No CapCut MCP app/plugin for ChatGPT was found in the available plugin catalog during review. A folder in GitHub does not install a plugin into ChatGPT's UI.

## Claude Code on Windows
1. In your trusted clone of `Kizdyan/life-os`, switch to the reviewed PR branch once merged or check out its files locally. Confirm `.claude/skills/capcut-persona/SKILL.md` exists.
2. Open Claude Code in the repository and request `Use the capcut-persona skill to prepare a safe editable CapCut handoff for this explicitly selected owned footage.`
3. Test: `node scripts/capcut-handoff.mjs --self-test`.
4. For a real project provide an existing Persona `CapCutWorkPackage` JSON and an explicit JSON mapping `{ "assetId": "C:\\Media\\Original.mp4" }` to local paths, then run:
   `node scripts/capcut-handoff.mjs work-package.json asset-map.json handoff-new`
5. Open a **new** CapCut project manually using `handoff-new/NEXT_STEPS.md`. Import SRT and inspect the export. The tool will not overwrite an existing output directory.

## Codex / GPT coding agent
- Codex's repository-local skills convention is `.agents/skills/<name>/SKILL.md`; the same instruction content is there. Use it from the project. This does not add CapCut to the consumer ChatGPT model's general tool list.
- A normal ChatGPT conversation can inspect uploaded video and generate editing plans and SRT, but cannot control a local Windows CapCut installation without an authorized connected application/remote action.
- If ChatGPT Skills/plugin installation is available on a compatible plan/workspace, package and install a reviewed skill separately; live actions require an authorized supported tool, not only SKILL.md. Do not promise the feature is on any particular personal account.

## Optional unofficial local MCP automation — NOT ENABLED
Candidate repos: https://github.com/Atx-Guy/capcut-mcp-server and https://github.com/sun-guannan/VectCutAPI . They create *CapCut-compatible draft structures* by using an unofficial backend. They are not an official CapCut editing API. Review code and dependency versions and product terms; run only a disposable local test on Windows and bind the backend to `127.0.0.1`. Follow the pinned upstream README in a test environment and never expose its port to the internet. No auto-install, unattended updates, login tokens, mass uploads or publish actions.

## Next release gates
- Functional: create one editable CapCut project and actually open it on the user's Windows CapCut version from the neutral handoff.
- Visual: same source / before-after preview, source integrity, face/eyes/glasses untouched; color and subtitle proof.
- Technical: 1080x1920, 25/30 fps as chosen, export ffprobe/ffmpeg QA, clean audio and rights review.
- Release: independent Observer and author approval. No cloud upload/publishing until a separate approval.