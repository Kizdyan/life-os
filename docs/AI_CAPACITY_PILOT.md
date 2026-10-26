# AI Capacity / Claude + Codex pilot (non-production)

## What was verified in this repository

- `MediaBrainOrchestrator` enqueues jobs; `MediaSupervisor` runs bounded passes.
- `CapCutWorkPackage` stores a declarative edit plan but does **not** edit videos.
- `docs/MEDIA_BRAIN.md` treats CapCut as a human-facing editor and prohibits
  dependence on undocumented/private APIs.
- Publication is approval-gated; offline/provider-neutral core must keep working.

## This experimental increment

- `agent-capability-router.ts`: pure, provider-neutral task-to-agent selection.
- `media-edit-routing.ts`: generates a safe media-edit *routing plan*, not a video.
- Tests cover dynamic skill selection, independent review, absent integrations,
  unavailable providers, approval gating, and no publishing permission.
- No subscriptions, API calls, media access, secret changes or production
  deployment are performed by these modules.

## Measured routing, not marketing-based assignments

Calibrate capability scores from actual acceptance-tested tasks (0–5).
Unknown capability = 0; missing tools or offline providers block routing.
Codex can win on code, Claude can win on editing, but neither is hardwired to
one role. The runner must record task IDs, source versions, output artifact
hashes, independent QA results, retries, time, cost and human corrections.

## Candidate integrations to security-review before installing

- https://github.com/Rajbagus/rabbitorial-capcut-mcp
  Community-built local CapCut MCP. **Unofficial, compatibility unverified**.
- https://github.com/digitalsamba/claude-code-video-toolkit
  Claude video pipeline using FFmpeg/Remotion and other optional services.
- https://github.com/ElSalvatore-sys/video-editor-plugin
  FFmpeg / Remotion / Whisper video editing commands.
- https://learn.chatgpt.com/docs/build-skills
  Codex skill packaging and repository-local skill support.

Do not install/execute repository scripts automatically from a README.
Pin reviewed versions; audit network/file access and dependencies.
Test on **copies of synthetic clips only**. Never grant an MCP tool access to
private production media until the adapter and permission boundaries pass QA.
Do not assume CapCut has a supported public edit API.

## Next integration gate

1. Register actual runtime availability and verified local tools for Codex,
   Claude Code and (where capable) local providers; no credential exposure.
2. Add a bounded `MediaEditAdapter` behind `prepare_edit`, returning a
   verified staged draft / rendered file, never an unsupported success claim.
3. On test media, require frame/audio QA: duration, resolution, orientation,
   AV sync, missing/black frames, caption timing, and original source hash.
4. Route an independent review to a different agent when eligible; otherwise
   block and require an explicitly recorded manual QA result.
5. Keep the publication approval gate and the current three visible folders.
6. Measure completed accepted outputs, failed revisions, operator time,
   cost and quality against the existing baseline before broader rollout.

This PR is the router and contract pilot, **not** an installed Claude,
CapCut, or autonomous video editing integration.
