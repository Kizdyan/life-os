import { describe, expect, it } from 'vitest';
import { artifactFreshness, normalizeArtifacts } from './persona-store';

describe('Persona durable Shared Brain artifact freshness', () => {
  const now = Date.parse('2026-10-09T12:00:00.000Z');

  it('labels fresh, cached, stale and unverified artifacts from durable timestamps', () => {
    expect(artifactFreshness('2026-10-09T11:58:00.000Z', '2026-10-09T00:00:00.000Z', now)).toBe('fresh');
    expect(artifactFreshness('2026-10-08T12:00:00.000Z', '2026-10-08T00:00:00.000Z', now)).toBe('cached');
    expect(artifactFreshness('2026-10-01T12:00:00.000Z', '2026-10-01T00:00:00.000Z', now)).toBe('stale');
    expect(artifactFreshness('', '', now)).toBe('unverified');
  });

  it('keeps legacy values readable but marks them unverified', () => {
    expect(normalizeArtifacts(['legacy'], now)).toEqual([{
      value: 'legacy', savedAt: '', evidenceCheckedAt: '', freshness: 'unverified',
    }]);
  });
});
