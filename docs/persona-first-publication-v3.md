# Persona first publication — review, not publication

## Conditional acceptance: slide5 dash only

After2e1a9d5 the independent art decision was CONDITIONAL_ACCEPT, pending one typography fix and personal author approval. Only the explicit heading break moved from `Обмен звуками — / до сведения.` to `Обмен звуками / — до сведения.`. All words, other slides, caption, photographs, colors, fonts and layouts are unchanged. The existing editor action can safely upgrade the saved2e1a9d5 draft, preserves that exact prior draft under a new base-commit snapshot key, and grants no author PASS.

The mobile browser regression now verifies six unchanged PNG hashes (1/2/3/4/6/7), unchanged caption, a non-isolated dash on5, exact preview/export bytes, no clipping, and a dedicated phone screenshot of slide5. Local production uses the actual saved prior draft and PNGs; CI uses an explicitly constructed legacy line-break fixture through the same revision functions. Prior artifacts remain preserved. This is a typographic repair, not a new artistic edition.

## One final editorial pass after a43a3a2

The author accepted the composition mechanism and requested only copy changes on slides1/2/5/7. The versioned `editorial-patch` record is applied through the existing editor/revision functions; no new carousel ID, renderer, fonts, images or layout definitions. The action refuses a customized base, is idempotent, and verifies a write-once snapshot before replacing the active draft. Its stable snapshot key survives later review revisions; review ZIP source evidence includes the prior draft. Historical fixtures and earlier exported folders remain preserved.

Actual source reading on2026-11-22 rechecked Burwell's notes and Lim's article reproduced on his site. `MATCHES_RECHECKED_COPY` / `sourceCheck:PASS` binds to this exact public copy and source mapping. Later wording/caption/source changes return `NEEDS_RECHECK`. This is separate from the author's SOURCE_PASS gate, which remains UNVERIFIED_AUTHOR. No text, design or publication approval was granted. The public caption contains no provenance, draft or font metadata; those remain in separate evidence files.

The single controlled export is in `artifacts/persona-final-editorial-pass/` in CI. Real browser checks require unchanged PNG bytes for slides3/4/6, seven1080x1350 PNGs, mobile safe areas, actual text contrast>=4.5, exact visible preview/export hashes, preserved snapshot and author flags. The local export passed with minimum contrast5.98. Post-export visual inspection noted a MINOR isolated em dash on slide5; it is disclosed for the author rather than starting another artistic iteration. Final artistic/publication decisions remain pending.

## Recovery after author rejection of the original V3 layout

The checked-in original V3 fixture is preserved. The author reported good photographs but repetitive layout, small explanation text and a weak hook. The fix is an explicit **Подобрать композиции по смыслу** action in the existing editor, available to normal research drafts as well as V3. It does not create a V4 fixture or a second editor.

The deterministic selector derives roles from text (scene, numeric evidence, contrast, work process, turn, takeaway) rather than a carousel ID or a slide-number lookup. Each role selects different geometry. Literata/Golos remain the typography system; explanations cannot shrink below60px, headings below88px. Normal research paragraphs are preserved when split into headline/body; existing kicker/highlight require an explicit editorial decision rather than disappearing. Overflow remains a visible error, never a license to omit words.

One narrow hook transformation converts an existing sourced frequency-matching claim into a question. It is a rule-based editorial suggestion, not a general LLM writer or a factual verifier. The fact slide's source links are copied to the cover as unreviewed; author/source/design approval is not granted. Other stories without this explicit pattern keep their wording.

The controlled Burwell production uses the seven existing illustrations. The actual UI action → Canvas → seven PNGs/ZIP → mobile preview passes, with minimum ink contrast5.98:1. The generic takeover zone was corrected to keep final text above the coin. CPU Canvas is used only for the semantic mode after the accelerated path produced different numeric glyph pixels between parallel export and later preview. The existing byte-equality gate now passes all seven; legacy V3 rendering is unchanged. Independent review found no remaining blocker for author review, not publication efficacy.

Reproduce this single production check with `PERSONA_PRODUCTION_REVISION=v3 PERSONA_PRODUCTION_COMPOSITION=semantic node tools/persona-production-carousel-browser-e2e.mjs`. CI retains the output under the existing V3 review artifact's `semantic-production/` folder. The author must still review hook, rhythm, legibility and finale, then explicitly approve or request changes.

## Actual deliverables

V3 is a separate seven-slide `carousel-fridge-hum-v3` in the existing Editorial Desk. It uses locally bundled, SIL OFL licensed Literata and Golos Text, real Cyrillic glyph checks, and the existing Canvas/export path. Open Persona → **V3 · финальная редакция для просмотра** → **Скачать черновик для проверки**. The downloaded ZIP contains seven 1080×1350 PNGs, contact sheet, caption, draft, sources and image provenance. On a phone, download the ZIP from this same interface and extract it in Files. Instagram upload is manual and requires author approval; downloading/opening Instagram is not publication.

No publication, author CONTENT_PASS or VISUAL_PASS is granted. READY_FOR_AUTHOR_REVIEW describes only a completed technical review export. The normal source/content/design gates remain strict. Existing separate text/design checkboxes record explicit author decisions. No publication URL or platform ID exists.

V1, V2 and alternate cover remain unchanged. V3 reuses their seven saved `codex-imagegen` illustrations; it does **not** prove autonomous Worker image generation. The current scene/story is a separate material, not the missing `Carousel_01_V14_Jaws.zip` (V14_REFERENCE_BLOCKED).

## Facts and editorial scope

Checked against [Carter Burwell's notes and Dennis Lim's article reproduced on his site](https://www.carterburwell.com/projects/ncfom/) on 2026-11-22: sustained tones rather than percussion; swelling hum tuned to the refrigerator's 60 Hz; early exchange between composer and sound editor; removal of familiar musical guidance. The final collaboration lesson is explicitly an editorial interpretation, not a quotation or an approved first-person statement. The full Perplexity standard was not found in accessible project files; the explicit mission brief was used. No claim that its full text was read.

Three key screens underwent independent review before the remaining four. One concrete correction cycle fixed cover line breaking, precision of the frequency explanation and the finale's repetition. Full seven-slide independent review found no clipping, collision or obvious glyph defect. This is an independent critique, not measured publication effectiveness or author acceptance.

## Reproducible checks

```sh
node --test tools/persona-editorial-fonts.test.mjs tools/start-persona.test.mjs
node tools/persona-editorial-v3-browser-e2e.mjs
node tools/persona-native-production-probe.mjs
```

The browser driver opens the real editor, exports PNG/ZIP, compares visible preview hashes, checks actual text ink contrast/safe areas and confirms no author approvals were changed. Playwright must already be installed; `PERSONA_PLAYWRIGHT_MODULE` and `CHROME_PATH` can point to existing Windows installations.

The native control uses a **different** substantive topic through the existing Worker route without paid consent. Expected result is RESEARCH_BLOCKED. No model call or manufactured scenario follows that blocker. Positive upstream mock contracts are separate tests, never autonomy evidence. A paid provider key and explicit financial permission remain prerequisites for a live end-to-end research/image proof.

## Life OS / Erika / DiveM

The same editorial content ID links a review task through the existing Life OS store. The explicit button schedules twenty minutes, then observer readback verifies the saved task. Retrying preserves the original time. Erika is a read-only projection of persisted facts; it does not claim artistic approval, verified publication or a development executor. LOCAL_RUNTIME was exercised in an isolated real mobile browser with persistence/reload; this is not proof of the user's cloud calendar. DiveM has an injectable interface but no connected production transport: NOT_CONNECTED.

## Reels and reliability limits

The existing QuickRenderService processed the two available real MOV takes via local Whisper and FFmpeg. Both full takes and original audio were preserved, originals SHA-256 checked, H.264/AAC exported at 1080×1920. Whisper returned unreliable annotations/repeated glyphs: the safety guard rejected speech captions. Only two of the eleven planned takes are present. No automatic quote/music replacement was fabricated. This output requires transcript, audio and artistic review before publication.

Offline outbox changes belong to a separate limited PR based on main, not this production branch. Backup PRs #199/#202 are already in main: per-job backup/restore exists, but whole-library/cloud recovery is not established. Open PR ancestry is not permission to merge or close. Keep the production stack #213 → #220 → #221 → #222 → #223 → this branch; do not independently merge overlapping #218/#219 without an integration/data-preservation check.

Issue #86's heartbeat and allowlisted QA runner are not an autonomous coding executor. A configured token can change a displayed role state but does not demonstrate coding-agent execution. Live coding, full-library backup, cloud task verification and DiveM strategy remain separate unverified capabilities.

## Next production priorities

1. Author reviews V3, chooses corrections/approval and performs any manual Instagram publication; record an external URL only after it actually exists.
2. Authorize a bounded live research/image run or supply licensed media, then repeat the native different-topic proof without Codex supplying stage outputs.
3. Supply/approve real speech transcript and remaining shots, approve a sound mix and preserve take continuity before accepting the Reel.
