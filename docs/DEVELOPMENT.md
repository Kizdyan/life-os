# Local development

The verified project toolchain is **Node.js 22 LTS** with npm (Windows check: Node 22.23.4, npm 10.9.9).

From the repository root, install the exact locked dependency graph:

```powershell
npm ci --no-audit --no-fund
```

For first-time lockfile maintenance only, use `npm install --no-audit --no-fund`, review the resulting `package-lock.json`, then repeat `npm ci` before committing. CI workflows use the same `npm ci` command. The scheduled watchdog deliberately stays on `npm install`, because it checks out the separate `recovery/iphone-static-supabase` branch, which does not yet contain this lockfile.
