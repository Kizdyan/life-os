# Persona P0 editorial-montage plan

**Goal:** extend the existing local Persona path without a new renderer or cloud services.

## Constraints

- Work only on `feat/persona-local-asr-autoselect-20261029` / PR #128.
- Keep source hashes verified; do not scan or upload personal media.
- Treat technical measurements as technical only; author review remains required.

## Task 1 — editorial decisions and incomplete preview

1. Add tests showing that each beat exposes at most three ranked technical/ASR candidates, a selected alternative is persisted, and an invalid manual alternative is rejected.
2. Add `strict` and `preview` decision modes. Strict continues to reject missing beats; preview preserves original beat order, records missing beats, and never manufactures a choice.
3. Teach existing assembly and runner interfaces to carry the mode, selected candidate metadata and missing-beat review notice.
4. Run targeted semantic/autoselect/runner tests; commit only after green.

## Task 2 — explicit vertical framing and inspectable previews

1. Add a failing renderer test for `contain`, `cover`, and normalized manual crop position, including a generated JPEG preview artifact.
2. Implement the framing variants in the existing FFmpeg renderer, defaulting to existing `contain`; require manual review for `cover` and make no subject-safety claim.
3. Run renderer tests and commit after green.

## Task 3 — B03 timestamp boundary and audio treatment

1. Add a failing test proving a post-speech musical tail uses an ASR timestamp/manual boundary and receives no dialogue gain.
2. Carry the boundary through decisions and montage; split audio processing in the existing renderer so only spoken audio is levelled while the tail stays original aside from codec encoding.
3. Ensure subtitles stop at the speech boundary and use manual-review status when only coarse timestamps exist.
4. Run target suites, full `media:test`, then a synthetic technical render; commit after green.

## Final verification

Run full media suite, inspect Git status/diff through an authorised Git context if available, and report only demonstrated capabilities and blockers.
