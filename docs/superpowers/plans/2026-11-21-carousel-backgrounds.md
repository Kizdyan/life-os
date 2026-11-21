# Cinematic carousel backgrounds

Extend the existing Editorial Desk and Canvas renderer; keep the existing gate and approval functions. No separate editor or video pipeline changes.

- [ ] Add tests for local fallback, OpenAI success/failure, persistent background metadata and approval invalidation.
- [ ] Add five text-free photographic assets and a server-only OpenAI image provider, using the existing worker authentication.
- [ ] Store immutable asset references in slides; use the same Canvas PNG for preview and export. Keep existing text and captions unchanged. Add Playfair italic and remove decorative lines/dots only on photo-backed slides.
- [ ] Run unit, worker, typecheck, build and Chromium acceptance including fallback and preview/export equality. Inspect all eight PNGs.
- [ ] Create a PR and a separate review-only v4 release with eight PNGs, contact sheet and ZIP. Keep v1–v3 intact and both approvals false.

Assets use dark chocolate/graphite/amber, warm practical light, empty stage and solitary chair. Library selection is deterministic and works without a worker. API generation is explicit, one slide per request, with a bounded timeout and visible local fallback; no keys enter browser bundles. Changing a background changes the existing approval fingerprint.
