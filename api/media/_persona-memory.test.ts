import { describe, expect, it } from 'vitest';
import { MediaStateStore, type KeyValueStore } from '../../packages/core/src/media-state-store.js';
import { loadPersonaRules, persistPersonaRules } from './_persona-memory.js';

class MemoryKv implements KeyValueStore {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
}

describe('server Persona memory service', () => {
  it('loads canonical rules and preserves explicit preferences against inferred updates', async () => {
    const store = new MediaStateStore({ kv: new MemoryKv(), now: () => '2026-10-06T18:20:00Z' });

    await persistPersonaRules(store, [' Короткие заголовки ', 'Короткие заголовки'], 'explicit', '2026-10-06T18:20:00Z');
    await persistPersonaRules(store, ['короткие заголовки', 'Длинные заголовки'], 'inferred', '2026-10-06T18:25:00Z');

    expect(await loadPersonaRules(store)).toEqual(['Короткие заголовки', 'Длинные заголовки']);
    expect((await store.listPersonaMemoryRules()).find(x => x.rule === 'Короткие заголовки')?.source).toBe('explicit');
  });
});
