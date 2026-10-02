# Deployment environment boundary

## Browser-safe

Only these values may be exposed to the Vite client:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Server-only

These must never be prefixed with `VITE_` or serialized into client bundles:

- `YANDEX_CLIENT_ID`
- `YANDEX_CLIENT_SECRET`
- `YANDEX_REDIRECT_URI`
- `YANDEX_DISK_OAUTH_TOKEN`
- `YANDEX_DISK_REFRESH_TOKEN`
- `MEDIA_SECRET_STORE_KEY`
- `VERCEL_TOKEN`

The live Media Brain worker may start only when its server-side secret store and required Yandex credentials are present.
