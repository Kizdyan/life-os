# Persona acceptance criteria and evidence

## A. Cloud verification
- A specific commit SHA is built without using the user's computer.
- Dependency installation, root typecheck, web typecheck, API typecheck, unit tests and web build all run with exit code 0.
- Logs or structured test results can be inspected remotely.
- Failed steps report their actual errors; unavailable runners and provider quotas are classified as infrastructure incidents.
- No unapproved production deploy or new paid resource.
**Status:** NOT VERIFIED.

## B. Script creation
- From a stated goal, produce >=3 genuinely different concepts.
- Distinguish sourced facts from hypotheses and creative choices.
- Independent editorial critique evaluates strengths, weaknesses, brand fit and shootability.
- User approves and can edit a versioned script; no silent rewrite.
- Reel script includes hook, beat progression, spoken lines, shot plan, sound and ending.
- Carousel script includes slide order, text, visual direction and closing action.
**Status:** NOT VERIFIED END-TO-END.

## C. Reel from iPhone
- User uploads actual iPhone footage from browser without desktop.
- Upload survives network interruptions or fails recoverably; assets and jobs survive server restart.
- User sees status, reviews preview and downloads playable MP4 with correct video/audio.
- Color, subtitles and audio pass agreed quality review.
**Status:** NOT VERIFIED END-TO-END.

## D. Carousel
- Approved script becomes a complete exportable set of correctly ordered image slides.
- Text remains legible on a phone and editable before export.
**Status:** NOT VERIFIED END-TO-END.

## E. Analytics
- Views, reach, likes, comments, saves, shares, profile visits and follows are distinct real values.
- Invalid input is rejected; zero denominators are not fabricated.
- Stored data survives expected app lifecycle and can be exported or backed up.
**Status:** PARTIALLY IMPLEMENTED, NOT VERIFIED.

## Task completion template
Goal; baseline; files changed; commit SHA; commands and exact results; user-visible evidence; remaining risks; next dependency. If evidence is missing, mark BLOCKED or PARTIAL, never DONE.
