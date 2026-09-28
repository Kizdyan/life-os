# Yandex.Disk for Media Brain

Yandex.Disk is the primary media storage provider for Kostya's Media Brain.

## Runtime configuration

Use a server-side Yandex OAuth connection. Credentials must stay outside source control and browser code.

Default media root:

`/Apps/Kostya Media Brain`

Bootstrap creates only:
- Inbox
- References
- Projects

## Production direction

Use a server-side OAuth flow and encrypted secret storage. The user interface should expose only connection status and reconnect/revoke actions.

## Ingestion policy

- New files are discovered from Inbox.
- Ingestion is idempotent using provider/path/hash.
- Originals are not deleted or destructively moved by the ingest worker.
- Archive is copy-first and non-destructive in v1.
- Any future deletion requires approval plus Observer verification.

## User workflow

The user only needs to:
- drop raw materials into Inbox,
- place intentional inspiration into References when useful,
- review generated work in Projects.

Classification, tagging, project linking and status changes are system responsibilities.

## Large video files

For large source videos, prefer the native Yandex.Disk desktop/mobile upload route. Media Brain consumes the file after it appears in Inbox; Life OS does not need to proxy large binary uploads.
