# Harvey × Life OS — staged adoption

**Source/reference:** https://github.com/ethanplusai/harvey
(CSV contract observed from `harvey/export.py` on 2026-10-26; repository
commit `8023a9495eb46d644f03da8c8f4d2b9e41e5836e`).
Harvey is MIT-licensed. This TypeScript bridge is an independent implementation
of the publicly documented CSV shape, not a copied Python runtime.

## What is implemented in this branch

- `previewHarveyProspectsCsv()` parses the actual Harvey CSV header contract
  (`company_name`, `website`, `status`, etc.), bounds input, excludes
  opt-outs and blocked domains, deduplicates domains, ranks by Harvey's
  *unverified* score, and creates native `LifeItem` review tasks.
- The existing `SupabaseLifeItemRepository` can persist only those review
  items into `life_items`, with conflict-ignore to preserve user changes.
  Existing Supabase RLS remains in force. No new database is created.
- The existing offline `localRuntime` can persist review tasks idempotently
  in its existing storage.
- The Today screen displays a `HarveySalesCard`: upload CSV, review up to ten
  companies, click explicitly to save review tasks. They appear under Today.
- No SMTP, OAuth, sending, replies, enrichment, browser automation, or model
  API is used. No emails or contact-person data enter Life OS tasks.
- The UI is **review-only**, not a live Harvey agent.

## Safe manual smoke test

1. Run the existing **experimental** web preview/checkout, not production.
2. On the Today screen, choose `examples/harvey-synthetic-sample.csv`.
3. Two fictional companies should appear; an opted-out sample is excluded.
4. Click **Добавить в задачи на проверку**.
5. Verify exactly two native Life OS tasks appear in Today.
6. Import the same CSV again. There should be no duplicate tasks.
7. Check the browser network panel: no email, outreach, or third-party lead
   service requests. Supabase may receive company-level task titles if enabled.

Unit tests added for import safety, CSV parsing, URL restrictions, domain
suppression, deduplication, native/offline persistence, and denied writes.

**Do not claim PASS until a runner actually executes the tests.** At time of
writing GitHub Actions in life-os have an account-side billing/spending
blocker. Local commands for the operator's checked-out branch:

```bash
npm test -- packages/core/src/harvey-prospect-review.test.ts packages/core/src/harvey-persistence.test.ts apps/web/src/harvey-local.test.ts
npm run typecheck
npm run web:build
```

## Next gates — no parallel framework

1. **Upstream Harvey**: review a pinned, isolated source checkout; its
   subscription runtime is not guaranteed on Windows Codex. Validate Python
   3.11+, dependencies, provider isolation, filesystem/network and real
   `harvey export` shape before installation. Do not blindly install hooks.
2. **Dry-run discovery**: research up to 10 publicly listed businesses for one
   user-approved B2B offer, evaluate evidence and false positives. The exported
   CSV remains on the owner's device until explicitly imported.
3. **Life OS integration**: after a true user review, optionally add a
   provenance-aware lead opportunity record in existing data architecture;
   avoid copying personal contact info or adding a shadow CRM.
4. **Harvey engineering extraction**: adapt tested concepts (deterministic
   heartbeat decision, budget gate, persisted idempotent claims, quarantine
   uncertain actions, approval gates and targeted skill loading) to existing
   `MediaRuntime`, `AutonomyEngine`, `Outbox` and `AgentCapabilityRouter`.
   Do not duplicate them.
5. **Outreach**: never send prospect emails by default. A verified legal basis,
   separate authorized mailbox, sender approval, suppression tracking,
   deliverability and explicit action-level permission are hard gates.

Do not send family, health, finance, unpublished media, private research, API
tokens, or other sensitive Life OS data to a third-party sales model.
