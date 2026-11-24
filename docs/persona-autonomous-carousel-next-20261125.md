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
1. Wire discovery to the existing Editorial Desk and its persisted title history, without a duplicate editor. Show exact provider, pending/failed states, cost consent and research draft. Do not fabricate a result when provider is unavailable.
2. Evidence: retain bounded source excerpts and provenance (retrieval date, URL, claim mapping). Validate source content against every factual claim, including caption, using independent review; block unsupported claims. Untrusted source text must not trigger tools, payments or actions. Fail closed when unavailable. Prefer first-party source material.
3. Reuse the existing OpenAI carousel background adapter, one specific prompt per slide. Before real calls obtain explicit approval of a bounded total budget and model; existing per-call consent remains mandatory until a tested budget authorization replaces it. No paid calls on load or scheduler by default. Persist outputs and provenance, resume without duplicate generation. No library fallback counted as new generation.
4. Use existing Canvas/Editorial Desk rendering and export. Compare actual PNGs with accepted reference; editorial critic evaluates hook, narrative, visual hierarchy, legibility, consistency, repetition and accuracy. At most two repair passes; approval remains human. Save actual PNGs, contact sheet, caption, evidence, manifest and original revisions.
5. Only after successful manual launch and acceptance, enable existing ProductionJob to run the stages. Keep typed receipts and budget, preserve crash recovery, block missing capabilities; avoid duplicated orchestrator or queue.

## Runtime
Perplexity Agent API for discovery/search, configured model for creative writing, independent multimodal critic for evidence and visual review, existing OpenAI Images adapter for assets, existing Canvas for PNG and Media Worker/FFmpeg/Whisper for video. The local Ollama Qwen 4B test did not meet factual quality. Do not silently switch to paid providers or local templates. Subscription and API access are separate and must be checked for this account.

## Acceptance
A real launch from Persona produces a new topic not supplied by the author, fact-checked text, independently generated visual assets, actual rendered slides and caption, and survives reload. Require provider receipts, source evidence, asset provenance, actual artifacts, explicit human review. Unit tests with fixtures are software checks only and do not prove creative autonomy. Do not reuse the approved Burwell images for this new publication. No source/artistic/publish PASS without its actual evidence.
