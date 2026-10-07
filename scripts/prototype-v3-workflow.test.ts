import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-readiness.yml', 'utf8');

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
});
