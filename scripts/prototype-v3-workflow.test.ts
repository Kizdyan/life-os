import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-readiness.yml', 'utf8');
const executor = readFileSync('scripts/prototype-v3-authenticated-e2e.mjs', 'utf8');

describe('prototype v3 authenticated E2E workflow', () => {
  it('runs on pushes to the exact prototype branch', () => {
    expect(workflow).toContain('prototype/persona-quality-loop-v0');
    expect(workflow).toContain('supabase/functions/life-os-runtime-prototype-v3/**');
  });

  it('passes only the repository secret to the existing executor', () => {
    expect(workflow).toContain('PROTOTYPE_ACCESS_CODE: ${{ secrets.PROTOTYPE_ACCESS_CODE }}');
    expect(workflow).toContain('node scripts/prototype-v3-authenticated-e2e.mjs');
    expect(workflow).not.toMatch(/echo .*PROTOTYPE_ACCESS_CODE/);
  });

  it('pins the requested frontend and Edge runtime without production endpoints', () => {
    expect(workflow).toContain('PROTOTYPE_FRONTEND_URL: https://life-os-persona-prototype.onrender.com');
    expect(workflow).toContain('PROTOTYPE_EDGE_URL: https://zhehdbhpkcucgcjwuhxm.supabase.co/functions/v1/life-os-runtime-prototype-v3');
  });
  it('never performs a paid AI request in ordinary CI and never marks the free pass as full E2E', () => {
    expect(workflow).not.toContain('PROTOTYPE_PAID_E2E: 1');
    expect(executor).toContain("allowPaidAi:false");
    expect(executor).toContain("process.env.PROTOTYPE_PAID_E2E !== '1'");
    expect(executor).toContain('ZERO_CREDIT_E2E_PASS');
    expect(executor).toContain('PAID_SMOKE_SKIPPED');
    expect(executor).toContain('NOT_READY_FOR_PHYSICAL_ACCEPTANCE');
    expect(executor).toContain('forgedShot.status===409');
  });

});
