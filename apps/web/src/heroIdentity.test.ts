import { describe, expect, it } from 'vitest';
import { addHeroExercise, applyRemoteHeroIdentity, heroIdentityPayload, readHeroIdentity, saveHeroIdentity, seedHeroIdentity } from './heroIdentity';
import type { RuntimeSyncRecord } from './runtimeSync';

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}
describe('hero identity profile', () => {
  it('keeps desired persona separate from natural identity and actor range', () => {
    const p = seedHeroIdentity();
    expect(p.interview.answered).toBe(76);
    expect(p.core.source).toBe('self_report');
    expect(p.prime.source).toBe('aspiration');
    expect(p.publicBrand.verified).toBe(false);
    expect(p.actor.independentFromPublicBrand).toBe(true);
    expect(p.style.hair).toBe('unresolved');
  });
  it('restores offline profile and retains a bounded observation history', () => {
    const s = storage();
    const p = seedHeroIdentity();
    saveHeroIdentity(s, p);
    const next = addHeroExercise(readHeroIdentity(s), {
      id: 'trial-1', createdAt: '2026-10-13T00:00:00.000Z', mode: 'gentleman',
      confidence: 6, naturalness: 7, note: 'Свободнее говорил', evidenceLevel: 'self_report',
    });
    saveHeroIdentity(s, next);
    expect(readHeroIdentity(s).exercises[0].note).toBe('Свободнее говорил');
    expect(() => addHeroExercise(p, { ...next.exercises[0], confidence: 11 })).toThrow();
  });
  it('hydrates only explicitly typed remote records and keeps their version', () => {
    const s = storage();
    const p = seedHeroIdentity();
    const record: RuntimeSyncRecord = {
      id: 'persona:hero-identity', userId: 'self', kind: 'memory', version: 3,
      deleted: false, updatedAt: '2026-10-13T12:00:00.000Z',
      payload: heroIdentityPayload(p),
    };
    applyRemoteHeroIdentity(s, [{ ...record, id: 'other:profile' }, record]);
    expect(readHeroIdentity(s).version).toBe(3);
    expect(readHeroIdentity(s).publicBrand.direction).toContain('джентльмен');
  });
});
