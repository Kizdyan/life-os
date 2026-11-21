# Persona production evidence — 21–22 November 2026

## Review material, not publication approval

The seven-slide **«Зачем композитору гул холодильника?»** carousel is a new,
independent production draft. Open Persona → Editorial Desk →
**«Гул холодильника · производственный черновик»** → **«Скачать черновик для проверки»**.
This reuses the existing editor, IndexedDB media store, Canvas typography and ZIP
export. There is no second editor or renderer. Topic, source, content and design
approvals remain the author's decisions. Review export does not authorize publication.

`config/carousel-fridge-hum.json` stores the copy, source audit and layout.
Seven distinct text-free illustrations and their SHA-256/prompt provenance live
in `apps/web/public/carousel-backgrounds/fridge-hum-v1/`.
They were generated with the built-in Codex image tool, saved, and imported into
Persona. **They were not generated through the running Media Worker.** No user
API key or paid-provider endpoint was used. Runtime paid image generation remains
subject to explicit consent and credentials; this test does not prove that loop.

Source: https://www.carterburwell.com/projects/ncfom/ — composer's own notes and
the reproduced Dennis Lim article, *Exploiting Sound, Exploring Silence*,
6 January 2008. The 60 Hz refrigerator claim is attributed to that article.
The unverified claim that the hum stops exactly at the coin reveal is excluded.
Slides 6–7 are editorial interpretation/questions. Editing checked copy marks the
attached source audit `NEEDS_RECHECK`; it never grants source approval.

## Actual local outputs

Root: `G:/test-persona/persona-production-sprint-20261121/`.

* `carousel/slide-01.png` through `slide-07.png`: 1080×1350.
* `carousel/contact-sheet.png`: 1080×2160; labels outside thumbnails only.
* `carousel/fridge-hum-DRAFT.zip`: seven PNGs, contact sheet, caption, draft,
  review manifest, sources, source evidence and image provenance.
* `carousel/mobile-persona-draft.png`, `browser-QA.json`: actual 390px UI evidence,
  preview/export SHA-256 equality, safe bounds, text checks and measured contrast.
* CI workflow `Persona Creative Studio Visual QA` reproduces this draft from the
  checked-in assets and uploads `persona-fridge-hum-production-draft` for review.

Minimum measured text/background contrast: **7.11:1**. No slide numbering is
painted into the individual images. Cyrillic copy is rendered by Persona with
Cormorant Garamond and Inter; the backgrounds contain no generated text.
The browser test verifies all seven PNGs and leaves the saved draft unchanged.
Normal publication export still rejects the unapproved source gate.

## V14 and pending integrations

`V14_REFERENCE_BLOCKED`: no real `Carousel_01_V14_Jaws.zip` was found in the
accessible work folders, downloads, archives, backups or connected Drive search.
A historical ChatGPT sandbox link is not a recovered file. This draft is **not**
a reconstruction of V14. No replacement source text was invented.

Seven relevant pending requests were inspected without merging or editing them:

| PR | Relationship / disposition |
|---|---|
| #221 | Current base, `85b9699`; ten baseline workflows passed. |
| #220 | Included through #221; research integration dependency. |
| #219 | Format-aware route already included through #220. |
| #218 | Cinematic backgrounds already included through #221. |
| #213 | Research branch; conflict against main remains; left untouched. |
| #214 | Independent documentation audit; left untouched. |
| #200 | Older first-run work, conflict against main; left untouched. |

The sprint branch is stacked on #221. Main, older carousels, releases,
user sources and existing author approvals are unchanged.

## Real-media Reels exercise and honest limits

The existing Quick Render service imported both real iPhone takes
`001.mp4.mov` and `002.mp4.mov`, preserved their complete acting windows and
original hashes, and produced:
`reel/PERSONA_REAL_TAKES_REVIEW.mp4` — H.264/AAC, 1080×1920, 54.783333 seconds,
SHA-256 `5b1e02cb8cfbe3144b3554cd517899d03ca38cde914ad0e5a5856f0b146c1b5c`.
Canonical job `4f9ac5d6-d7f5-433c-b51c-8a3c1abbc896` awaits author approval.
Both source hashes remain unchanged.

Two real intake defects were fixed without adding a renderer:

1. Right-angle iPhone display matrices were rejected. Geometry now follows
   FFmpeg's autorotation; arbitrary rotations and HDR still fail closed.
   A real rotated MOV regression verifies upright pixels, audio, duration and
   unchanged source bytes, rather than trusting metadata alone.
2. Local Whisper produced repeated Georgian letters and `[Subscribe]` on quiet
   audio. These hypotheses are retained as evidence but rejected as dialogue.
   No invented quote or subtitle is burnt into this MP4. Manual transcription
   remains required; font validation was not weakened.

Read-only loudness measurement found **−32.17 LUFS / −1.07 dBTP**, with wide
dynamic range. This is not a publication-ready audio mix or proof of speech
intelligibility. The render is evidence of preserved real footage, not artistic
acceptance or a finished captioned Reel. No private footage is uploaded by CI.

## Independent review and fixes

Read-only independent review confirmed the source attribution and reviewed the
actual contact sheet/full slide. It found two issues, both corrected:

* Unsupported hierarchy fields could save copy that the chosen composition
  could not render. The editor now exposes only supported fields. The new SSR
  regression failed before the fix and passed after it.
* Canvas audit measurements could include an in-flight React preview and assign
  text to the wrong slide. The audit now uses a separate same-origin page and
  checks that every recorded line belongs to the recorded slide.

The existing research browser test needed an exact accessible-name selector
after adding review navigation; its original approval/export assertions remain.
The follow-up independent review found no blocking defect in these fixes.

The full media suite also exposed a real persistence race: `save(job)` published
the completed in-memory card before the final atomic `quick-state.json` commit.
Polling clients could start a backup/restart while the writer was still active.
The cache is now updated only after the atomic disk write. A deterministic
regression holds the final rename, asserts that completion is not yet visible,
and then releases it. It failed before the fix and passed after it.

## Verification

* TypeScript: root, web and API checks passed.
* Vitest: **649 passed, zero failed**.
* Production browser: seven real PNGs, ZIP, contact sheet, source/provenance,
  byte-identical previews, zero paid requests, unchanged approvals — PASS.
* Existing research browser: eight-slide import, source review and export — PASS.
* Background/research Node tests: **12 passed**.
* Vite production build — PASS (existing large-chunk warning remains).
* First concurrent media run: 327 passed, 5 failed, 5 skipped. Serial diagnosis:
  331 passed, 1 failed, 5 skipped. The remaining failure exposed the persistence
  race described above. Full concurrent rerun after the fix: **332 passed,
  zero failed, 5 skipped (337 total)**. Exact-head CI results follow in the PR.

Artistic quality, exact wording, caption and publication remain for the author.
