# Persona: editorial calendar → production → QA → distribution

## Current branch scope
1. Open Persona Factory. The rolling 90-day calendar keeps manually entered themes locally under `lifeos:persona:editorial-calendar:v1`. It is not yet the canonical Life OS task store.
2. Choose **Тема** and save a concrete idea. **Съёмочный план** opens the existing production brief and selects the same idea in Persona Factory. The media editor uses the slot ID as the project ID.
3. Add actual clips to the video timeline and export its JSON. The browser timeline does not render MP4; use the existing `npm run media:timeline -- <manifest.json> <output.mp4>` workflow. Do not treat a JSON export as a rendered video.
4. Verify rendered files on disk using real probe/hash/QA tools. The pure `evaluatePersonaMediaHandoff` function only validates evidence supplied by its caller; it does **not** itself run FFmpeg, inspect a filesystem or prove the supplied booleans are authentic. A trusted server/CLI must generate the evidence.
5. Obtain explicit author approval after reviewing the output. Only then call `buildVerifiedPersonaDeliveryInput` and `buildDistributionPlan`.
6. Delivery status is independent per platform. `published` requires a verified external post ID and timestamp; setting that state is **not** a network publishing operation.

## Tests
- `npm run persona:core:test` — editorial slots, per-platform states and media handoff.
- `npm run media:test` — the above plus media engine and timeline synthetic tests.
- `npm test`, `npm run typecheck`, `npm run api:typecheck`, `npm run web:build` — full project gates.

## Explicitly not complete
- No canonical Tasks/Calendar/MediaAssets synchronization or Yandex.Disk integration.
- No actual automatic editing from arbitrary source clips; existing timeline render is CLI-based.
- No trusted evidence-producing QA adapter connected to the handoff gate.
- No official social platform upload adapters, verified post retrieval or analytics sync.
- No automatic publication without author approval.
- CI must be green before merging; do not merge or deploy on the strength of added tests alone.
