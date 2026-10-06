import { EdgeRuntimeClient, type EdgeRuntimeSessionStatus } from './edgeRuntimeClient';
import {
  HttpRemoteLifeOsGateway,
  type RemoteLifeOsGateway,
} from './runtimeSync';

type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface RuntimeTransportOptions {
  edgeUrl: string;
  apiUrl: string;
  storage: TokenStorage;
  fetchImpl?: typeof fetch;
}

export interface RuntimeSessionClient {
  status(): Promise<EdgeRuntimeSessionStatus>;
  login(passcode: string): Promise<EdgeRuntimeSessionStatus>;
  logout(): Promise<void>;
}

export function createRuntimeGateway(options: RuntimeTransportOptions): RemoteLifeOsGateway {
  const fetchImpl = options.fetchImpl ?? fetch;
  const edgeUrl = options.edgeUrl.trim();
  if (!edgeUrl) throw new Error('Supabase Edge runtime URL is required in production');
  return new EdgeRuntimeClient(edgeUrl, options.storage, fetchImpl);
}

export function createRuntimeSessionClient(options: RuntimeTransportOptions): RuntimeSessionClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const edgeUrl = options.edgeUrl.trim();
  if (edgeUrl) {
    const client = new EdgeRuntimeClient(edgeUrl, options.storage, fetchImpl);
    return {
      status: () => client.status(),
      login: (passcode) => client.login(passcode),
      logout: async () => client.logout(),
    };
  }
  throw new Error('Supabase Edge runtime URL is required in production');
}

class VercelRuntimeSessionClient implements RuntimeSessionClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly fetchImpl: typeof fetch) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
  }

  async status(): Promise<EdgeRuntimeSessionStatus> {
    const response = await this.fetchImpl(this.endpoint(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 503) {
      const payload = await response.json() as Partial<EdgeRuntimeSessionStatus>;
      return { configured: payload.configured === true, authenticated: false };
    }
    if (!response.ok) throw new Error(`Runtime session status failed: ${response.status}`);
    return response.json() as Promise<EdgeRuntimeSessionStatus>;
  }

  async login(passcode: string): Promise<EdgeRuntimeSessionStatus> {
    const value = passcode.trim();
    if (!value) throw new Error('Введите код доступа');
    const response = await this.fetchImpl(this.endpoint(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: value }),
    });
    if (response.status === 401) throw new Error('Неверный код доступа');
    if (response.status === 503) throw new Error('Серверная память ещё не настроена');
    if (!response.ok) throw new Error(`Runtime login failed: ${response.status}`);
    return response.json() as Promise<EdgeRuntimeSessionStatus>;
  }

  async logout(): Promise<void> {
    const response = await this.fetchImpl(this.endpoint(), {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok && response.status !== 503) {
      throw new Error(`Runtime logout failed: ${response.status}`);
    }
  }

  private endpoint(): string {
    return this.baseUrl ? `${this.baseUrl}/api/runtime/session` : '/api/runtime/session';
  }
}
