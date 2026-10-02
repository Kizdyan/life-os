export type RuntimeRecordKind =
  | 'life_item'
  | 'life_outcome'
  | 'memory'
  | 'audit'
  | 'project'
  | 'goal'
  | 'setting';

export interface RuntimeMutationInput {
  mutationId: string;
  recordId: string;
  kind: RuntimeRecordKind;
  expectedVersion: number | null;
  payload: Record<string, unknown>;
  deleted: boolean;
}

export interface RuntimeRecordDto {
  id: string;
  userId: string;
  kind: RuntimeRecordKind;
  version: number;
  payload: Record<string, unknown>;
  deleted: boolean;
  updatedAt: string;
}

export interface RuntimeMutationResult {
  mutationId: string;
  status: 'applied' | 'duplicate' | 'conflict';
  storeRevision: number;
  record: RuntimeRecordDto | null;
  conflict: { expectedVersion: number | null; currentVersion: number | null } | null;
}

export interface RuntimeRemoteStore {
  apply(accessToken: string, mutation: RuntimeMutationInput): Promise<RuntimeMutationResult>;
  listSince(accessToken: string, sinceRevision: number): Promise<RuntimeRecordDto[]>;
  revision(accessToken: string): Promise<number>;
}

export interface SupabaseRuntimeStoreConfig {
  url: string;
  publishableKey: string;
  fetchImpl?: typeof fetch;
}

export class SupabaseRuntimeStore implements RuntimeRemoteStore {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: SupabaseRuntimeStoreConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    if (!config.url.trim()) throw new Error('LIFE_OS_DATA_URL is required');
    if (!config.publishableKey.trim()) throw new Error('LIFE_OS_PUBLISHABLE_KEY is required');
  }

  async apply(accessToken: string, mutation: RuntimeMutationInput): Promise<RuntimeMutationResult> {
    const response = await this.fetchImpl(this.url('/rest/v1/rpc/life_runtime_apply_mutation'), {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify({
        p_mutation_id: mutation.mutationId,
        p_record_id: mutation.recordId,
        p_kind: mutation.kind,
        p_expected_version: mutation.expectedVersion,
        p_payload: mutation.payload,
        p_deleted: mutation.deleted,
      }),
    });

    if (!response.ok) throw new Error(`runtime mutation failed: ${response.status}`);
    return response.json() as Promise<RuntimeMutationResult>;
  }

  async listSince(accessToken: string, sinceRevision: number): Promise<RuntimeRecordDto[]> {
    const url = new URL(this.url('/rest/v1/life_runtime_records'));
    url.searchParams.set('select', 'record_id,user_id,kind,version,payload,deleted,updated_at,server_revision');
    url.searchParams.set('server_revision', `gt.${Math.max(0, Math.floor(sinceRevision))}`);
    url.searchParams.set('order', 'server_revision.asc');

    const response = await this.fetchImpl(url, { headers: this.headers(accessToken) });
    if (!response.ok) throw new Error(`runtime snapshot failed: ${response.status}`);
    const rows = await response.json() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.record_id),
      userId: String(row.user_id),
      kind: row.kind as RuntimeRecordKind,
      version: Number(row.version),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      deleted: Boolean(row.deleted),
      updatedAt: String(row.updated_at),
    }));
  }

  async revision(accessToken: string): Promise<number> {
    const url = new URL(this.url('/rest/v1/life_runtime_state'));
    url.searchParams.set('select', 'store_revision');
    url.searchParams.set('limit', '1');

    const response = await this.fetchImpl(url, { headers: this.headers(accessToken) });
    if (!response.ok) throw new Error(`runtime revision failed: ${response.status}`);
    const rows = await response.json() as Array<{ store_revision?: number }>;
    return Number(rows[0]?.store_revision ?? 0);
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      apikey: this.config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private url(path: string): string {
    return new URL(path, this.config.url.replace(/\/+$/, '') + '/').toString();
  }
}

export function runtimeStoreFromEnv(): RuntimeRemoteStore | null {
  const url = (process.env.LIFE_OS_DATA_URL ?? '').trim();
  const publishableKey = (process.env.LIFE_OS_PUBLISHABLE_KEY ?? '').trim();
  if (!url || !publishableKey) return null;
  return new SupabaseRuntimeStore({ url, publishableKey });
}
