import { describe, expect, it } from 'vitest';
import { handleRuntimeSession } from './session.js';
import type { RuntimeSessionConfig } from './_session.js';
import type { RuntimeRemoteStore } from './_store.js';

async function config(): Promise<RuntimeSessionConfig> {
  const bytes = new TextEncoder().encode('correct horse battery staple');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    userId: '11111111-1111-1111-1111-111111111111',
    passcodeSha256: hash,
    sessionSecret: 'this-is-a-long-server-only-session-secret-12345',
  };
}

function store(revision = 7): RuntimeRemoteStore {
  return {
    async apply() { throw new Error('not used'); },
    async listSince() { return []; },
    async revision() { return revision; },
  };
}

describe('/api/runtime/session', () => {
  it('fails closed when owner session is not configured', async () => {
    const response = await handleRuntimeSession(new Request('https://life.example/api/runtime/session'), null);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ configured: false, authenticated: false });
  });

  it('rejects an incorrect passcode without setting a cookie', async () => {
    const response = await handleRuntimeSession(new Request('https://life.example/api/runtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'wrong' }),
    }), await config());

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('creates a sealed HttpOnly owner session and reads it back', async () => {
    const cfg = await config();
    const login = await handleRuntimeSession(new Request('https://life.example/api/runtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: 'correct horse battery staple' }),
    }), cfg);

    expect(login.status).toBe(200);
    const setCookie = login.headers.get('set-cookie')!;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');

    const cookie = setCookie.split(';')[0];
    const status = await handleRuntimeSession(new Request('https://life.example/api/runtime/session', {
      headers: { Cookie: cookie },
    }), cfg);

    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ configured: true, authenticated: true });
  });

  it('checks canonical database health without a separate serverless route', async () => {
    const response = await handleRuntimeSession(
      new Request('https://life.example/api/runtime/session?health=1'),
      await config(),
      store(12),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: true,
      authenticated: false,
      databaseReachable: true,
      storeRevision: 12,
    });
  });

  it('reports database health failure without leaking backend details', async () => {
    const failing: RuntimeRemoteStore = {
      async apply() { throw new Error('not used'); },
      async listSince() { return []; },
      async revision() { throw new Error('secret backend detail'); },
    };
    const response = await handleRuntimeSession(
      new Request('https://life.example/api/runtime/session?health=1'),
      await config(),
      failing,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      configured: true,
      authenticated: false,
      databaseReachable: false,
      storeRevision: null,
    });
  });

  it('clears the owner session explicitly', async () => {
    const response = await handleRuntimeSession(new Request('https://life.example/api/runtime/session', {
      method: 'DELETE',
    }), await config());

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
