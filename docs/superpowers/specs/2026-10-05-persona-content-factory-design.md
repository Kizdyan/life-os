# Persona Content Factory — Design

## Goal
Turn Persona inside Life OS into an autonomous content-production and distribution system. The user acts as product owner/art director: the system does routine analysis, ideation, production, critique, adaptation, publishing preparation, analytics and learning; it asks the user only for genuinely missing source material and final approval/exception decisions.

## Core loop
Sense → Think → Create → Critic → Approve → Distribute → Measure → Learn.

## Inputs / Sense
- Life OS signals: calendar, projects, acting/theatre/music/musical work and other relevant current events.
- Media history: previous ideas and publications, statuses, formats and performance metrics.
- Platform/trend signals where connected.
- Media Library: user photos, video, audio and reusable source assets.
- Voice feedback and ad-hoc instructions.

## Idea Bank / Strategy
- Never limit the UI to three hard-coded topics.
- Maintain at least 10 useful candidate ideas when enough context exists.
- Idea states: use now / keep for later / not interested / used.
- Anti-duplicate logic must consider prior ideas and publications.
- Strategist chooses platform, format, angle, hook, goal and timing; when source material is missing, it creates a concrete capture assignment with an example/reference rather than asking the user to invent production details.

## Voice interaction
- Push-to-record / push-to-stop. No silence-based automatic termination in Persona feedback.
- Preserve the complete audio recording first; transcription begins only after the user stops recording.
- Transcription must preserve the whole utterance and then normalize punctuation/disfluencies without losing meaning.
- The complete transcript plus current draft, current screen/content state, prior feedback and style memory goes to an LLM intent/editor stage. Natural instructions such as “убери Persona, это внутреннее слово” or “текст налезает” must be understood semantically, not by brittle keyword rules.
- Keep original audio and normalized transcript attached to the revision event for recovery/audit.

## Production orchestrator
A content job is a stateful workflow, not one generator call. Roles:
1. Strategist — brief, angle, format, channel, timing, required assets.
2. Writer — copy, carousel/script/caption variants.
3. Photo processor — approved image treatment/style when image content is required.
4. Video editor/generator — edit, pacing, captions, audio/music and requested generation where appropriate.
5. Designer — carousel/layout/typography/visual system.
6. Platform adapter — Instagram/VK/YouTube and future relevant networks.
7. Marketing critic — hook, retention, audience value, CTA, positioning, repetition.
8. Media/design critic — readability, overflow, hierarchy, image quality, video pacing, audio/music, subtitles and technical defects.
9. Final QA controller — independent gate before user approval.

Each critic returns structured pass/fail + issues + target role. Failed jobs route automatically back to the responsible role and re-enter QA. The user should not see routine failed intermediate drafts.

## Final QA gate
The independent controller must verify at minimum:
- interesting/readable/watchable for a real audience;
- strong enough opening/hook and coherent story;
- appropriate CTA without forced advertising tone;
- no internal terminology (including public output containing `Persona`);
- no accidental duplicate phrases/slides/ideas;
- carousel text fits and remains readable on iPhone/mobile layouts;
- photo edits remain natural and match the learned approved style;
- video pacing, first seconds, cuts, captions, sound and music are acceptable;
- platform-specific constraints are met;
- final assets and copy are actually publishable, not placeholders.

Only QA-passed jobs enter Approval Center.

## Approval Center
Show a compact final package: preview/assets, platform versions, proposed publish time, and QA summary. Primary user actions: Approve, Change by voice/text, Reject/Do not publish, Keep for later. A revision re-enters the production/QA loop rather than applying a superficial local text substitution.

## Distribution
After approval, send platform-specific packages through connected publishing integrations. Initial target surfaces are Instagram, VK and YouTube; architecture must permit more networks. If an integration cannot directly perform a requested media transformation or publish action, the orchestrator must expose that as a capability boundary and use the connected specialist capable of it rather than pretending success.

## Analytics and learning
- Record publication/result metrics and feed them back into strategy.
- Learn explicit feedback and repeated approvals/rejections into editorial/style preferences.
- Do not overfit a single correction; strengthen a preference through repeated evidence or explicit “always/never” instructions.
- Track what topics/formats/hooks/styles have already been used and their outcomes.

## Public/private naming
`Persona` is an internal Life OS module/brand. It must never be automatically printed on public-facing carousel slides, captions, images or video overlays unless the user explicitly asks for it in that publication.

## UX success criteria
A normal session is: user opens Persona → sees what is scheduled/ready → optionally supplies one requested source asset → reviews a QA-passed package → Approves or gives one natural-language/voice correction → system reworks and rechecks it → publishes/schedules after approval. The user does not manually orchestrate Writer/Marketing/Design/Video agents.

## Migration from current prototype
- Remove hard-coded three-topic selection as the primary workflow; retain legacy drafts only as seed/test fixtures if useful.
- Replace heuristic revision handling with semantic revision orchestration.
- Replace auto-stopping speech recognition with durable manual-stop recording + post-recording transcription.
- Add persistent idea/content-job/revision/QA/style-learning models.
- Add production state machine and specialist adapters.
- Add independent QA before Approval Center.
- Preserve existing working Life OS navigation and mobile-first behavior while migrating Persona.
