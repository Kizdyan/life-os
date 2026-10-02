# Media Brain server boundary

The browser talks only to same-origin `/api/media/*` functions. Yandex OAuth access tokens are never returned to browser JavaScript.

Interactive connection:
1. `POST /api/media/yandex/connect/start`
2. browser redirects to Yandex OAuth
3. `GET /api/media/yandex/connect/callback`
4. server stores a sealed `Secure; HttpOnly; SameSite=Lax` token cookie

Status distinguishes:
- `connected`: the current browser session can use Yandex
- `autonomousReady`: a durable server-only token exists for background polling

A browser session must never be treated as proof that autonomous background processing is available.
