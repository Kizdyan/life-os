# Persona Arsenal Knowledge Base — production rules and industry portfolios

## Sources and trust

The canonical machine-readable source is `knowledge_base.json` (ten rules, version 1).
Each `KB-01`–`KB-10` entry has a traceability field. Confirmed references include
#135 (associative montage), #138 (signaling theory), #139 (Match Cut),
#140 (lighting) and #141 (top-down object comedy). Other rules originate from
the explicit user mission or prior discussion and deliberately have `referenceId: null`.
This file **does not claim that ten raw videos were viewed in this integration**.

The project rule is to prioritize attracting casting directors, directors,
producers, music supervisors and brands through **observable professional work**.
A viral hook that fails to demonstrate the actor's range, musical craft or
directorial judgment should be assessed as a strategic WARNING, not praised
for imagined metrics.

## Actor Portfolio

Persona Creative Studio → **Создать визитку** (`#persona/actor-portfolio`).

This module creates a **separate actor_portfolio project type**, never masquerading
as an ordinary Reel or submitted casting self-tape. The current generator is
**deterministic and template-based**, with selectable drama, comedy and music
story situations. It produces a 30–60-second screenplay, six timed shots,
camera/framing tasks, performance directions and Key/Fill/Back light. It
includes a constant-framing Match Cut, a top-down object comedy setup for
comedy and an unapproved associative pre-edit sequence. User can edit shots,
save the local project, and download a shoot sheet.

All dialogue is fictional material. The generator does not use the author's
personal casting history or invent any credits, film shoots, awards, or footage.
It does not render a finished video. Requires author editorial approval before
filming, recording, commercial submission, or publication.

## Associative EditPlan

For new standard production briefs the shot list and post-production instructions suggest
face → meaningful object detail → actor reaction. The separate Actor Portfolio produces
an explicit versioned associative `editPlan`. Existing legacy briefs are not automatically
augmented with approval-sensitive pre-edit snapshots. Object inserts such as
paper, a candle or a safe light source are **shoot instructions only**.
There is no automatic mixing-in of B-roll from the Internet, and no claim
that an insert was actually filmed. Existing approved productions and
subtitle typographic standards are unchanged. Rendering happens only from
real uploaded/reviewed sources using the existing media pipeline.

## Lighting and second phone

`tools/lighting_planner.py` and `packages/core/src/persona-lighting.mjs`
read shared `persona-lighting-presets.json`:
- Drama (KB-05): propose subtle rim/back light if a lamp is available,
  maintain legible face/eyes and safe background practices.
- Interview (KB-06): soft Key ~45° from the camera axis, just above eye level;
  Fill optional, rim optional.

The **Съёмка** UI also suggests an optional second smartphone as monitor,
but explicitly requires verifying device support, latency and privacy.
There is no assumption that every phone supports remote preview.

## Music Sync Portfolio

Persona Creative Studio → **Музыка для лицензирования** (`#persona/music-sync`).
Track metadata are stored in **browser IndexedDB** on the current origin:
`title`, `genre`, `mood`, `durationSec`, `stems`, `rightsOwner`,
`rightsStatus`, `trackUrl`, timestamps and immutable track ID.

Metadata only. The system does not upload, copy or transcode original audio.
Links must use HTTPS, and a rights owner's name is a **self-reported field**,
not legal clearance. The print-to-PDF action uses the browser's native print
engine: click **PDF-пакет с треками и ссылками** and choose **Save as PDF**.
The resulting A4 document has track links, genres, moods, duration, stems and
rights statements. Never call this a copyright licence or confirmed sync clearance.

## Visual identity

`config/persona-visual-identity.json` unifies the project's Quiet Luxury
palette, type stacks, margins, negative space, subtitle recommendations and
an **optional** FFmpeg color transform. The actor and music UIs consume
this same config. Codex can read it as source of truth. The timeline renderer
honors `"visualIdentity": "persona-visual-identity-v1"` in a user-supplied
project JSON; without that field the old render behavior remains **unchanged**.
This optional look must still pass human skin-tone/white-balance QA.
It does not override the pinned approved Cormorant-Garamond subtitle standard.

Command to inspect approved FFmpeg filter without applying it:

```powershell
node tools/persona-visual-identity.mjs ffmpeg-filter
```

## 90/90/1 (KB-09)

For 90 days select **one consequential professional result**, such as a
camera-ready casting portfolio package. Reserve up to **90 focused minutes**
per day for the work when the actual schedule allows. Protect the session from
notifications, busywork and unrelated production tasks. This is a planning
heuristic, not a factual claim about guaranteed performance, a prescription
to sacrifice sleep, or a penalty system. Missed sessions do **not**
create a backlog of debt; resume at the next realistic opportunity.
Measure concrete assets submitted or finished, not mere activity counts.

## Live AI audit boundary

`tools/strategy_analyzer.py` reads KB-08 and requests a real OpenRouter/OpenAI
model. On the user's Windows machine after safely configuring `.env.local`:

```powershell
.\tools\run_persona_real_audit.ps1
```

It writes per-job results to `%LOCALAPPDATA%\LifeOS\Persona\architect-jobs\reel-XX\output\strategy-analysis.json`
and a ten-scenario summary to `strategy-audit-report.md`.
The repo/CI cannot access the user's locally ignored `.env.local`, so
**unit/CI tests are not live LLM verdicts**.
Browser localStorage and disk ProductionJobs remain separate storage sources.

## Acceptance

- Node + Python shared-rule tests verify Arsenal, lighting, edit intentions,
  safe rights semantics and conservative claim boundaries.
- Vitest checks separate persistent actor projects, music metadata validation
  and machine-generated production plans.
- Playwright verifies click-through 1440px/390px portfolio routes,
  editable actor scenes, IndexedDB persistence, and a generated actual A4 PDF.
- Real media FFmpeg and all pre-existing API/typecheck tests still run on CI.
