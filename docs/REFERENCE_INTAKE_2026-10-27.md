# Reference intake — 27 October 2026
Four user-supplied MP4s and six Instagram slides. Originals stay in the ChatGPT conversation; **not copied to GitHub**. SHA-256 hashes identify inspected copies, but paths are not public. No live bank account, CRM, social account, hardware model or external SaaS was changed.

| Reference | SHA-256 (uploaded video) | Intended Life OS/Persona/AI Capacity use | Current gate |
|---|---|---|---|
| Nimble Web Data public-web extraction (46.4s) | `0911b8dd540d8792c1008ba3826faf94fcddf29895f6ebf5a88fe85b96a0df9c` | Research sources, public company listings, structured metadata with citations | Research only; third-party access unconnected |
| AirLLM low VRAM inference (42.8s) | `732c355d762206bfc1d9b0a5d7c870e208cac81bd7cc3832197db27147f3cdc2` | Benchmark local alternatives after verifying disk/RAM/GPU and latency | Not installed; hardware not measured |
| Revius planned spend demonstration (52.1s) | `0f5d85e3334599951a750e47472a0e022e32dfe1677d27d4daacd4c67b550c9b` | Offline planned expense/income and near-future balance warnings | `cashflow-forecast.ts` added, UI/data persistence not connected |
| Claude montage before/after demonstration (34.0s) | `0b62899b3fb6378e89a194ec928f6bb50f5a07061e0f0fda5401eb77c2cbe5cd` | Persona graded lighting, selective background, typography, edited/unedited comparison | Existing `capcut-work-package.ts` is the integration target; render pending |
| Six courage carousel screenshots | `IMG_7814.png`–`IMG_7819.png` (conversation files) | Voluntary reversible initiative experiments; 7-slide format as inspiration | Existing `behavior-experiment.ts`; no automatic self-diagnosis or posting |

## Fact checks
- The video refers to **Nimble Web Data**, *not* the unrelated Nimble CRM. https://llms.nimbleway.com/mcp-browser-agents-spec-for-ai-teams and https://www.nimbleway.com/mcp . Any research connector must obtain authorized credentials, observe website terms, avoid harvesting personal contact details and never spam.
- AirLLM project: https://github.com/lyogavin/airllm . Low VRAM **does not guarantee** low host memory/disk use, fast token generation or compatible hardware. Do a measured local trial on non-sensitive benchmark data before adoption.
- Revius comparison: https://apps.apple.com/ru/app/revius-%D1%83%D1%87%D0%B5%D1%82-%D1%80%D0%B0%D1%81%D1%85%D0%BE%D0%B4%D0%BE%D0%B2/id6795912129 . We adopt functional requirements, not copyrighted assets/UI.
- 'Stanford 50%' in the quote carousel is overstated if interpreted as universal acceptance probability. Flynn & Lake (2008) report underestimation in specific *requests for help*, not predicted success in every context: https://pubmed.ncbi.nlm.nih.gov/18605856/ .
- Inspirational quotes are **creative content**, not clinical or predictive claims.

## Current safe implementation
`packages/core/src/cashflow-forecast.ts` provides pure integer-kopeck simulation of one-time, weekly and monthly projected cash flows. Its output is labelled `simulationOnly: true` and identifies a possible shortfall even if an incoming payment is due later the same day. No financial transaction is performed or inferred. Smoke tests: `node --experimental-strip-types --test scripts/cashflow-forecast.smoke.test.mjs`. On isolated source in this session: 10/10 PASS + TypeScript check PASS. Full-repo CI is **not verified**.

**Next implementation gates:**
1. Finance: typed adapter to real *user-confirmed* plan events, UI, audit and undo. No automatic bank import.
2. Nimble: authorize MCP in supported host, test *one public page*, verify attribution, limits and costs; no external personal contact extraction.
3. AirLLM: inspect local equipment/OS/available RAM/disk, compare to existing local Qwen on measured latency and output quality. No auto-install.
4. Persona: user-owned source MP4 → existing CapCut work package → real export → QA incl. unaltered facial identity, color, audio, captions, rights → human-approved draft. No automatic publication.
5. Courage carousel: prepare non-copied copy with citations; a small reversible action experiment only with user choice. Never infer personality from engagement.
