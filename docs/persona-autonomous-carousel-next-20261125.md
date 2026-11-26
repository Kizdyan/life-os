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
2. Implemented independent text review: one explicitly authorized Agent API request with a separately configured PERSONA_CAROUSEL_REVIEW_MODEL distinct from the researcher, using documented fetch_url tool and fetch_url_results.contents. The response must cover title, caption, and every slide. Supporting and contradictory verdicts require excerpts actually present in fetched source snippets. Store the report, exact input, source URLs, short excerpts, time, model, and SHA-256 binding in the existing editorial record. Known negative current reviews block the existing human source gate; changing the public copy or source set makes the report stale. Positive AI review remains a candidate, not proof of entailment or author approval. No automatic rewrite or real provider run yet.
3. Implemented draft batch path: existing OpenAI adapter, explicit authorization for the exact number of missing backgrounds (at most 8), one request per missing slide, stop at first failure or revision change, persistence after each result, explicit new authorization on resume. No library fallback counted as generation. This limits request count, not total monetary cost. Check the selected model and pricing before granting real consent. No paid requests on load or scheduled run. Live provider/image acceptance is pending.
4. Existing Canvas/Editorial Desk rendering and export now include render-quality.json for autonomous discovery drafts. Actual PNG decode, 1080x1350 dimensions, SHA-256, duplicate bytes, near-uniform/black/white image and alpha warnings are recorded. These are technical checks only. Independent multimodal comparison with the accepted first carousel, visual hierarchy, legibility, color grading and bounded repair loop remain to be implemented/tested on actual new outputs.
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

The diagnostic only performs two local GET requests per available launcher, prints configured research/reviewer status and selected image model, and does not expose secrets, spend credits, test provider connectivity, generate anything, or publish. If Worker is unavailable or keys are missing, stop and configure locally. No keys should be pasted into ChatGPT or committed to GitHub.

If readiness is confirmed, open Editorial Desk → Create carousel from research → Persona: independently find a topic. The explicit button authorizes one research request. The result is saved as an unverified editorial project. Run the independent factcheck/editor button before committing image expenditure; inspect the findings, revise and recheck any contradictions or insufficient evidence. The reviewer needs PERSONA_CAROUSEL_REVIEW_MODEL configured locally, distinct from the research model. For a discovery draft, the new image batch button generates only missing backgrounds after the exact request count is explicitly authorized. A returned image is stored locally before being attached to the project; a failed/replaced draft may leave an unattached asset in the archive, not a successful slide. Once every generated image is saved, use existing semantic composition and draft ZIP review. The export is not publication approval. The ZIP contains actual PNG technical evidence. Source verification and independent artistic QA remain mandatory before release; no automatic fact/artistic pass is granted.

Official provider contract used for independent review: https://docs.perplexity.ai/docs/agent-api/tools/fetch-url-content (fetch_url_results.contents; fetched text can be incomplete or unavailable). No provider calls were made while implementing these changes. Tests use explicit fixtures only.

## Author feedback after first live Instagram carousel (2026-11-25)

Positioning is actor — composer — director (not generic musician). Keep all three professions visible across the brand. The author reported the first post was published and labeled as AI content; he found the opening fact intriguing but the story difficult to follow without prior film knowledge. This is a real editorial acceptance finding, not a factual-source failure.

New research/manual import prompt and independent reviewer instructions require: identify the medium and title on the opening slide; introduce every named person and character with role and context on first mention; explain unfamiliar terms and causal links; preserve intrigue without obscuring subject; make caption understandable alone; conclude with a concrete professional principle and author perspective without invented personal experience; separate headline/body/accent and plan a readable visual hierarchy with intentional color. Keep technical source URLs in internal evidence and allow natural public attribution where needed. These are model instructions, not a deterministic readability or aesthetic pass. Text review must flag specific fixes even when facts are supported. Existing approved/published first carousel remains unchanged.

The user's "Анализ видео" reference bank should be consulted for typography, editing and color inspiration before further visual implementation. No claim that all reference assets have been retrieved or integrated. Build reference-backed multimodal QA on actual outputs rather than declaring typography fixed by a prompt.

Each published feed post should trigger a Story announcement only after publication confirmation. A separate rendered Story asset may be auto-published where the connected account and API permit it; a native clickable share/link sticker requires a supported native/manual path (not established through the current Metricool connector). Do not claim native resharing support or publish an unapproved duplicate. Retain parent post identity and prevent repeat announcement. Current integration reference: https://help.metricool.com/schedule-and-post-on-instagram-6b6q5 and https://help.metricool.com/access-to-instagram-from-metricool-connection-types-and-differences-kcsrb .

Next acceptance target: carousel #2 fully ready for Friday 2026-11-27, planned Saturday 2026-11-28. Wednesday/Saturday carousel cadence; Story announcements additional to standalone Stories. Provider access, visual execution, scheduling and approvals still need real runtime evidence.
