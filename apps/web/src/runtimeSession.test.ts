import { describe, expect, it } from 'vitest';
import {
  getRuntimeSessionStatus,
  loginRuntimeSession,
  logoutRuntimeSession,
} from './runtimeSession';

describe('runtime session client', () => {
  it('treats 503 as an unconfigured remote runtime', async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      JSON.stringify({ configured: false, authenticated: false }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );

    await expect(getRuntimeSessionStatus(fetchImpl)).resolves.toEqual({
      configured: false,
      authenticated: false,
    });
  });

  it('logs in without persisting the passcode client-side', async () => {
    let requestBody = '';
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({ configured: true, authenticated: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await loginRuntimeSession('  secret  ', fetchImpl);

    expect(result).toEqual({ configured: true, authenticated: true });
    expect(JSON.parse(requestBody)).toEqual({ passcode: 'secret' });
  });

  it('surfaces invalid credentials in Russian', async () => {
    const fetchImpl: typeof fetch = async () => new Response(
      JSON.stringify({ error: 'invalid_credentials' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );

    await expect(loginRuntimeSession('wrong', fetchImpl)).rejects.toThrow('Неверный код доступа');
  });

  it('logs out through the server cookie endpoint', async () => {
    let method = '';
    const fetchImpl: typeof fetch = async (_input, init) => {
      method = String(init?.method);
      return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    };

    await logoutRuntimeSession(fetchImpl);
    expect(method).toBe('DELETE');
  });
});
