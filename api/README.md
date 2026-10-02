# Life OS API

Server-only functions for the public preview.

Current Media Brain routes live under `/api/media/*` and keep Yandex OAuth/session material out of browser JavaScript.

Validation:
- `npm run api:typecheck`
- `npm test`

Do not add browser-readable OAuth access tokens, long-lived credentials, or secret values to API responses, logs, source files, or `VITE_*` environment variables.
