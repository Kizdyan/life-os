# Phone preview verification

A preview is not considered ready until all checks below pass on the deployed URL.

1. The root page loads without JavaScript errors.
2. Reloading `/` and a client-side route returns the SPA instead of 404.
3. Today renders even when Media Brain server endpoints are not configured.
4. Media Brain reports a truthful `not_configured`/disconnected state instead of failing the page.
5. No Yandex OAuth secret, refresh token, access token, Vercel token, or server encryption key is present in browser source or localStorage.
6. Offline shell/service worker still installs where supported.
7. iPhone safe-area layout does not hide bottom navigation.
8. Erika sheet opens, accepts text, and closes without horizontal overflow.
9. Existing Supabase-backed Today functions remain gated by publishable client credentials only.
10. Public publishing stays approval-gated.
