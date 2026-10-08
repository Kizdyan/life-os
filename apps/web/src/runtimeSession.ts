import { createRuntimeSessionClient } from './runtimeTransport';

export interface RuntimeSessionStatus {
  configured: boolean;
  authenticated: boolean;
}

const edgeUrl = import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '';
const apiUrl = import.meta.env.VITE_LIFE_OS_API_URL ?? '';
const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

function sessionClient(fetchImpl: typeof fetch) {
  if (typeof localStorage === 'undefined') {
    if (edgeUrl.trim()) throw new Error('Browser storage is required for direct Edge runtime');
    return createRuntimeSessionClient({ edgeUrl: '', apiUrl, storage: memorylessStorage, fetchImpl });
  }
  return createRuntimeSessionClient({ edgeUrl, apiUrl, storage: localStorage, fetchImpl });
}

const memorylessStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
};

export async function getRuntimeSessionStatus(fetchImpl: typeof fetch = browserFetch): Promise<RuntimeSessionStatus> {
  return sessionClient(fetchImpl).status();
}

export async function loginRuntimeSession(
  passcode: string,
  fetchImpl: typeof fetch = browserFetch,
): Promise<RuntimeSessionStatus> {
  return sessionClient(fetchImpl).login(passcode);
}

export async function logoutRuntimeSession(fetchImpl: typeof fetch = browserFetch): Promise<void> {
  await sessionClient(fetchImpl).logout();
}
