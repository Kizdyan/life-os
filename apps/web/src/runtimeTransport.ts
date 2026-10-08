import { EdgeRuntimeClient, type EdgeRuntimeSessionStatus } from './edgeRuntimeClient';
import { type RemoteLifeOsGateway } from './runtimeSync';

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

const browserFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export function createRuntimeGateway(options: RuntimeTransportOptions): RemoteLifeOsGateway {
  const fetchImpl = options.fetchImpl ?? browserFetch;
  const edgeUrl = options.edgeUrl.trim();
  if (!edgeUrl) throw new Error('Supabase Edge runtime URL is required in production');
  return new EdgeRuntimeClient(edgeUrl, options.storage, fetchImpl);
}

export function createRuntimeSessionClient(options: RuntimeTransportOptions): RuntimeSessionClient {
  const fetchImpl = options.fetchImpl ?? browserFetch;
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

