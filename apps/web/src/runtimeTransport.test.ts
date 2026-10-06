import { describe, expect, it } from 'vitest';
import { EDGE_RUNTIME_TOKEN_KEY, EdgeRuntimeClient } from './edgeRuntimeClient';
import { HttpRemoteLifeOsGateway } from './runtimeSync';
import { createRuntimeGateway, createRuntimeSessionClient } from './runtimeTransport';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const edgeUrl = 'https://example.supabase.co/functions/v1/life-os-runtime';

describe('runtime transport selection', () => {
  it('uses Supabase Edge directly when an Edge URL is configured', () => {
    const storage = new MemoryStorage();
    const gateway = createRuntimeGateway({ edgeUrl, apiUrl: '', storage, fetchImpl: fetch });
    expect(gateway).toBeInstanceOf(EdgeRuntimeClient);
  });

  it('keeps the Vercel API gateway only as a fallback', () => {
    const storage = new MemoryStorage();
    const gateway = createRuntimeGateway({ edgeUrl: '', apiUrl: 'https://api.example.test', storage, fetchImpl: fetch });
    expect(gateway).toBeInstanceOf(HttpRemoteLifeOsGateway);
  });

  it('uses the same Edge token for session and sync transports', async () => {
    const storage = new MemoryStorage();
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.op === 'login') {
        return new Response(JSON.stringify({ authenticated: true, token: 'opaque.token' }), { status: 200 });
      }
      return new Response(JSON.stringify({ authenticated: true }), { status: 200 });
    };

    const session = createRuntimeSessionClient({ edgeUrl, apiUrl: '', storage, fetchImpl });
    await session.login('secret');
    await session.status();

    expect(storage.getItem(EDGE_RUNTIME_TOKEN_KEY)).toBe('opaque.token');
    expect(bodies).toEqual([
      { op: 'login', passcode: 'secret' },
      { op: 'status', token: 'opaque.token' },
    ]);
  });
});
