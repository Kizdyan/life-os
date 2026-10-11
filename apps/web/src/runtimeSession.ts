export interface RuntimeSessionStatus {
  configured: boolean;
  authenticated: boolean;
}

export async function getRuntimeSessionStatus(fetchImpl: typeof fetch = fetch): Promise<RuntimeSessionStatus> {
  const response = await fetchImpl('/api/runtime/session', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (response.status === 503) {
    const payload = await response.json() as Partial<RuntimeSessionStatus>;
    return {
      configured: payload.configured === true,
      authenticated: false,
    };
  }
  if (!response.ok) throw new Error(`Runtime session status failed: ${response.status}`);
  return response.json() as Promise<RuntimeSessionStatus>;
}

export async function loginRuntimeSession(
  passcode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RuntimeSessionStatus> {
  const value = passcode.trim();
  if (!value) throw new Error('Введите код доступа');

  const response = await fetchImpl('/api/runtime/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode: value }),
  });

  if (response.status === 401) throw new Error('Неверный код доступа');
  if (response.status === 503) throw new Error('Серверная память ещё не настроена');
  if (!response.ok) throw new Error(`Runtime login failed: ${response.status}`);
  return response.json() as Promise<RuntimeSessionStatus>;
}

export async function logoutRuntimeSession(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl('/api/runtime/session', {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok && response.status !== 503) {
    throw new Error(`Runtime logout failed: ${response.status}`);
  }
}
