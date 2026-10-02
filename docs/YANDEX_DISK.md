# Yandex.Disk for Media Brain

Yandex.Disk is the primary media storage provider for Kostya's personal Media Brain.

## Runtime model

The app uses the official Yandex OAuth authorization-code flow with PKCE.

The OAuth access token must remain server-side. Do not store it in browser code, source control, generated media packages, logs, or user-visible diagnostics.

Default media root:

`/Apps/Kostya Media Brain`

Bootstrap creates only:
- Inbox
- References
- Projects

Everything else is metadata/status.

## Vercel server endpoints

The same-origin server boundary is:
- `GET /api/media/status`
- `POST /api/media/yandex/connect/start`
- `GET /api/media/yandex/connect/callback`
- `POST /api/media/yandex/disconnect`

Interactive OAuth state and access tokens are sealed with AES-GCM in `Secure; HttpOnly; SameSite=Lax` cookies. Browser JavaScript never receives the access token.

Required server-only environment values for interactive OAuth:
- `YANDEX_CLIENT_ID`
- `MEDIA_COOKIE_SECRET` (at least 24 characters)

Optional:
- `YANDEX_CLIENT_SECRET`
- `YANDEX_REDIRECT_URI` (otherwise the callback is derived from the current deployment origin)
- `YANDEX_SCOPES` (space/comma separated)

Recommended Disk permissions:
- `cloud_api:disk.read`
- `cloud_api:disk.write`

### Autonomous background mode

An encrypted browser cookie is sufficient for an interactive session but **not** for a background worker, because serverless jobs cannot depend on an open browser session.

`YANDEX_DISK_OAUTH_TOKEN` is therefore the current explicit durable server-secret boundary for autonomous background polling. The status API exposes `autonomousReady` separately from `connected`, so the UI never claims background autonomy merely because a browser OAuth session exists.

A future durable secret backend may replace the environment-secret implementation without changing the Media Brain core contracts.

The app registration and first account authorization remain one-time manual Yandex-side actions because the account owner must explicitly grant access.

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
- OAuth failure clears transient session material instead of leaving stale tokens around.

## Large video files

Large originals should normally be uploaded with the native Yandex.Disk client or mobile app. Media Brain consumes them once they appear in Inbox; Life OS does not need to proxy large binary uploads.
