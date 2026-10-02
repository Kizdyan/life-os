import { describe, expect, it } from 'vitest';
import { handleRuntimeSync } from './sync';
import type {
  RuntimeMutationInput,
  RuntimeMutationResult,
  RuntimeRecordDto,
  RuntimeRemoteStore,
} from './_store';

class FakeStore implements RuntimeRemoteStore {
  applied: RuntimeMutationInput[] = [];
  records: RuntimeRecordDto[] = [];
  results = new Map<string, RuntimeMutationResult>();
  currentRevision = 0;

  async apply(_accessToken: string, mutation: RuntimeMutationInput): Promise<RuntimeMutationResult> {
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

  async listSince(): Promise<RuntimeRecordDto[]> {
    return this.records;
  }

  async revision(): Promise<number> {
    return this.currentRevision;
  }
}

function request(body: unknown, authorization = 'Bearer user-token'): Request {
  return new Request('https://life.example/api/runtime/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

const mutation = {
  mutationId: 'm-1',
  userId: 'self',
  recordId: 'item-1',
  kind: 'life_item',
  expectedVersion: null,
  payload: { title: 'Зал' },
  deleted: false,
  clientUpdatedAt: '2026-10-02T20:00:00.000Z',
};

describe('POST /api/runtime/sync', () => {
  it('fails closed when canonical storage is not configured', async () => {
    const response = await handleRuntimeSync(request({ mutations: [], sinceRevision: 0 }), null);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'runtime_not_configured' });
  });

  it('requires an authenticated bearer token', async () => {
    const response = await handleRuntimeSync(request({ mutations: [], sinceRevision: 0 }, ''), new FakeStore());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'authentication_required' });
  });

  it('ignores client userId and applies validated mutations under server auth', async () => {
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

    const response = await handleRuntimeSync(request({ mutations: [mutation], sinceRevision: 0 }), store);
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

    const response = await handleRuntimeSync(request({
      mutations: [{ ...mutation, expectedVersion: 1 }],
      sinceRevision: 2,
    }), store);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results[0]).toMatchObject({
      mutationId: 'm-1',
      status: 'conflict',
      conflict: { expectedVersion: 1, currentVersion: 3 },
    });
    expect(payload.storeRevision).toBe(4);
  });

  it('rejects malformed or oversized mutation batches', async () => {
    const store = new FakeStore();
    const malformed = await handleRuntimeSync(request({ mutations: [{ nope: true }], sinceRevision: 0 }), store);
    expect(malformed.status).toBe(400);

    const oversized = await handleRuntimeSync(request({
      mutations: Array.from({ length: 101 }, (_, index) => ({ ...mutation, mutationId: `m-${index}` })),
      sinceRevision: 0,
    }), store);
    expect(oversized.status).toBe(400);
  });
});
