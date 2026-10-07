import type { RuntimeSyncMutation, RuntimeSyncResponse } from './runtimeSync';

export const EDGE_RUNTIME_TOKEN_KEY = 'life-os:edge-session:v1';

type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface EdgeRuntimeSessionStatus {
  configured: boolean;
  authenticated: boolean;
}

export class EdgeRuntimeClient {
  private readonly endpoint: string;

  constructor(
    endpoint: string,
    private readonly storage: TokenStorage,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.endpoint = endpoint.trim().replace(/\/+$/, '');
    if (!this.endpoint) throw new Error('Life OS Edge runtime URL is required');
  }

  async login(passcode: string): Promise<EdgeRuntimeSessionStatus> {
    const value = passcode.trim();
    if (!value) throw new Error('Введите код доступа');

    const response = await this.post({ op: 'login', passcode: value });
    if (response.status === 401) throw new Error('Неверный код доступа');
    if (!response.ok) throw new Error(`Runtime login failed: ${response.status}`);

    const payload = await response.json() as { authenticated?: unknown; token?: unknown };
    if (payload.authenticated !== true || typeof payload.token !== 'string' || !payload.token) {
      throw new Error('Серверная память ещё не настроена');
    }

    this.storage.setItem(EDGE_RUNTIME_TOKEN_KEY, payload.token);
    return { configured: true, authenticated: true };
  }

  async persona(payload: Record<string, unknown>): Promise<any> {
    const token = this.token();
    if (!token) throw new Error('Persona requires Edge runtime session');
    const response = await this.post({ op: 'persona', token, payload });
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok) throw new Error(String(body?.error || `Persona Edge failed: ${response.status}`));
    return body;
  }

  async status(): Promise<EdgeRuntimeSessionStatus> {
    const token = this.token();
    if (!token) return { configured: true, authenticated: false };

    const response = await this.post({ op: 'status', token });
    if (!response.ok) {
      if (response.status === 401) this.storage.removeItem(EDGE_RUNTIME_TOKEN_KEY);
      throw new Error(`Runtime session status failed: ${response.status}`);
    }
    const payload = await response.json() as { authenticated?: unknown };
    const authenticated = payload.authenticated === true;
    if (!authenticated) this.storage.removeItem(EDGE_RUNTIME_TOKEN_KEY);
    return { configured: true, authenticated };
  }

  logout(): void {
    this.storage.removeItem(EDGE_RUNTIME_TOKEN_KEY);
  }

  async health(): Promise<{ configured: boolean; databaseReachable: boolean; storeRevision: number | null }> {
    const url = new URL(this.endpoint);
    url.searchParams.set('health', '1');
    const response = await this.fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const payload = await response.json() as {
      configured?: unknown;
      databaseReachable?: unknown;
      storeRevision?: unknown;
    };
    return {
      configured: payload.configured === true,
      databaseReachable: payload.databaseReachable === true,
      storeRevision: typeof payload.storeRevision === 'number' ? payload.storeRevision : null,
    };
  }

  async sync(input: { mutations: RuntimeSyncMutation[]; sinceRevision: number }): Promise<RuntimeSyncResponse> {
    const token = this.token();
    if (!token) throw new Error('Life OS runtime authentication required');

    const response = await this.post({
      op: 'sync',
      token,
      mutations: input.mutations,
      sinceRevision: input.sinceRevision,
    });
    if (response.status === 401) {
      this.storage.removeItem(EDGE_RUNTIME_TOKEN_KEY);
      throw new Error('Life OS runtime authentication required');
    }
    if (!response.ok) throw new Error(`Life OS sync failed: ${response.status}`);
    return response.json() as Promise<RuntimeSyncResponse>;
  }

  private token(): string | null {
    const token = this.storage.getItem(EDGE_RUNTIME_TOKEN_KEY)?.trim();
    return token || null;
  }

  private post(payload: Record<string, unknown>): Promise<Response> {
    return this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
}

export async function personaEdgeRequest(payload: Record<string, unknown>): Promise<any> {
  const endpoint = (import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '').trim();
  if (!endpoint) throw new Error('Persona Edge runtime URL is required');
  return new EdgeRuntimeClient(endpoint, localStorage).persona(payload);
}
