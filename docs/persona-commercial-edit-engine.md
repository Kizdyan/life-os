# Commercial formats and local platform edits

The burned-subtitle / AI Director branch was merged in PR #156. Further work is
isolated in `feat/persona-commercial-edit-engine-20261109`.

Persona → Идея offers Commercial Showcase, Acting Range and Self-Irony / Comedy.
The local Worker uses all three author-provided examples from
`persona-commercial-examples.md` as few-shot system context. These are creative
examples, not measured market research or weight training. The original examples
remain intact; generated proposals have their own IDs, model and prompt/example
SHA-256. Old proposals remain in the project when the format changes.

`Создать идею с Qwen` generates one real unapproved proposal. Its hook, three
skills, music, acting task and selling ending are shown together. `Выбрать и
создать сценарий` invokes the existing director/Production Brief flow. A model
response never grants shooting or publication approval. New screenplay versions
retain prior script history; stale project/script responses are rejected.
The local CPU request budget is bounded at five minutes with thinking disabled.
No offline-template fallback exists. The author must assess creative quality;
few-shot examples alone do not guarantee a strong idea.

After approving a Production Brief, Монтаж supports either scene-assigned takes
or **Один длинный мастер-ассет**. The latter copies one explicitly selected file
and runs the existing full-file Whisper/candidate matching/Ollama pipeline.
Sources are bounded at 15 minutes / 2 GB. All scenes still require actual matching dialogue and clean non-overlapping
intervals. Missing speech, uncertain music boundaries and verbatim punchline
protections still lead to Recovery Review. A filename is never proof of content.

On Выпуск, **Сделать 4 версии для соцсетей** runs real, sequential local exports:

| Profile | Length policy | Color / captions |
| --- | --- | --- |
| TikTok / Shorts | max 30s; preserve complete verified lines | Dynamic Contrast, bold outlined captions |
| Instagram Reels | target 30–45s | Commercial Cinematic, champagne regular captions |
| VK Видео | target 40–60s | Cinematic, calmer captions; confirmed context preferred |
| YouTube | max 600s | Commercial Cinematic; confirmed pauses/music retained |

Each profile sends its intent to the real local editorial model, which selects
only existing ASR candidate IDs. The existing timeline renderer levels dialogue
with measured peak limits and preserves approved music tails. Outputs remain
9:16; this version does not invent a landscape composition from vertical footage.
An over-limit complete script is blocked instead of clipping a phrase. Short
material stays short with an explicit warning: context, B-roll and a ten-minute
director's cut cannot be manufactured from absent footage.

The pipeline is Video → optional approved B-roll layer → color → burned captions
→ exact-file verification and independent VIDEO-QUALITY.json. Engine-level
`timeline.overlays` require author-reviewed intervals and actual source hashes.
They preserve the base voice; HDR/rotation and out-of-source ranges are refused.
Reviewed overlays and protected regions cannot transfer to a changed cut layout
without placement review. Optional ASR handles share the midpoint of adjacent
ASR intervals; actual speech overlap still blocks strict selection.
`timeline.protectedRegions` uses author-reviewed normalized rectangles to select
a caption position outside protected areas. Automatic face/object detection and
automatic semantic B-roll selection are **not implemented**. The UI does not yet
provide an editor for these optional overlay/protected-region declarations.

`AUDIO-ACCENTS.json` uses the existing energy-onset detector on actual mixed
audio. It is a measured heuristic, not recognition of orchestral tutti. No new
cut is silently snapped across a spoken phrase. Exact tutti synchronization is
**not implemented**; exports expose this limitation and require artistic review.

Every run uses a new output folder. EXPORTS.json records candidate decisions,
filters, model, paths, hashes, QA and warnings. Original takes remain untouched.
The Worker accepts session IDs rather than arbitrary source paths, checks local
origin/host/token, serializes exports and verifies hashes before downloads.
Reload restores results while the same Worker instance is running. Restart
recovery for previous Worker session IDs remains an existing limitation; files
and reports stay on disk. Nothing publishes, uploads private media or enables
`publicationApproved` / `distributionAllowed`.

CLI: `node tools/persona-platform-edits.mjs RESULT.json NEW-output-dir local-model FFmpeg-bin`
