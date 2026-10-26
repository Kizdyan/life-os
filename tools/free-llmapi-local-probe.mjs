#!/usr/bin/env node
/**
 * Read-only FreeLLMAPI local discovery. No install, no cloud call by default.
 * Requires an already-running trusted local gateway and a server-only key.
 *
 * PowerShell example:
 *   $env:FREELLMAPI_ENDPOINT = 'http://127.0.0.1:3001'
 *   $env:FREELLMAPI_API_KEY = '<unified local gateway key>'
 *   node tools/free-llmapi-local-probe.mjs
 *
 * This script does NOT route tasks or change Codex/Claude configurations.
 */
const endpoint = process.env.FREELLMAPI_ENDPOINT || "http://127.0.0.1:3001";
const apiKey = process.env.FREELLMAPI_API_KEY || "";
let url;
try { url = new URL(endpoint); } catch {
  process.stderr.write("BLOCKED: invalid local gateway URL\n");
  process.exit(2);
}
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.username || url.password || url.search || url.hash ||
  (url.pathname !== "/" && url.pathname !== "")
) {
  process.stderr.write("BLOCKED: only a local HTTP loopback gateway is allowed\n");
  process.exit(2);
}
if (!apiKey.trim()) {
  process.stderr.write("BLOCKED: FREELLMAPI_API_KEY not configured (no credential was generated)\n");
  process.exit(2);
}
try {
  const response = await fetch(new URL("/v1/models", url.origin), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.text();
  if (raw.length > 262144) throw new Error("Response too large");
  const data = JSON.parse(raw);
  if (!Array.isArray(data?.data)) throw new Error("Invalid models shape");
  const models = data.data
    .filter(item => typeof item?.id === "string")
    .map(item => item.id);
  process.stdout.write(JSON.stringify({
    gateway: "reachable",
    origin: url.origin,
    discoveredModelCount: models.length,
    modelIds: models.slice(0, 30),
    access: "DISCOVERY_ONLY",
    publicTaskValidated: false,
    externalProviderCreditsVerified: false,
    savingsMeasured: false,
  }, null, 2) + "\n");
} catch (err) {
  process.stderr.write(`BLOCKED: local gateway unavailable or incompatible (${err instanceof Error ? err.message : "unknown error"})\n`);
  process.exitCode = 1;
}
