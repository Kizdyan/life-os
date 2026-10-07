import { describe, expect, it } from 'vitest';
import { EDGE_RUNTIME_TOKEN_KEY, EdgeRuntimeClient } from './edgeRuntimeClient';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const endpoint = 'https://example.supabase.co/functions/v1/life-os-runtime';

describe('direct Supabase Edge runtime client', () => {
  it('logs in through Edge and stores only the opaque session token', async () => {
    const storage = new MemoryStorage();
    let body: unknown;
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ authenticated: true, token: 'opaque.token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new EdgeRuntimeClient(endpoint, storage, fetchImpl);
    await expect(client.login('  secret  ')).resolves.toEqual({ configured: true, authenticated: true });

    expect(body).toEqual({ op: 'login', passcode: 'secret' });
    expect(storage.getItem(EDGE_RUNTIME_TOKEN_KEY)).toBe('opaque.token');
    expect(storage.getItem(EDGE_RUNTIME_TOKEN_KEY)).not.toContain('secret');
  });

  it('checks status and syncs using the opaque token without browser secrets', async () => {
    const storage = new MemoryStorage();
    storage.setItem(EDGE_RUNTIME_TOKEN_KEY, 'opaque.token');
    const bodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      if ((body as { op?: string }).op === 'status') {
        return new Response(JSON.stringify({ authenticated: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ storeRevision: 3, results: [], records: [] }), { status: 200 });
    };

    const client = new EdgeRuntimeClient(endpoint, storage, fetchImpl);
    await expect(client.status()).resolves.toEqual({ configured: true, authenticated: true });
    await expect(client.sync({ mutations: [], sinceRevision: 2 })).resolves.toEqual({
      storeRevision: 3,
      results: [],
      records: [],
    });

    expect(bodies).toEqual([
      { op: 'status', token: 'opaque.token' },
      { op: 'sync', token: 'opaque.token', mutations: [], sinceRevision: 2 },
    ]);
  });

  it('binds the default browser fetch so WebKit does not reject an unbound Window.fetch', async () => {
    const storage = new MemoryStorage();
    const originalFetch = globalThis.fetch;
    let thisValue: unknown;
    globalThis.fetch = function (this: unknown) {
      thisValue = this;
      return Promise.resolve(new Response(JSON.stringify({ authenticated: true, token: 'opaque.token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    } as typeof fetch;

    try {
      const client = new EdgeRuntimeClient(endpoint, storage);
      await client.login('secret');
      expect(thisValue).toBe(globalThis);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('logs out locally because the Edge token is client-held', async () => {
    const storage = new MemoryStorage();
    storage.setItem(EDGE_RUNTIME_TOKEN_KEY, 'opaque.token');
    const client = new EdgeRuntimeClient(endpoint, storage, async () => new Response(null, { status: 500 }));

    client.logout();
    expect(storage.getItem(EDGE_RUNTIME_TOKEN_KEY)).toBeNull();
  });
});
