# Persona: multi-model editorial council (2026-11-04)

## What is implemented

Persona Scenario Workspace now has TWO explicitly differentiated buttons:

- **AI council / Исследовать и создать 3 идеи через AI**: the server calls an actual research model with web search, an ideation model, and a separate reviewer model when configured. The UI shows provider, exact returned model, task, declared reasons for routing, sources, reported costs, and review concerns.
- **Собрать 3 шаблонные идеи**: existing deterministic, offline fallback. Never pretend it is Perplexity or an LLM.

This is an unapproved proposal only, not an author-approved script, real Instagram Insights analysis, or a finished Reel. The full filming, ASR, edit and QA gates remain unchanged.

The model registry is **task-specific**; no permanent "Claude = director" or "GPT = author" assignment. It uses declared task suitability + availability + cost tier and, after at least three author-labeled decisions per model/task, creator feedback. This is not an independently validated benchmark. The route and actual returned model are recorded on each run.

## Perplexity API version

Perplexity recommends **Agent API** (POST https://api.perplexity.ai/v1/agent), with web_search tool and different model families on one token. Legacy Sonar Chat Completions support ended 2026-09-27; use the Agent API for new work. See official docs:
- https://docs.perplexity.ai/docs/agent-api/quickstart
- https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview

No paid calls have been made by this implementation or by its unit tests. Mocked tests are not verification that an account has API access or a particular model ID is enabled.

## Configuration (Windows / local development)

Set the following **only on your server/process, never in client source or Git**. For a controlled local test, configure environment variables:

    PERSONA_AI_COUNCIL_ENABLED=true
    PERSONA_AI_COUNCIL_MAX_USD=0.20
    PERPLEXITY_API_KEY=<your private Perplexity API key>
    PERSONA_AI_COUNCIL_MODELS_JSON=[{"id":"research-gpt","provider":"perplexity_agent","model":"openai/gpt-5.6-sol","skills":{"research":3,"ideation":2,"review":2},"costTier":2},{"id":"creative-claude","provider":"perplexity_agent","model":"anthropic/<check-current-model-in-account>","skills":{"research":0,"ideation":3,"review":2},"costTier":2},{"id":"editor-gpt","provider":"perplexity_agent","model":"openai/gpt-5.6-sol","skills":{"research":0,"ideation":2,"review":3},"costTier":2}]

IMPORTANT: example model IDs must be checked against the live Perplexity model catalog; no model availability was assumed or tested. Replace the placeholder before trying a live run.

Optional local model (only on non-Vercel local dev):

    PERSONA_AI_COUNCIL_ALLOW_OLLAMA=true

Add an eligible registry entry for local Ollama, e.g. with model "qwen3:4b-instruct" and research:0. Ollama cannot be assigned live web research without a verified search tool. It may do ideation or critique without API billing.

## Protected hosted preview

Hosted preview requires a secret in the server environment:

    PERSONA_AI_COUNCIL_ACCESS_TOKEN=<random at least 24 characters>

Use that secret only in the "Защищённый тестовый доступ" field during the session; it is NOT stored in the Persona project. Never share it with screenshots, public logs or Git. Production API requests remain locked. A local localhost test may omit this token if none is configured.

The endpoint additionally requires:
- A same-origin request.
- Explicit user consent and confirmedSpend:true on the **actual button click**.
- PERSONA_AI_COUNCIL_ENABLED=true.
- A server-side model allowlist and provider credentials.
- A positive per-run stop threshold PERSONA_AI_COUNCIL_MAX_USD (maximum 3 USD).
- An in-process two-run-per-hour throttle (NOT durable across serverless instances).

**The server stop threshold is not a hard prepaid ceiling.** A completed paid call can exceed the threshold; the code then prevents later stages. Exact hard credit/spend controls should be set in the provider's billing project. Never treat estimated cost tiers as live prices.

No automatic network calls to models on page load. A GET only checks configuration, not live readiness. External LLM calls use capped output tokens and small web tool budgets.

## Evidence and safety

- Only URLs from actual Perplexity web_search result objects enter the research registry. They are **metadata_only**, never "I viewed the Reel" and never fake engagement measurements.
- The model's narrative might contain errors; a public source title/date is not evidence that its video was viewed or succeeded. Creator must evaluate claims before relying on them.
- The AI creator returns EXACTLY three distinct ideas with concrete conflicts, actions, ending, complexity, risks and source references. All remain unapproved and editable.
- Criticism is a separate model call with exact model provenance. The reviewer gives a proposed recommendation, not author approval. When different models are unavailable, do not call a single model independent.
- A user approving or rejecting a version saves a bounded author-feedback observation keyed to the AI model id and script revision; model routing may use it after three observations, clearly labeled as user feedback.
- Project storage is checked again after network completion. Concurrent project edits or a changed active project prevent overwriting the author's script.
- Never change a submitted user video, the approved edit plan, or distribution permissions. IMG_3971.MOV is only for color correction tests.

## Still missing / next priorities

1. Real credentialed Perplexity Agent API acceptance test in the user's environment, with an explicitly approved small test budget.
2. Durable, authenticated billing limits for multi-user production; the hosted preview token is an interim guard, not a production auth scheme.
3. Dynamic latency, cost and content-quality measurements across real reviewed attempts, not administrator-declared suitability.
4. Multiple independent ideation candidates, then cross-model arbitration, if the economics justify extra calls.
5. Full original-script generation and approved pre-edit planning from the selected AI idea, as distinct from the current deterministic author-editable starting skeleton.
6. Instagram creator analytics connector when legitimately available. No fabricated audience measurements.

## Verification

The automated tests mock Perplexity replies and assert no paid calls occur while disabled, origin/request guards, task routing, source provenance, independent critique, and no hidden author approval. Passing mocked tests does NOT establish access to paid models.
