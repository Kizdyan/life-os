# Autonomous carousel: next acceptance target (2026-11-25)

## Goal and release order
The author wants Persona, not Codex or ChatGPT acting manually, to create the next carousel. Preserve the author-liked Burwell carousel on PR #224. Publish only after author authorization and successful platform connection; Instagram connection is currently blocked by password recovery. TikTok and YouTube connections were confirmed in Metricool, not publication-tested. Do not alter main, PR #224 or #225, original media or local work in progress.

First prove one new autonomous carousel, then repeat with independent topics at the accepted quality level, then enable two carousels/week. In parallel develop complete Reel preproduction and postproduction, then two Reels/week and one proposed photo/week (photo frequency adjustable). Stories remain manual. Do not change the existing 3-slot scheduler until the corresponding format is accepted. Keep master video in native source quality up to 4K and export platform-specific versions; no fabricated 4K. Platform publishing remains a separate consent gate.

## Implemented in this branch
Existing POST /carousel-research accepts an explicit alternative:
```json
{"mode":"discover","history":["previous title"],"consent":true}
```
No ready-made theme is required or allowed in discovery mode. History consists of up to 20 titles, each <=160 characters; send only public editorial titles, not private information. The existing Worker token, shared hourly rate limit (5 external calls), Perplexity API key and explicit paid-call consent still apply. The adapter searches and asks its configured model to choose one concrete new story, 5–8 slides and visual directions. All source URLs must occur in search results. Discovery additionally requires 3 sourced slides, distinct slide text, visual direction on every slide and no normalized exact title duplicate in supplied history. Semantic duplicates remain possible; no semantic similarity gate claimed. The previous manual topic route remains supported.
The result is UNVERIFIED, not SOURCE_PASS, never approved or published. A URL being in a search result is not evidence of entailment. The next stage must retain source text and verify each fact and caption. Current research model name is configurable and must be checked live before use; no real provider call was made during this change.

## Next increments (in order)
1. Implemented in this branch: explicit discovery button in the existing Editorial Desk, last 20 persisted carousel titles, and provider/model/mode/timestamp receipt. The actual live UI/provider run is still pending.
2. Evidence: retain bounded source excerpts and provenance (retrieval date, URL, claim mapping). Validate source content against every factual claim, including caption, using independent review; block unsupported claims. Untrusted source text must not trigger tools, payments or actions. Fail closed when unavailable. Prefer first-party source material.
3. Implemented draft batch path: existing OpenAI adapter, explicit authorization for the exact number of missing backgrounds (at most 8), one request per missing slide, stop at first failure or revision change, persistence after each result, explicit new authorization on resume. No library fallback counted as generation. This limits request count, not total monetary cost. Check the selected model and pricing before granting real consent. No paid requests on load or scheduled run. Live provider/image acceptance is pending.
4. Use existing Canvas/Editorial Desk rendering and export. Compare actual PNGs with accepted reference; editorial critic evaluates hook, narrative, visual hierarchy, legibility, consistency, repetition and accuracy. At most two repair passes; approval remains human. Save actual PNGs, contact sheet, caption, evidence, manifest and original revisions.
5. Only after successful manual launch and acceptance, enable existing ProductionJob to run the stages. Keep typed receipts and budget, preserve crash recovery, block missing capabilities; avoid duplicated orchestrator or queue.

## Runtime
Perplexity Agent API for discovery/search, configured model for creative writing, independent multimodal critic for evidence and visual review, existing OpenAI Images adapter for assets, existing Canvas for PNG and Media Worker/FFmpeg/Whisper for video. The local Ollama Qwen 4B test did not meet factual quality. Do not silently switch to paid providers or local templates. Subscription and API access are separate and must be checked for this account.

## Acceptance
A real launch from Persona produces a new topic not supplied by the author, fact-checked text, independently generated visual assets, actual rendered slides and caption, and survives reload. Require provider receipts, source evidence, asset provenance, actual artifacts, explicit human review. Unit tests with fixtures are software checks only and do not prove creative autonomy. Do not reuse the approved Burwell images for this new publication. No source/artistic/publish PASS without its actual evidence.

## Morning launch / actual runtime blocker

Use the existing Persona checkout and local launcher only after ensuring there are no unsaved/uncommitted changes; review PR #226 before merging or updating the local working tree. Never reset or overwrite the author's existing branch or production files. This PR targets the PR #224 branch, not main.

With Persona's existing local Worker running from the reviewed branch, execute the read-only diagnostic from the repository root:

```sh
node tools/persona-carousel-provider-preflight.mjs
```

The diagnostic only performs two local GET requests per available launcher, prints configured status and selected image model, and does not expose secrets, spend credits, test provider connectivity, generate anything, or publish. If Worker is unavailable or keys are missing, stop and configure locally. No keys should be pasted into ChatGPT or committed to GitHub.

If readiness is confirmed, open Editorial Desk → Create carousel from research → Persona: independently find a topic. The explicit button authorizes one research request. The result is saved as an unverified editorial project. Verify factual evidence and public caption before committing image expenditure. For a discovery draft, the new image batch button generates only missing backgrounds after the exact request count is explicitly authorized. A returned image is stored locally before being attached to the project; a failed/replaced draft may leave an unattached asset in the archive, not a successful slide. Once every generated image is saved, use existing semantic composition and draft ZIP review. The export is not publication approval. Source verification and independent visual QA remain mandatory before release; no automatic fact/artistic pass is implemented here.
