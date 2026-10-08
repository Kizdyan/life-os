import { describe, expect, it } from 'vitest';
import {
  PERSONA_SHARED_BRAIN_KEY, PERSONA_EVIDENCE_TTL_MS,
  brainForRuntime, entryFreshness, readSharedBrain, rememberApprovedBrain,
  rememberShootingBrain, freshnessLabel,
} from './personaSharedBrain';

const now = Date.parse('2026-10-08T12:00:00Z');
function memory() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}
const idea = {
  id: 'verified-one', title: 'Утверждённая сцена', angle: 'Личная история',
  format: 'reel' as const, score: 90, confidence: 85,
  hook: 'Первый кадр', script: 'Монолог', soloPlan: 'Один дубль',
  estimatedMinutes: 8, estimatedDurationSeconds: 22,
  marketEvidence: [{ source: 'A', finding: 'B',
    url: 'https://www.youtube.com/watch?v=abcdefghi12', asOf: '2026-10-07' }],
  qualityVerdict: { verdict: 'APPROVE' as const, score: 91, summary: 'OK', risks: [] },
};
const signed = {
  recommendation: idea,
  approvalProof: 'fixture-' + 'a'.repeat(120),
  approvedAt: new Date(now).toISOString(),
  evidenceCheckedAt: '2026-10-07T00:00:00.000Z',
};

describe('Persona Shared Brain durable browser adapter (offline)', () => {
  it('persists approved evidence, trends, judge outcome and shooting briefs across reload', () => {
    const storage = memory();
    expect(rememberApprovedBrain(storage, signed, now)).toBe(true);
    const reloaded = readSharedBrain(storage);
    expect(reloaded.entries[0].idea.id).toBe('verified-one');
    expect(reloaded.entries[0].marketEvidence).toHaveLength(1);
    expect(reloaded.entries[0].criticJudge?.verdict).toBe('APPROVE');
    expect(brainForRuntime(storage, now).entries).toHaveLength(1);
    const brief = { title: 'X', orientation: 'vertical' as const, resolution: '4k' as const,
      fps: 30 as const, audio: 'A', lighting: 'B', background: 'C', references: [], shots: [] };
    rememberShootingBrain(storage, idea.id, brief);
    expect(readSharedBrain(storage).entries[0].shootingBrief).toEqual(brief);
    expect(storage.getItem(PERSONA_SHARED_BRAIN_KEY)).not.toBeNull();
  });

  it('labels cached, stale and unverified distinctly and refuses unsigned cache entries', () => {
    const storage = memory();
    expect(rememberApprovedBrain(storage, { ...signed, approvalProof: '' }, now)).toBe(false);
    expect(brainForRuntime(storage, now).entries).toHaveLength(0);
    rememberApprovedBrain(storage, signed, now);
    const entry = readSharedBrain(storage).entries[0];
    expect(entryFreshness(entry, now)).toBe('cached');
    expect(entryFreshness(entry, now + PERSONA_EVIDENCE_TTL_MS + 86_400_000)).toBe('stale');
    expect(entryFreshness(entry, now + 100 * 86_400_000)).toBe('unverified');
    expect(freshnessLabel('cached')).toContain('КЭШ');
    expect(freshnessLabel('stale')).toContain('УСТАРЕВШИЕ');
    expect(freshnessLabel('unverified')).toContain('БЕЗ РЫНОЧНОЙ');
  });

  it('recovers safely from malformed local JSON without making it actionable', () => {
    const storage = memory();
    storage.setItem(PERSONA_SHARED_BRAIN_KEY, '{not json');
    expect(readSharedBrain(storage)).toEqual({ schema: 1, entries: [] });
    expect(brainForRuntime(storage).entries).toHaveLength(0);
  });
});
