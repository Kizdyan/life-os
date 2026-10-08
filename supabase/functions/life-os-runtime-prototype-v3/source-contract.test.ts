import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('./persona-store.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../../apps/web/src/PersonaFactory.tsx', import.meta.url), 'utf8');

describe('prototype v3 provider and secret isolation', () => {
  it('reads only dedicated prototype AI credentials and never the production key', () => {
    expect(source).toContain('Deno.env.get("PERSONA_PROTOTYPE_OPENAI_API_KEY")');
    expect(source).not.toMatch(/Deno\.env\.get\(["']OPENAI_API_KEY["']\)/);
  });
  it('cannot spend AI credits automatically: both explicit caller permission and operator enablement are required', () => {
    expect(source).toContain('payload.allowPaidAi !== true');
    expect(source).toContain('Deno.env.get("PERSONA_V3_PAID_AI_ENABLED") !== "true"');
    expect(source).toContain('return safeRecommendation("paid_ai_explicitly_disabled")');
  });

  it('uses atomic budget reservations, provider cooldown and no raw error-body logs', () => {
    expect(source).toContain('reserveBudget(policy, reserveServerAiCall)');
    expect(source).toContain('quotaCooldownUntil');
    expect(source).toContain('AbortSignal.timeout(20_000)');
    expect(source).not.toContain('console.error("openai response failed"');
    expect(source).not.toContain('response.text()');
    expect(store).toContain('/rest/v1/rpc/persona_v3_budget_reserve');
    expect(store).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(store).not.toContain('catch { snapshot = emptySnapshot(); }');
  });
  it('blocks stale approvals and keeps the browser explicitly FREE_ONLY', () => {
    expect(source).toContain('isActionableApproval(approved)');
    expect(client).toContain("costMode: 'FREE_ONLY'");
    expect(client).toContain('allowPaidAi: false');
  });
});
