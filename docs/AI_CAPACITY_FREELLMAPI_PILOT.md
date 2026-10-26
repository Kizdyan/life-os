# FreeLLMAPI public-only local gateway pilot (NOT production)

This extends the existing AI Capacity PR #104. It does **not** install
FreeLLMAPI, make an agent autonomous, create a new router, connect a subscription,
or grant free usage. FreeLLMAPI itself is a community project; its advertised
multi-provider quota is **not** a verified entitlement of this account.

## What is implemented

- `api/_free-llmapi-gateway.ts`: a server-only, opt-in, loopback-only client
  for `GET /v1/models` and `POST /v1/chat/completions`.
- The completion function accepts only tasks explicitly classified `public`
  and an eligible decision returned by the **existing** `routeAgentTask`.
- An approved model ID, approved agent ID, explicit opt-in and a gateway key are
  mandatory for execution. Max response tokens and request time are bounded.
- No automatic retries, purchases, secret logging, upstream redirects, or
  changes to Codex/Claude CLI configuration.
- `api/_free-llmapi-gateway.test.ts`: synthetic mocked integration tests,
  including private-data blocking and existing routing eligibility.
- `tools/free-llmapi-local-probe.mjs`: a read-only model discovery probe,
  using only Node.js. It neither generates a completion nor runs installation.

**The adapter is not wired to the production task queue.** A calibrated model
benchmark and an authorized local runtime are required before that step.

## Read-only local check (only on a trusted computer)

Prerequisites: an already-running, verified local FreeLLMAPI gateway, a
server-side unified gateway key, and Node.js 22+. Do not place keys in the repo.

In PowerShell, in this repository:

```powershell
$env:FREELLMAPI_ENDPOINT = 'http://127.0.0.1:3001'
$env:FREELLMAPI_API_KEY = '<local unified gateway key>'
node tools/free-llmapi-local-probe.mjs
Remove-Item Env:FREELLMAPI_API_KEY
```

If not installed or no key is configured, expect BLOCKED rather than guessing
that capacity exists. The probe lists up to 30 model IDs and reports availability;
it does not send a prompt, benchmark quality or establish quotas.

Tests after checkout:

```powershell
npm test -- api/_free-llmapi-gateway.test.ts
npm run api:typecheck
```

## Future approval gates

1. Review the exact pinned FreeLLMAPI source, its provider key handling,
   signed catalog updates, network destinations, Terms and licensing.
2. Install it only in an isolated local development environment using an
   explicitly approved method. No global hooks/config changes.
3. Verify an actual reachable instance and approved public/synthetic test model.
4. Compare lossless-compression preview against source and measure *real*
   token usage, elapsed time, errors, fidelity, and provider attribution.
   `standard` and `aggressive` modes require separate fidelity tests.
5. Calibrate model-specific capability scores before enabling routing; the
   existing router must reject unknown or low-quality candidates.
6. Only then consider safe task-queue integration. Do not send private
   Life OS, finance, health, family, unpublished media or credentials to a
   free-tier aggregation provider.

## Honest status

- CODE: added in isolated experimental branch.
- MOCKED INTEGRATION TESTS: authored, pending actual CI/runner confirmation.
- LOCAL GATEWAY AVAILABILITY: UNKNOWN until checked on the owner's machine.
- PROVIDER KEYS / FREE QUOTA: UNKNOWN, not auto-provisioned.
- CONSUMER SUBSCRIPTIONS AS API CAPACITY: NOT ASSUMED.
- ACTUAL COMPLETIONS: NOT RUN.
- TOKEN SAVINGS: NOT MEASURED.
- PRODUCTION: UNCHANGED.
