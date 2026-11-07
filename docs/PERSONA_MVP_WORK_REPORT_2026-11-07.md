# Persona MVP — implementation checkpoint

Date: 2026-11-07. Branch: `feature/persona-mvp-five-step-20261107`.
Scope: first safe UX/agent-prompt increment; **not a finished MVP**.

## Document and database prerequisites
- `docs/MVP-FOCUS.md` — missing from the current main branch during preflight.
- `docs/UX-DESIGN-PERSONA.md` — missing from the current main branch during preflight.
- `docs/TECHNICAL-SPEC-MVP.md` — missing from the current main branch during preflight.
- The older `docs/PERSONA-PRODUCT-BLUEPRINT-2026-11-03.md`, `docs/ARCHITECTURE.md`, and checked-in `.agents/skills/*/SKILL.md` were used as supporting references.
- Connected Supabase project `life-os-production` reports `INACTIVE`. Table listing failed because the database is inaccessible. No migration was run. Actual `persona_*` table state remains **UNKNOWN**.
- **Do not apply a newly invented schema to production.** The present `personaCloudProjects.ts` expects `persona_projects.local_project_key`, `snapshot`, `revision` and RPCs; a simplified SQL draft from chat is not a proven replacement.

## Work implemented on this branch
- Five visible Reel stages: Idea, Script, Shoot, Edit, Publish.
- Existing seven internal workspace states, project records, draft guards and author reviews retained. Shoot and Publish each expose their two existing detailed views.
- New Reel projects begin at Idea. The existing pilot direct-to-shoot entry still opens its production guide.
- Role prompts for Creative Producer, Engineering Delivery and Marketing Research are centralized; creative prompts are composed into the existing AI generation/director calls and marketing prompts into AI-assisted idea planning. Existing JSON output contracts remain.
- Marketing live search is **not implemented** by merely defining its system prompt. Engineering prompt is available for engineering agents but is **not** a deployed autonomous engineer.
- No new external AI calls, deployment configuration or paid actions introduced.

## Still blocked or unverified
- Supabase availability and schema / authenticated ownership policies.
- End-to-end mobile upload to worker, actual FFmpeg render and device MP4 download.
- Human visual and audio review of a real video on iPhone.
- Availability of the three requested product/specification documents in the repository.

## Next technical slice
1. Restore or confirm authoritative MVP/UX/technical specification files, reconcile cloud schema against existing RPC contract.
2. Test five-stage navigation in mobile browsers and saved-project restoration.
3. Implement one real, verified media handoff and MP4 download from existing local worker, without uploading source media automatically.
