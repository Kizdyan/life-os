import { describe, expect, it } from 'vitest';
import { budgetPolicy, reserveBudget } from './persona-cost';
import { RouteFailureError, runProviderRouter } from './persona-provider';

const config = (values: Record<string, string>) =>
  (key: string) => values[key];

describe('Persona V3 AI cost guard and provider resilience (offline fixtures only)', () => {
  it('defaults to ZERO paid calls on the existing configuration', async () => {
    const policy = budgetPolicy(config({}), 6000);
    expect(policy.callsPerDay).toBe(0);
    expect(policy).toMatchObject({ mode: 'ECONOMY', costMode: 'FREE_ONLY', callsPerDay: 0 });
    let reserved = 0;
    const result = await reserveBudget(policy, async () => {
      reserved++;
      return { allowed: true, mode: 'AI' };
    });
    expect(result.allowed).toBe(false);
    expect(reserved).toBe(0);
  });

  it('blocks zero-credits mode before any paid call', async () => {
    const policy = budgetPolicy(config({ PERSONA_V3_AI_CALLS_PER_DAY: '0' }), 5000);
    const reserve = async () => { throw new Error('must not contact quota backend'); };
    expect(policy).toMatchObject({ mode: 'ECONOMY', costMode: 'FREE_ONLY', callsPerDay: 0 });
    expect((await reserveBudget(policy, reserve)).allowed).toBe(false);
  });

  it('automatically selects ECONOMY when daily or monthly budget cannot cover a reservation', () => {
    expect(budgetPolicy(config({ PERSONA_V3_AI_DAILY_USD: '0' }), 6000).mode).toBe('ECONOMY');
    expect(budgetPolicy(config({ PERSONA_V3_AI_MONTHLY_USD: '0.00001' }), 6000).mode).toBe('ECONOMY');
  });

  it('reserves one atomic daily+monthly budget and records token estimates', async () => {
    const policy = budgetPolicy(config({ PERSONA_V3_AI_CALLS_PER_DAY: '2' }), 6000);
    const requests: unknown[] = [];
    const result = await reserveBudget(policy, async (args) => {
      requests.push(args);
      return { allowed: true, mode: 'AI', dailyCalls: 1 };
    }, Date.parse('2026-10-08T12:00:00Z'));
    expect(policy.costMode).toBe('PAID_OPTIONAL');
    expect(result).toEqual({ allowed: true, mode: 'AI', dailyCalls: 1 });
    expect(policy.estInputTokens).toBeGreaterThan(1000);
    expect(policy.estOutputTokens).toBe(2000);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ day: 'day:2026-10-08', month: 'month:2026-10' });
  });

  it('fails closed if the cost ledger is down', async () => {
    const policy = budgetPolicy(config({ PERSONA_V3_AI_CALLS_PER_DAY: '1' }), 1000);
    const result = await reserveBudget(policy, async () => { throw new Error('DB unavailable'); });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('budget_store_unavailable');
  });

  it('OpenAI 429 invokes the circuit breaker and NEVER retries the cheaper provider', async () => {
    const calls: string[] = []; let quota = 0;
    await expect(runProviderRouter(
      ['primary', 'cheap'],
      async () => true,
      async (model) => { calls.push(model); return { status: 429 }; },
      () => { quota++; },
    )).rejects.toMatchObject({ reason: 'QUOTA' });
    expect(calls).toEqual(['primary']);
    expect(quota).toBe(1);
  });

  it('provider timeout falls back only when an independent budget reservation is allowed', async () => {
    const calls: string[] = [], reservations: boolean[] = [];
    const value = await runProviderRouter(['primary','cheap'],
      async fallback => { reservations.push(fallback); return true; },
      async model => {
        calls.push(model);
        if (model === 'primary') throw new Error('mock timeout');
        return { status: 200, value: { candidates: [] } };
      });
    expect(value).toEqual({ candidates: [] });
    expect(calls).toEqual(['primary','cheap']);
    expect(reservations).toEqual([false,true]);
  });

  it('budget-exhausted fallback cannot make a second paid call', async () => {
    const calls: string[] = [];
    await expect(runProviderRouter(['primary','cheap'],
      async fallback => !fallback,
      async model => { calls.push(model); return { status: 500 }; },
    )).rejects.toMatchObject({ reason: 'ECONOMY' });
    expect(calls).toEqual(['primary']);
  });

  it('401/403 permission failures are scoped and do not trigger runaway retries', async () => {
    for (const status of [401,403]) {
      const calls: string[] = [];
      await expect(runProviderRouter(['primary','cheap'], async () => true,
        async model => { calls.push(model); return { status }; },
      )).rejects.toMatchObject({ reason: 'PERMISSION' });
      expect(calls).toEqual(['primary']);
    }
    expect(new RouteFailureError('OUTAGE').message).toBe('provider_route:OUTAGE');
  });
});
