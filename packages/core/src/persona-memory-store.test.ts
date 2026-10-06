import { describe, expect, it } from 'vitest';
import { MediaStateStore, type KeyValueStore } from './media-state-store';
import type { PersonaMemoryRule } from './persona-state';

class MemoryKv implements KeyValueStore {
  readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

const rule = (source: PersonaMemoryRule['source'], value: string, updatedAt: string): PersonaMemoryRule => ({
  id: 'headline-length',
  rule: value,
  source,
  updatedAt,
});

describe('canonical Persona memory in MediaStateStore', () => {
  it('survives a new store instance and never lets inferred learning overwrite explicit preference', async () => {
    const kv = new MemoryKv();
    const first = new MediaStateStore({ kv, now: () => '2026-10-06T18:00:00Z' });
    const explicit = rule('explicit', 'Короткие заголовки', '2026-10-06T18:00:00Z');

    await first.savePersonaMemoryRule(explicit);
    await first.savePersonaMemoryRule(rule('inferred', 'Длинные заголовки', '2026-10-06T18:05:00Z'));

    const reloaded = new MediaStateStore({ kv, now: () => '2026-10-06T18:10:00Z' });
    expect(await reloaded.listPersonaMemoryRules()).toEqual([explicit]);
  });

  it('allows an explicit preference to replace an older inferred value for the same memory id', async () => {
    const store = new MediaStateStore({ kv: new MemoryKv(), now: () => '2026-10-06T18:00:00Z' });
    const explicit = rule('explicit', 'Короткие заголовки', '2026-10-06T18:05:00Z');

    await store.savePersonaMemoryRule(rule('inferred', 'Длинные заголовки', '2026-10-06T18:00:00Z'));
    await store.savePersonaMemoryRule(explicit);

    expect(await store.listPersonaMemoryRules()).toEqual([explicit]);
  });
});
