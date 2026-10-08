import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entry = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const gates = readFileSync(new URL('./quality-gates.ts', import.meta.url), 'utf8');

describe('prototype v3 server-side quality-gate wiring', () => {
  it('requires a server-approved candidate rather than trusting the Judge response', () => {
    expect(entry).toContain('import { approvePersonaCandidate, validatePersonaShootingBrief }');
    expect(entry).toContain('approvePersonaCandidate((judged as any).recommendation)');
    expect(entry).toContain('if (!evaluated.approved || !evaluated.candidate)');
    expect(entry).toContain('degraded: true');
  });

  it('enforces score, evidence confidence, production time and duration in a tested module', () => {
    expect(gates).toContain("bounded(verdict.score, 80, 100)");
    expect(gates).toContain("bounded(candidate.estimatedMinutes, 5, 15)");
    expect(gates).toContain("bounded(candidate.estimatedDurationSeconds, 15, 30)");
    expect(gates).toContain('evidenceConfidenceCap(evidence.length)');
    expect(entry).toContain('approvePersonaCandidate(idea)');
  });

  it('refuses invalid shooting briefs and does not emit partial instructions', () => {
    expect(entry).toContain('validatePersonaShootingBrief(brief)');
    expect(entry).toContain('invalid_shooting_brief:');
    expect(entry).toContain('shooting_brief_quality_failed');
  });
});
