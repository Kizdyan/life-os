# Life OS deployment

## Web preview

The current web app is a Vite SPA built from `apps/web`.

Vercel configuration lives in `/vercel.json` and uses:

- install: `npm install`
- build: `npm run web:build`
- output: `apps/web/dist`
- SPA rewrite to `index.html` for non-API routes

## Required browser-safe environment

Only publishable client values may use the `VITE_` prefix.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never expose Yandex OAuth access/refresh tokens, client secrets, server encryption keys, or deployment tokens as `VITE_*` variables.

## Media Brain server boundary

The browser calls `/api/media/*` only. Yandex OAuth and autonomous Media Brain runtime must execute server-side.

Interactive OAuth may use short-lived HttpOnly/Secure/SameSite cookies for PKCE session state, but autonomous polling requires a durable server-side secret store because background jobs cannot depend on a browser session.

Until that durable secret store is configured, the UI must report Media Brain as `not_configured` rather than pretend the autonomous connection is active.
