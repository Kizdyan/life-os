---
name: life-os-skill-discovery
description: Find candidate Agent Skills for Life OS, Persona, Erika and Dive M while preserving pinned-source security, manual approval and provider readiness. Use when asked to discover, compare, evaluate or connect AI skills.
---

# Life OS Skill Discovery

Use the existing Skill Intelligence system; do not install untrusted `find-skills` instructions or create a competing skills registry.

1. Identify the task, needed capabilities, candidate agents and privacy classification. Never place secrets, private filenames, customer details or user media content in search queries.
2. Inspect already available local project Skills and `packages/core/src/skill-discovery-seeds.ts` before considering new ones.
3. When Vercel OIDC is already configured and network use is authorized, search the official skills.sh API with:
   `npm run skills:find -- "short non-sensitive task keywords" --limit 10`
   The tool is **read-only**. It needs `VERCEL_OIDC_TOKEN` in the process environment; do not request, print, create or commit bearer tokens.
4. If the API cannot be accessed, report `AUTH_REQUIRED` or unavailable and use existing offline records without pretending to have performed a live catalog search.
5. Treat every returned record as `discovery_only`. Popularity, links, descriptions and rankings are **not proof** of safety, license, compatibility, author identity or successful installation.
6. Before recommending installation, require independent source pinning, complete package SHA-256 inspection, permission and license review, identified human approval and synthetic quality benchmarks. Follow `docs/SKILL_INTELLIGENCE_P1.md` and `packages/core/src/skill-source-evidence.ts`.
7. Never automatically run `npx skills add`, unattended global install, arbitrary external scripts, model API calls, media uploads or deployment. A plan does not confer execution rights.
8. Prefer existing project-local, audited capabilities over redundant global Skills. Recommend a Codex/Claude provider only when connected and verified; Claude OAuth may be pending.
9. Return a concise shortlist with source, status, missing checks, risk and a concrete next approval step. Distinguish **found**, **reviewed**, **installed** and **verified working**.

This repository Skill only guides safe discovery; it does not connect third-party accounts or grant any new permissions.
