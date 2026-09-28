# Yandex.Disk for Media Brain

Yandex.Disk is the primary media storage provider for Kostya's personal Media Brain.

## Runtime model

The app uses the official Yandex OAuth authorization-code flow. PKCE is supported by the core helper and should be enabled for the production web/mobile flow.

The OAuth access token must remain server-side. Do not store it in browser code, source control, generated media packages, logs, or user-visible diagnostics.

Default media root:

`/Apps/Kostya Media Brain`

Bootstrap creates only:
- Inbox
- References
- Projects

Everything else is metadata/status.

## OAuth

Core helpers:
- `buildYandexAuthorizationUrl`
- `createPkceChallenge`
- `assertYandexOAuthState`
- `exchangeYandexAuthorizationCode`

Recommended Disk permissions:
- `cloud_api:disk.read`
- `cloud_api:disk.write`

The app registration itself is still a one-time manual Yandex-side step because the account owner must explicitly authorize access.

## Ingestion

The orchestrator watches both:
- `Inbox` for own/raw materials
- `References` for intentional inspiration

Inbox assets receive the personal content-production chain:
`classify -> analyze -> draft -> DiveM review -> prepare edit -> await review`

Reference assets receive a learning-only chain:
`classify -> analyze -> learn`

The worker enforces dependency order, retries transient failures with exponential backoff, and stops at approval instead of publishing by itself.

## Safety

- Ingestion is idempotent using provider/path/hash.
- Originals are not destructively moved or deleted by ingestion.
- Archive is copy-first and non-destructive in v1.
- Public publishing remains approval-gated.
- Any future deletion requires explicit approval plus Observer verification.

## Large video files

Large originals should normally be uploaded with the native Yandex.Disk client or mobile app. Media Brain consumes them once they appear in Inbox; Life OS does not need to proxy large binary uploads.
