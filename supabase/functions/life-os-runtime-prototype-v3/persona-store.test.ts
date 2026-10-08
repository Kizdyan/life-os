import { describe, expect, it } from 'vitest';
import { artifactFreshness, mutateServerBrain, normalizeArtifacts, parseBrainSnapshot } from './persona-store';

describe('Persona durable Shared Brain artifact freshness', () => {
  const now = Date.parse('2026-10-09T12:00:00.000Z');

  it('labels fresh, cached, stale and unverified artifacts from durable timestamps', () => {
    expect(artifactFreshness('2026-10-09T11:58:00.000Z', '2026-10-09T11:57:00.000Z', now)).toBe('fresh');
    expect(artifactFreshness('2026-10-09T11:58:00.000Z', '2026-10-03T00:00:00.000Z', now)).toBe('cached');
    expect(artifactFreshness('2026-10-08T12:00:00.000Z', '2026-10-08T00:00:00.000Z', now)).toBe('cached');
    expect(artifactFreshness('2026-10-01T12:00:00.000Z', '2026-10-01T00:00:00.000Z', now)).toBe('stale');
    expect(artifactFreshness('', '', now)).toBe('unverified');
  });

  it('rejects a future schema instead of replacing it with an empty brain', () => {
    expect(() => parseBrainSnapshot({ schema: 2, entries: [] })).toThrow('prototype_cache_schema_unsupported');
    expect(parseBrainSnapshot(null).entries).toEqual([]);
  });

  it('retries a compare-and-swap conflict against a fresh snapshot', async () => {
    const snapshots = [
      { schema: 1 as const, entries: [], trends: [], marketEvidence: [], criticJudge: [], shootingBriefs: [], creativeItems: [], updatedAt: 'a' },
      { schema: 1 as const, entries: [], trends: [], marketEvidence: [], criticJudge: [], shootingBriefs: [{ ideaId: 'other', brief: {}, savedAt: 'x' }], creativeItems: [], updatedAt: 'b' },
    ];
    let reads = 0, saves = 0;
    const result = await mutateServerBrain(
      (snapshot) => ({ ...snapshot, trends: [{ value: 'new', savedAt: 'x', evidenceCheckedAt: 'x', freshness: 'unverified' }] }),
      async () => snapshots[Math.min(reads++, 1)],
      async (snapshot) => { if (saves++ === 0) throw new Error('prototype_cache_conflict'); return snapshot; },
    );
    expect(result.shootingBriefs[0].ideaId).toBe('other');
    expect(reads).toBe(2);
    expect(saves).toBe(2);
  });

  it('keeps legacy values readable but marks them unverified', () => {
    expect(normalizeArtifacts(['legacy'], now)).toEqual([{
      value: 'legacy', savedAt: '', evidenceCheckedAt: '', freshness: 'unverified',
    }]);
  });
});
