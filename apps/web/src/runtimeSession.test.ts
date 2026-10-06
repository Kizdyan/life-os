import { describe, expect, it } from 'vitest';
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
});
