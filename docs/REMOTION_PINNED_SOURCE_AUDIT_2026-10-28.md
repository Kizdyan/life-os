# Remotion Skills — audit of pinned public source, 28 October 2026

**Scope:** `remotion-dev/skills@30d4553ecd46fbc5212fd0ff006ae43af522158b`, directory `skills/remotion-best-practices`. Read-only GitHub source inspection; **not** an executed or installed skill.

## Tree and provenance
- GitHub Git Tree API returned an untruncated tree; subtree comprises **144 blobs, 1,183,282 bytes**.
- Extensions from tree metadata: 88 Markdown, 13 YAML, 13 SVG, 10 TSX, 8 JSON, 6 TS, 4 MJS, 2 GeoJSON.
- **20 source-code entries** with extensions `.mjs`, `.ts`, `.tsx` (some duplicated under `remotion-markup/remotion-maps` with identical Git blob hashes). No Git symlink entries reported in the inspected subtree.
- Three major internal dependencies checked at the pinned commit: `remotion-create/REFERENCE.md`, `remotion-render/REFERENCE.md`, `remotion-captions/REFERENCE.md` exist.
- The standalone installer-oriented source was confirmed as `remotion-dev/skills`. Earlier broken references observed in `remotion-dev/remotion/packages/skills` were **not** proof of a defect in the official installable package.

## Focused content review, not full-package approval
1. **Local writes:** `remotion-maps/techniques/cesium/scripts/prep-cesium-path.mjs` calls `readFileSync`, `mkdirSync`, `writeFileSync` for processed geography. `remotion-maps/techniques/maptiler/scripts/prep-geo.mjs` reads input data and writes multiple processed files. These capabilities require explicit filesystem scopes and output-directory checks; do not grant automatic write access or execute them during discovery.
2. **External network resources:** MapLibre documentation references the `unpkg.com` worker and `demotiles.maplibre.org` style resources; the Mapbox technique references styles served via Mapbox. They require a separately approved network policy and caching/privacy review.
3. **Credentials:** Mapbox documentation illustrates `process.env.REMOTION_MAPBOX_TOKEN`. It is an example of accessing a credential. Do not expose private environment variables to candidate skills or pass raw credentials to client bundles.
4. **Licensing:** No standalone `LICENSE` path was present in the inspected Git tree. Remotion's runtime repository has separate licensing conditions dependent on the user's/company's circumstances. License acceptance for this Skill and Remotion-based commercial product integrations **has not been established**.

## Proposed Persona pilot boundary (not executed)
- Target only `remotion-best-practices`, `remotion-create`, `remotion-markup`, `remotion-render`, `remotion-captions` guidance for an isolated **public/synthetic** Reels editing pilot.
- Do **not** enable `remotion-maps`, Mapbox/MapLibre/MapTiler, scripts with filesystem writes, browser network fetch, paid services, global installs, token access or publication in the initial pilot.
- Agent provider and Remotion runtime must be installed and independently verified first. Output must go through existing Persona FFmpeg/ffprobe QA, human identity/color review and media-rights verification.
- No approval to install or execute has been issued by this report.

## Engineering changes in PR #121
The source verifier `scripts/skill-source-verify-git.mjs` checks a **local** checkout's HEAD against exact pinned Git commit and every Git blob, calculates SHA-256 for files and bundle, and rejects unexpected files, symlinks or changed content. The runtime does not download source code. On a locally constructed temporary checkout its tests passed **7/7**; when combined with five video QA test cases, **12/12** tests passed.

New reviewer-acknowledgement contract:
- For a scanner finding of severity `review`, an identified reviewer with final approval must explicitly list `path::rule` in `acknowledgedFindings`.
- An unacknowledged review finding remains blocked.
- Severity `block` remains blocked, even if its key is listed in acknowledgements.
- The associated Git source, skill path and bundle digest must match; the manual-review route never installs or executes code.

**Status:** SOURCE REVIEW IN PROGRESS / NOT APPROVED / NO REMOTION RENDER. This is targeted source inspection, not a complete audit of every file. Exact GitHub CI and full TypeScript build remain unverified.
