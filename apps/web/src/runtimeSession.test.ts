import { describe, expect, it, vi } from 'vitest';
import { createRuntimeSessionClient } from './runtimeTransport';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const edgeUrl = 'https://example.supabase.co/functions/v1/life-os-runtime';

describe('runtime session client', () => {
  it('requires Supabase Edge instead of a Vercel session fallback', () => {
    expect(() => createRuntimeSessionClient({ edgeUrl: '', apiUrl: 'https://api.example.test', storage: new MemoryStorage(), fetchImpl: fetch }))
      .toThrow('Supabase Edge runtime URL is required in production');
  });

  it('logs in through Edge and persists only the opaque session token', async () => {
    let requestBody = '';
    const storage = new MemoryStorage();
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ authenticated: true, token: 'opaque.token' }), { status: 200 });
    };
    const result = await createRuntimeSessionClient({ edgeUrl, apiUrl: '', storage, fetchImpl }).login('  secret  ');
    expect(result).toEqual({ configured: true, authenticated: true });
    expect(JSON.parse(requestBody)).toEqual({ op: 'login', passcode: 'secret' });
    expect(storage.getItem('life-os:edge-session:v1')).toBe('opaque.token');
  });

  it('surfaces invalid Edge credentials in Russian', async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 });
    await expect(createRuntimeSessionClient({ edgeUrl, apiUrl: '', storage: new MemoryStorage(), fetchImpl }).login('wrong'))
      .rejects.toThrow('Неверный код доступа');
  });

  it('logs out locally by clearing the opaque Edge token', async () => {
    const storage = new MemoryStorage();
    storage.setItem('life-os:edge-session:v1', 'opaque.token');
    const fetchImpl: typeof fetch = async () => { throw new Error('logout must not call a server'); };
    await createRuntimeSessionClient({ edgeUrl, apiUrl: '', storage, fetchImpl }).logout();
    expect(storage.getItem('life-os:edge-session:v1')).toBeNull();
  });

  it('adversarially preserves Safari WebKit fetch receiver through real session helpers and sync', async () => {
    const storage = new MemoryStorage();
    const requests: string[] = [];
    const currentFetch = globalThis.fetch;
    const currentStorage = (globalThis as { localStorage?: Storage }).localStorage;
    const currentEnv = import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL;
    try {
      vi.stubEnv('VITE_LIFE_OS_EDGE_RUNTIME_URL', edgeUrl);
      vi.stubGlobal('localStorage', storage);
      globalThis.fetch = function (this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
        if (this !== globalThis) throw new TypeError('Can only call Window.fetch on instances of Window');
        const body = JSON.parse(String(init?.body ?? '{}')) as { op?: string };
        requests.push(body.op ?? '');
        if (body.op === 'login') {
          return Promise.resolve(new Response(JSON.stringify({ authenticated: true, token: 'opaque.token' }), { status: 200 }));
        }
        if (body.op === 'sync') {
          return Promise.resolve(new Response(JSON.stringify({ storeRevision: 1, results: [], records: [] }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ authenticated: true }), { status: 200 }));
      } as typeof fetch;
      vi.resetModules();
      const { loginRuntimeSession, getRuntimeSessionStatus } = await import('./runtimeSession');
      const { createRuntimeGateway } = await import('./runtimeTransport');
      await expect(loginRuntimeSession(' secret ')).resolves.toEqual({ configured: true, authenticated: true });
      await expect(getRuntimeSessionStatus()).resolves.toEqual({ configured: true, authenticated: true });
      const gateway = createRuntimeGateway({ edgeUrl, apiUrl: '', storage });
      await gateway.sync({ mutations: [], sinceRevision: 0 });
      expect(requests).toEqual(['login', 'status', 'sync']);
    } finally {
      globalThis.fetch = currentFetch;
      if (currentStorage === undefined) vi.unstubAllGlobals();
      else vi.stubGlobal('localStorage', currentStorage);
      vi.unstubAllEnvs();
      vi.resetModules();
      expect(import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL).toBe(currentEnv);
    }
  });

});
