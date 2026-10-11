import { describe, expect, it } from 'vitest';
import { handleRuntimeSync, type RuntimeSyncContext } from './sync.js';
import type {
  RuntimeMutationInput,
  RuntimeMutationResult,
  RuntimeRecordDto,
  RuntimeRemoteStore,
} from './_store.js';

class FakeStore implements RuntimeRemoteStore {
  applied: RuntimeMutationInput[] = [];
  principals: string[] = [];
  records: RuntimeRecordDto[] = [];
  results = new Map<string, RuntimeMutationResult>();
  currentRevision = 0;

  async apply(principal: string, mutation: RuntimeMutationInput): Promise<RuntimeMutationResult> {
    this.principals.push(principal);
    this.applied.push(mutation);
    const configured = this.results.get(mutation.mutationId);
    if (configured) return configured;
    this.currentRevision += 1;
    return {
      mutationId: mutation.mutationId,
      status: 'applied',
      storeRevision: this.currentRevision,
      record: null,
      conflict: null,
    };
  }

  async listSince(principal: string): Promise<RuntimeRecordDto[]> {
    this.principals.push(principal);
    return this.records;
  }

  async revision(principal: string): Promise<number> {
    this.principals.push(principal);
    return this.currentRevision;
  }
}

function request(body: unknown, cookie?: string): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (cookie) headers.set('Cookie', cookie);
  return new Request('https://life.example/api/runtime/sync', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function context(store: RuntimeRemoteStore | null, userId: string | null = 'canonical-user'): RuntimeSyncContext {
  return { store, userId, configured: Boolean(store) };
}

const mutation = {
  mutationId: 'm-1',
  userId: 'spoofed-client-user',
  recordId: 'item-1',
  kind: 'life_item',
  expectedVersion: null,
  payload: { title: 'Зал' },
  deleted: false,
  clientUpdatedAt: '2026-10-02T20:00:00.000Z',
};

describe('POST /api/runtime/sync', () => {
  it('fails closed when canonical storage is not configured', async () => {
    const response = await handleRuntimeSync(
      request({ mutations: [], sinceRevision: 0 }),
      { store: null, userId: null, configured: false },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'runtime_not_configured' });
  });

  it('requires an authenticated Life OS owner session', async () => {
    const store = new FakeStore();
    const response = await handleRuntimeSync(
      request({ mutations: [], sinceRevision: 0 }),
      { store, userId: null, configured: true },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'authentication_required' });
  });

  it('ignores client userId and applies mutations under the sealed server principal', async () => {
    const store = new FakeStore();
    store.records = [{
      id: 'item-1',
      userId: 'canonical-user',
      kind: 'life_item',
      version: 1,
      payload: { title: 'Зал' },
      deleted: false,
      updatedAt: '2026-10-02T20:01:00.000Z',
    }];

    const response = await handleRuntimeSync(
      request({ mutations: [mutation], sinceRevision: 0 }),
      context(store),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(store.applied).toEqual([{
      mutationId: 'm-1',
      recordId: 'item-1',
      kind: 'life_item',
      expectedVersion: null,
      payload: { title: 'Зал' },
      deleted: false,
    }]);
    expect(store.principals.every((principal) => principal === 'canonical-user')).toBe(true);
    expect(payload.records).toEqual(store.records);
  });

  it('preserves duplicate and conflict outcomes returned by the canonical store', async () => {
    const store = new FakeStore();
    store.results.set('m-1', {
      mutationId: 'm-1',
      status: 'conflict',
      storeRevision: 4,
      record: null,
      conflict: { expectedVersion: 1, currentVersion: 3 },
    });
    store.currentRevision = 4;

    const response = await handleRuntimeSync(
      request({ mutations: [{ ...mutation, expectedVersion: 1 }], sinceRevision: 2 }),
      context(store),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results[0]).toMatchObject({
      mutationId: 'm-1',
      status: 'conflict',
      conflict: { expectedVersion: 1, currentVersion: 3 },
    });
    expect(payload.storeRevision).toBe(4);
  });

  it('proxies sync to Supabase Edge Runtime when Vercel has no service key', async () => {
    const edgeFetch: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      expect(body).toMatchObject({
        op: 'sync',
        token: 'edge-token',
        sinceRevision: 0,
      });
      expect(body.mutations).toEqual([mutation]);
      return new Response(JSON.stringify({
        storeRevision: 2,
        results: [{
          mutationId: 'm-1',
          status: 'applied',
          storeRevision: 2,
          record: null,
          conflict: null,
        }],
        records: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const response = await handleRuntimeSync(
      request({ mutations: [mutation], sinceRevision: 0 }, 'lifeos_session=edge-token'),
      undefined,
      'https://edge.example/runtime',
      edgeFetch,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ storeRevision: 2 });
  });

  it('rejects malformed or oversized mutation batches', async () => {
    const store = new FakeStore();
    const malformed = await handleRuntimeSync(
      request({ mutations: [{ nope: true }], sinceRevision: 0 }),
      context(store),
    );
    expect(malformed.status).toBe(400);

    const oversized = await handleRuntimeSync(request({
      mutations: Array.from({ length: 101 }, (_, index) => ({ ...mutation, mutationId: `m-${index}` })),
      sinceRevision: 0,
    }), context(store));
    expect(oversized.status).toBe(400);
  });
});
