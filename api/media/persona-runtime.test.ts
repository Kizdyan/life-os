import { describe, expect, it } from 'vitest';
import { MediaStateStore, type KeyValueStore } from '../../packages/core/src/media-state-store.js';
import { handlePersonaRuntime } from './persona-runtime.js';

class RemoteKv implements KeyValueStore {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
}

describe('Persona durable runtime E2E', () => {
  it('restores learned rules in a new server session without client or process memory', async () => {
    const remote = new RemoteKv();
    let storeInstances = 0;
    const createStore = async () => {
      storeInstances += 1;
      return new MediaStateStore({ kv: remote, now: () => `2026-10-06T18:${30 + storeInstances}:00Z` });
    };
    const prompts: any[] = [];
    const delegate = async (request: Request) => {
      const body = await request.json();
      prompts.push(body);
      if (body.action === 'revise') {
        return new Response(JSON.stringify({ learnedRules: ['Короткие заголовки'], changeSummary: 'Готово' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ learnedRules: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };

    await handlePersonaRuntime(new Request('https://life-os.test/api/media/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'revise', feedback: 'Сделай короче' }),
    }), { createStore, delegate, now: () => '2026-10-06T18:31:00Z' });

    await handlePersonaRuntime(new Request('https://life-os.test/api/media/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'generate', idea: { title: 'Новая тема' }, memory: ['stale-browser-rule'] }),
    }), { createStore, delegate, now: () => '2026-10-06T18:32:00Z' });

    expect(storeInstances).toBe(2);
    expect(prompts[0].memory).toEqual([]);
    expect(prompts[1].memory).toEqual(['Короткие заголовки']);
  });
});
