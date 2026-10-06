import { describe, expect, it } from 'vitest';
import { MediaStateStore, type KeyValueStore } from '../../packages/core/src/media-state-store.js';
import { handlePersonaMemory } from './memory.js';

class MemoryKv implements KeyValueStore {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
}

function store() { return new MediaStateStore({ kv: new MemoryKv(), now: () => '2026-10-06T18:30:00Z' }); }

describe('Persona durable memory endpoint', () => {
  it('persists explicit rules and returns them to a later request', async () => {
    const canonical = store();
    const createStore = async () => canonical;
    const post = await handlePersonaMemory(new Request('https://life-os.test/api/media/memory', {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ rules: ['Короткие заголовки'], source: 'explicit' }),
    }), createStore, () => '2026-10-06T18:31:00Z');
    expect(post.status).toBe(200);

    const get = await handlePersonaMemory(new Request('https://life-os.test/api/media/memory'), createStore, () => '2026-10-06T18:32:00Z');
    expect(await get.json()).toEqual({ rules: ['Короткие заголовки'], durable: true });
  });
});
