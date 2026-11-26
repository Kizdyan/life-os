# About Me: reuse existing local photo review

This is an additive integration in PR #228. It is not a claim of real-device acceptance.

## Local configuration

Use the existing private Yandex cache via PERSONA_YANDEX_CACHE_DIR in the local Worker's environment or ignored .env.local. Do not commit the path, public share URL, photo scores or photographs. Keep the legacy photo-analysis output intact. The existing start-persona launcher loads .env.local.

## Flow

1. Editorial Desk → Prepare "Обо мне" from local archive. The authenticated Worker reads the existing about-me/photo-scores.json and personal-media catalog.
2. A global assignment maximizes category coverage before number and sum of scores. It uses only stored scores >=6. A new private shortlist is created without Ollama calls or replacing the old shortlist.
3. Worker permits image access only by a generated package UUID and asset SHA; it verifies package containment, manifest membership, hash, size and JPEG/PNG magic. The browser verifies the digest and decodes each image before saving into the existing IndexedDB archive.
4. Select at most one valid photo per category (try the next candidate if import fails), create a separate photo-led carousel with 3–5 slides and all approval flags false. Missing categories remain explicit. No music or screen credits, titles or roles are inferred from photos. Labels are provisional and require author review.
5. Reuse existing content and design gates and backup. No publication, remote inference, automatic source modification or automatic author approval.

## Limits and acceptance

- Legacy checkpoint shape has not been verified on the real PC. Unsupported checkpoints fail without overwrite; do not restart full analysis solely because of incompatible schema.
- JPEG/PNG within editor size/pixel bounds only. Unsupported files are reported/excluded. Distinct hashes do not rule out near-duplicate poses. Model classification is not proof of occupation, identity, authorship or permission to publish.
- The existing local archive save is not a multi-asset transaction: successfully imported immutable assets remain available if draft creation fails. No existing editorial draft is overwritten.
- A real acceptance run must confirm the saved scores can be read, zero new vision calls, at least three usable categories (ideally music, screen, stage and portrait), actual original pixels, valid draft, previews, backup/restore and explicit author approval. If music is missing, inspect score coverage before deciding on targeted re-analysis.
- The current bridge is user-triggered via one editor action; automatic startup, persistent background scheduling of this specific draft and mobile pairing are still open.
