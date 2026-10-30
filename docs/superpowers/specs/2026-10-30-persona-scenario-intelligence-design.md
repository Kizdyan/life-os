# Persona Scenario Intelligence — design

## Intent

Persona needs one evidence-led route from a real reference or a permitted
research result to an original, reviewable Reel concept and then to the
existing `PersonaProductionBrief`. It must never fabricate trend metrics,
claim a video was watched when only metadata was available, or turn a draft
into a shoot-ready brief without a named author decision.

## Goals

- Add the Persona flow **Research → Choose → Write → Edit → Approve → Shoot**.
- Reuse `reference-evidence`, `format-memory`, `style-memory`, Creative
  Profile, `persona-production-pipeline`, and `personaProjectStore`.
- Persist references, research provenance, script revisions, three editorial
  reviews, and approval state in the selected Persona project.
- Work with manual links and an explicitly provided, allowed search result
  without a Perplexity account. Missing data remains visible as missing.
- Translate only an author-approved script into the current Production Brief,
  leaving intake, Whisper, FFmpeg, and Creative QA unchanged.

## Non-goals

- No autonomous scraping, video downloading, publication, or private-media
  upload.
- No prediction of views, fake trend scores, copied scripts, or automatic
  artistic approval.
- No Perplexity call, API key, MCP install, or paid service activation in this
  release.

## Approaches considered

1. **Offline-first provider boundary — selected.** A small core Scenario
   Intelligence model validates manually supplied links and existing permitted
   search evidence. A server-side Perplexity adapter is represented as
   `disabled` unless an operator explicitly configures a server-only key and
   spend limit. This gives a usable and testable flow without transmitting
   user data or spending money.
2. **Perplexity-first research.** Useful only after a key and an approved
   budget exist; it would make the first release depend on external service
   availability and cost, so it is deferred.
3. **Standalone scenario editor.** Rejected because Persona already owns
   projects, editorial QA, approvals, and production briefs.

## Design

### Core model

Add a focused `persona-scenario-intelligence` core module. A research item
contains its URL, platform, author/date/visible metrics when actually known,
source evidence, and an observation status: `metadata_only`,
`user_reviewed`, or `unavailable`. A reference analysis records mechanics
(hook, situation, desire, obstacle, turn, payoff, editing, sound, production
complexity) separately from factual claims.

An idea must reference one or more stored research IDs, declare its own
original conflict and acting task, and state why it fits the Creative Profile.
The Idea Engine has deterministic, evidence-preserving suggestions for the
offline path; it cannot describe a source as trending without evidence.

Scripts are immutable revisions. Each has a synopsis, ordered scenes, and
three distinct editorial reports: dramaturg, director, and audience/producer.
Reports list concrete findings and blocking issues rather than invented
numeric quality or view predictions. A script becomes approvable only when
every blocking issue is resolved or explicitly waived by the author.

### Provider boundary

`ScenarioResearchProvider` is server-side only. The first provider accepts
manual/allowed web-search records and performs validation only. The optional
Perplexity adapter checks a server-only enable flag, key presence and a
configured positive request/spend limit before sending a request. With any
missing condition it returns `disabled`, does not contact Perplexity, and the
UI keeps manual-link research available. No key enters the client bundle,
project JSON, logs, or browser storage.

### Persona integration

Extend the existing Persona project model with an optional, versioned scenario
workspace. Older projects retain their existing fields and load unchanged.
The current Persona UI receives one Scenario section, not a new app: reference
list and evidence status, idea selection, script revisions/editorial feedback,
then a guarded “Create shooting brief” action. That action converts the
approved revision into the existing `PersonaProductionBrief` import/revision
route, which still requires structural QA and named editorial approval.

## Acceptance checks

- Invalid or duplicate links, fabricated metrics, and unverified “watched”
  status are rejected.
- The offline provider remains useful and makes no network call.
- A scenario revision preserves its predecessor; approval is cleared on edit.
- Blocking Script Doctor findings prevent conversion to a brief.
- An approved revision becomes a valid existing Production Brief, with source
  facts and original project data preserved.
- Existing Persona projects, media tests, typechecks, and the web build remain
  green.

## Implementation calls

- Use current TypeScript, React, project store, and test stack; add no package.
- Keep source evidence as metadata and URLs, never copied external video or
  transcript text.
- Defer live Perplexity integration tests until a server key and budget are
  explicitly authorized.
