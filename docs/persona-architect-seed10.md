# Persona: 10 Architect Reels — safe seeding

This is a two-store importer, not a new central database.

## Source of truth
- **Disk:** `ProductionJob` creates `job.json` with legal `PREPARING -> WAITING_FOR_FOOTAGE` transition, one directory per `reel-01` ... `reel-10`. `input/architect-source.json` preserves every original prompt, timeline, B-roll and musical note. `output/architect-shot-list.json` contains the 5 original timed blocks. `output/architect-manifest.json` relates `reel-id` to the randomly generated `ProductionJob.id`. No footage and no approval are added.
- **Browser:** Open `#persona/seed10` on the exact Persona site origin and device on which you want the ten cards. The site imports the shared fixture into `lifeos:persona:projects:v1` using project-store schema and preserved author edits. `stage=needs_assets` is a local planning-state projection of *waiting for footage*, not a live read of the disk Worker.

## Windows setup

From repository root, after updating to the merged commit:

```powershell
npm ci
npm run persona:architect:seed10
```

Default disk folder:
`%LOCALAPPDATA%\LifeOS\Persona\architect-jobs\reel-01\job.json` through `reel-10\job.json`.

Or explicitly:

```powershell
node tools/seed_10_projects.mjs --output-root "C:\LifeOS\Persona\architect-jobs"
```

Then visit `https://YOUR_PERSONA_SITE/#persona/seed10` **once per browser or device** (the operation is idempotent). The dashboard should show all ten cards. Use **Продолжить сценарий** for the editable planned scenes, or view the storyboard. All footage-dependent actions remain blocked.

For the same-command workflow in an **explicitly chosen separate browser profile**, install Playwright Chromium and use:

```powershell
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
node tools/seed_10_projects.mjs --browser-profile "C:\LifeOS\Persona\ArchitectChromeProfile" --site-url "https://YOUR_PERSONA_SITE/"
```

This launches a dedicated persistent Chromium profile and validates `localStorage` inside that profile. It **does not** magically write to the user's usual Chrome/iPhone browser. You must visit `#persona/seed10` in each other browser you use.

## Safety
- Ten exact source IDs, all 5 ordered shot segments, durations checked against the original range.
- Rerunning the script validates existing jobs and never resets a status, job ID, source data, user edits, or disk evidence. A collision with an unrelated job fails closed.
- Browser imports only missing IDs; it never modifies a matching stored project.
- Does not attach real B-roll, record any actual music, mark publication authorized, or claim video/audio evidence.
- The first hook may exceed the supplied 0–2s instruction; original timing is preserved for **human** review rather than falsifying a fit.
- Source `reel-04.music` contains the author's original text `Три коротких блога` (probably "блока"); data is deliberately not silently corrected.

## CI
- `node --test tools/seed_10_projects.test.mjs`
- `npm test`
- `node tools/persona-architect-browser-e2e.mjs` (Playwright Chrome at 390px and 1440px)
- `core.yml` actually invokes the CLI script and uploads all ten disk jobs as a downloadable artifact.
