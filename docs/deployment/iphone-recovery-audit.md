# iPhone recovery deployment audit

Source checkpoint: `feature/persona-content-factory` @ `a3521b75f5dae304fa96c2636ab7c8acc196501a`.

## Proven blocker

The Vite frontend builds successfully, then Vercel rejects the deployment at `patchBuild` with `exceeded_serverless_functions_per_deployment`: Hobby allows at most 12 Serverless Functions.

The repository currently contains 33 TypeScript files below `api/` (root helpers/tests + media + runtime). Under Vercel's `/api` convention these are function candidates, including helper/test files that are not user-facing routes.

## User-facing Vercel API routes

| Route family | Current owner | Used by web | Recovery decision |
| --- | --- | --- | --- |
| `/api/runtime/session` | Vercel proxy -> Supabase Edge | yes | remove from static iPhone deployment; browser talks to existing Edge runtime |
| `/api/runtime/sync` | Vercel proxy -> Supabase Edge | yes | remove from static iPhone deployment; browser talks to existing Edge runtime |
| `/api/media/status` -> `persona-runtime` | Vercel | yes | not required for core Life OS runtime; Persona UI must degrade safely when absent |
| `/api/media/transcribe` -> `persona` | Vercel | conditional | keep out of static iPhone frontend; server action remains separate until migrated deliberately |
| `/api/persona` -> `persona-runtime` | Vercel | legacy/conditional | keep out of static iPhone frontend |
| `/api/media/memory` | Vercel | Persona server workflow | keep out of static iPhone frontend |
| `/api/media/yandex/connect/start` | Vercel | optional Media Brain setup | keep out of static iPhone frontend |
| `/api/media/yandex/connect/callback` | Vercel | optional Media Brain setup | keep out of static iPhone frontend |
| `/api/media/yandex/disconnect` | Vercel | optional Media Brain setup | keep out of static iPhone frontend |

## Existing canonical backend

Supabase project `zhehdbhpkcucgcjwuhxm` already has active Edge Function `life-os-runtime`.

It implements `login`, `status`, `sync`, and health. Privileged database calls use `SUPABASE_SERVICE_ROLE_KEY` only inside Edge Runtime. The browser does not need and must never receive that key.

Current Vercel runtime routes only wrap this Edge function to store its opaque 30-day session token in an HttpOnly cookie and proxy sync requests.

## Minimal recovery architecture

- Vercel iPhone preview: static Vite/PWA only, zero Vercel Serverless Functions.
- Supabase Edge `life-os-runtime`: canonical runtime/session/sync/database gateway.
- Browser: stores only the opaque Life OS Edge session token; no service-role/secret credentials.
- Edge function: add explicit CORS/OPTIONS support so the static Vercel origin can call it directly.
- Persona/Media screen remains loadable. AI/Yandex server actions are not moved into the browser and are reported unavailable unless a separate server endpoint is configured.

This is intentionally a recovery architecture, not a new parallel backend.