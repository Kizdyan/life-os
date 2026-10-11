# Life OS API

Server-only functions for the public preview.

Current Media Brain routes live under `/api/media/*` and keep Yandex OAuth/session material out of browser JavaScript.

Validation:
- `npm run api:typecheck`
- `npm run api:smoke` (compiles production routes and loads their JavaScript with Node ESM)
- `npm test`

API relative imports must use the emitted `.js` extension. The API TypeScript configuration uses NodeNext resolution so deployment-incompatible imports fail typechecking. The smoke check invokes each route without credentials and verifies its safe unconfigured response.

Do not add browser-readable OAuth access tokens, long-lived credentials, or secret values to API responses, logs, source files, or `VITE_*` environment variables.
