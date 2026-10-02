# Deployment gates

A deployment is allowed only after:

- `npm test` passes
- `npm run typecheck` passes
- `npm run web:build` passes
- `apps/web/dist/index.html` exists
- no server secrets are exposed through `VITE_*`
- Media Brain can render when its backend is unavailable

A production promotion additionally requires a verified preview and no unresolved critical runtime errors.
