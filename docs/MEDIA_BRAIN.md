# Media Brain v1

Personal media automation for Kostya. This module is designed to work with Erika, Life OS and DiveM without changing default DiveM behavior for other users.

## Visible storage model

Only three user-visible sections:

- Inbox
- References
- Projects

Published, approved, archived and review states are metadata/status, not folders the user must maintain.

## Primary storage

Yandex.Disk is the primary media store.

The domain layer depends on `MediaStorageProvider`, not on Yandex-specific paths or credentials.

Suggested root:

`/Apps/Kostya Media Brain`

Expected folders:

- `/Apps/Kostya Media Brain/Inbox`
- `/Apps/Kostya Media Brain/References`
- `/Apps/Kostya Media Brain/Projects`

OAuth token is supplied at runtime through `YANDEX_DISK_OAUTH_TOKEN`. Never commit it.

## Editing

CapCut is the preferred human-facing editing workbench.

Media Brain should prepare:
- selected source clips
- cut order
- hooks
- rough timing
- captions
- overlays/text
- sound/music cues
- aspect-ratio targets
- cover ideas
- revision notes

The core must not depend on undocumented/private CapCut APIs. If a stable supported integration becomes available, add it behind an editing adapter.

## Pipeline

Erika
-> Life OS context
-> Media Brain
-> DiveM pre-publish strategy assessment
-> Content Factory
-> CapCut
-> Observer
-> user approval
-> publish
-> analytics
-> Style Memory

## Personal autonomy

Use `PERSONAL_HIGH_AUTONOMY_MEDIA` only for the explicitly configured personal profile. Default users retain `DEFAULT_MEDIA_CAPABILITIES`.

Initial public publishing remains approval-gated.

## Style Memory

A saved reference is a weak signal. Publishing, explicit approval and specific edit feedback are stronger signals. Store preferences by dimension instead of assuming the user likes every aspect of a reference.

## Ingestion invariants

- Create an immutable asset record on ingest.
- Preserve provider/path provenance.
- Prefer content hash + provider path for idempotency.
- Do not destructively move/delete the original until the Observer verifies the new state.
- Unknown metadata stays null.
- Public publishing remains a separate approved action.
