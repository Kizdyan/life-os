# Skill Intelligence P2 — read-only skills.sh discovery (29.10.2026)

## What shipped

This is a narrow independent continuation of [PR #121](https://github.com/Kizdyan/life-os/pull/121). The new `scripts/skill-catalog-find.mjs` searches the **documented** skills.sh API without invoking `npx`, installing packages or executing third-party Skill instructions.

- `npm run skills:find -- "video subtitles" --limit 10`
- `npm run skills:find -- "playwright testing" --owner vercel-labs`
- `npm run skills:find:test` — isolated Node built-in tests
- `npm run qa:local` includes the new tests

**Prerequisite:** Vercel OIDC bearer token in the process environment (`VERCEL_OIDC_TOKEN`). Obtain credentials through your own authorized Vercel project and official OIDC integration. Do not paste a token into issues, Git, ChatGPT or logs. This P2 pilot does **not** create or refresh a Vercel token and makes no request when it is absent. Consult <https://skills.sh/docs/api>. The API endpoint is `GET https://skills.sh/api/v1/skills/search?q=...`.

This is a **live search adapter**, not an installed copy of `find-skills`. It does not imply that the CLI or skill is connected to Codex, Claude Code or the user's ChatGPT account.

## Security boundaries

- Only the documented HTTPS skills.sh API endpoint is contacted. No automatic redirect, installation, source checkout, shell command, webhook, upload, publication or provider invocation.
- The CLI sends the **search phrase** to skills.sh. Never use private file contents, customer details, secrets, names, or other sensitive data as search terms. The adapter does not transmit files.
- Requires a valid token; the token is never serialized in the JSON report. Reports always mark `discovery_only`, `approved=false`, `installed=false`, `verifiedWorking=false`, `mayInstallAutomatically=false` and `mayExecuteAutomatically=false`.
- Discards non-GitHub listings for now because existing Skill Intelligence P1 attestation currently expects a pinned Git commit. Rejects inconsistent IDs, malformed repository paths and invalid install counts. Catalog-provided URL fields are ignored and links are generated only for canonical HTTPS GitHub/skills.sh origins.
- Strict query, optional owner, result count, response byte, content-type and timeout bounds; non-JSON responses and API errors cannot leak remote response bodies or bearer tokens to console.
- Popularity and the catalog's duplicate flag are only **discovery metadata**, never proof of quality, licenses, safety or agent compatibility. The API search response does not contain verified pins, repository license review, bundle hash or independently tested execution results.
- Next steps after search: resolve Git source and commit, inspect full package, verify pinned Git objects, obtain explicit human reviewer approval, benchmark in isolated conditions, then evaluate `planSkillRoute()`. Never bypass the gates in `skill-admission.ts` and `skill-source-evidence.ts`.

### Find Skills upstream specific risk

The pinned `vercel-labs/skills@699d35b21bd3c97dbc0edeae062b2698898bb2e5` file `skills/find-skills/SKILL.md` was inspected as a **source reference**. Its generic instructions describe `npx skills find`, but also explicitly recommend `npx skills add <...> -g -y` as an unattended global installation option. Existing P1 static scanners flag this for **review**. This P2 adapter **does not copy or execute those installation instructions**. This is not a declaration that the upstream Skill is malicious; it is a reason not to import it verbatim without admission.

## Verification performed

- Local Node test suite: **10/10 PASS** on synthetic catalog response fixtures, including forgery, unsafe metadata, HTTPS endpoint pin, OIDC requirement, 401/429 error handling, streaming response caps and installation flags. The exact committed JS files have matching Git blob SHAs to the locally tested files.
- No real authenticated skills.sh request has been run here because Vercel OIDC is not available in the test environment.
- Full `npm test`, `npm run typecheck`, `npm run web:build` and GitHub CI on the new exact head remain **unverified**. This branch must remain Draft and cannot be merged on these narrow results alone.
- No Codex/Claude/ChatGPT skill installation and no Claude OAuth actions have been performed.

## References

- Official API: https://skills.sh/docs/api
- Official CLI: https://github.com/vercel-labs/skills/blob/main/docs/commands.md
- Upstream source: https://github.com/vercel-labs/skills/blob/699d35b21bd3c97dbc0edeae062b2698898bb2e5/skills/find-skills/SKILL.md
