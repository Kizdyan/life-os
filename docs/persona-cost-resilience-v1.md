# Persona Cost & Resilience V1 — prototype PR #87

## Scope, safety and release policy
- Only `prototype/persona-quality-loop-v0` and the **prototype** Edge function `life-os-runtime-prototype-v3`.
- No change to `main`, production Edge function `life-os-runtime` or production Render service.
- New isolated Supabase tables are `persona_v3_brain` and `persona_v3_budget_usage` with RLS and no anon/authenticated access. Existing tables are not altered.
- Mocked/offline tests **never** count as paid live research acceptance.
- `READY_FOR_PHYSICAL_ACCEPTANCE` remains blocked until a separately authorized, real paid research+shooting E2E passes.

## Audit (before sprint)
The old `recommend` called paid fresh web research, two critics and Judge on each page entry. HTTP 429 bubbled out as 503; the old `shooting` always called paid AI, so even a previously approved idea was blocked. Browser-local persisted ideas were not allowed to unlock Take without a fresh approval, correctly preventing action on unevidenced fallback but also blocking reuse.

## Architecture and role split
| Responsibility | Required paid AI? | Owner / storage |
|---|---|---|
| Frontend/login/auth/status, history, reserve-topic display | Never | Existing runtime + device |
| Market evidence freshness/URL schema checks, trust caps | Never | `quality-gates.ts` |
| Shared Brain (evidence, trends, editorial verdicts, signed approvals, shooting briefs) | Never to read or reuse | Service-only Supabase `persona_v3_brain` + versioned localStorage mirror |
| Signed idea approval HMAC verification and 7-day source TTL | Never | Prototype Edge runtime |
| Approved idea → shooting brief, cache replay | Never | `persona-brain.ts` deterministic 15–30 sec iPhone brief |
| Fresh web research | Optional; only when budget permits and cache misses | One combined AI+self-critique request |
| Primary model, cheaper model fallback | Optional | `persona-provider.ts`, budget before every attempt |
| Cost accounting | Never | Atomic DB RPC `persona_v3_budget_reserve` |
| Real paid E2E | Rare explicit opt-in | `PROTOTYPE_PAID_E2E=1` script gate |

## Provider-routing order
1. Authenticated request, validate signed cached approval (server Shared Brain, then client mirror).
2. **CACHED** with fresh (≤7 days) evidence → no AI; if old but signed approval ≤30 days → **STALE** continuation only, visibly distinct, never described as fresh market research.
3. If no cache and `allowPaidAi:false` → return HTTP 200 **ECONOMY**, no actionable recommendation and zero provider requests.
4. If budget allows, atomic reserve and single paid research/self-critique request using `PERSONA_V3_AI_PRIMARY_MODEL` (default `gpt-4.1-mini`).
5. Timeout / suitable 4xx model mismatch / provider 5xx → budget-reserved cheaper model `PERSONA_V3_AI_CHEAP_MODEL` (default `gpt-4o-mini`). At most two attempts.
6. HTTP 429/credit exhaustion → stop immediately, enter short worker-local cooldown and safe HTTP 200 economy response; no retries and no fake recommendation.
7. Unknown provider/data/DB failure → fail closed: history remains available, unverified fallback is not actionable.

## Trust contract
- AI approval is **not** proof that external claims are objectively true. Market evidence gets structural URL/date validation and freshness checks; signing means it cleared server-side editorial checks.
- The server HMAC is derived from an existing server-only secret. Browser cannot mint or alter an approval; `shooting` independently verifies proof and matches idea ID/title.
- A signed approval lasts ≤30 days. Evidence freshness is ≤7 days. Stale signed approval is **only** for continuing an already approved shoot, not a new market recommendation.
- On quota exhaustion without any signed idea, the user can read history and unverified topics, but Take/Create remain unavailable.
- Cached briefs are validated on read, and the deterministic generator validates its result before returning.

## Cost guard and tunables
Default: **1 paid attempt/day**, approximate **USD $0.03/day** and **$0.30/month**. These values are reserves, not invoice totals. `PERSONA_V3_AI_CALLS_PER_DAY=0` disables paid AI entirely. Other tunables are `PERSONA_V3_AI_DAILY_USD`, `PERSONA_V3_AI_MONTHLY_USD`, `PERSONA_V3_INPUT_USD_PER_M`, `PERSONA_V3_OUTPUT_USD_PER_M`, and primary/cheap model names. The atomic DB RPC serializes concurrent budget reservations and tracks estimated input/output tokens plus reserved USD across Edge isolates and regions. Database outage → deny new paid calls, not unlimited fallback.

## QA / Critic / regression gates
- Pure tests: cached/stale and forged HMAC proofs; approval expiry; no AI deterministic brief; evidence caps; denied budget; zero credits; 429 no retry; timeout cheaper fallback; permission failure; budget store outage.
- Real zero-credit HTTP smoke: exact Render head + V3 bundle target, login, authenticated status, 200 economy recommendation, 409 forged shooting, read-only budget ledger status. Outputs `ZERO_CREDIT_E2E_PASS` **not** `E2E_PASS`.
- Real paid research is disabled in ordinary push/PR CI. Only `PROTOTYPE_PAID_E2E=1` explicitly enables that path, and it may fail on a provider quota error without breaking normal CI.
- Critic focus: replays of unsigned localStorage, renamed/reused ideas, stale evidence mislabeled fresh, false-positive READY status, unbounded AI attempts, provider response text leaking credentials, missing budget reservation.

## Explicit limitations / next safe follow-up
- The V1 browser mirror is durable on a **single device**; cross-device reuse works only after at least one genuine server-signed approval enters the prototype server Shared Brain.
- First-ever approval still requires working research; zero credits cannot create reliable new market evidence out of nothing.
- Manual/rare paid full E2E is not reported as passed until its **real** GitHub run has all steps including a validated shooting brief.
- Do not alter or clear production resources or rename Persona 3.
