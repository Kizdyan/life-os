import { describe, expect, it } from 'vitest';
import { handleRuntimeHealth } from './health.js';
import type { RuntimeRemoteStore } from './_store.js';

function store(revision = 7): RuntimeRemoteStore {
  return {
    async apply() { throw new Error('not used'); },
    async listSince() { return []; },
    async revision() { return revision; },
  };
}

describe('/api/runtime/health', () => {
  it('fails closed when durable runtime is not configured', async () => {
    const response = await handleRuntimeHealth(
      new Request('https://life.example/api/runtime/health'),
      { store: null, userId: null, configured: false },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      configured: false,
      databaseReachable: false,
      storeRevision: null,
    });
  });

  it('verifies the canonical database and reports its revision', async () => {
    const response = await handleRuntimeHealth(
      new Request('https://life.example/api/runtime/health'),
      { store: store(12), userId: '11111111-1111-1111-1111-111111111111', configured: true },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      configured: true,
      databaseReachable: true,
      storeRevision: 12,
    });
  });

  it('reports database failure without leaking the underlying error', async () => {
    const failing: RuntimeRemoteStore = {
      async apply() { throw new Error('not used'); },
      async listSince() { return []; },
      async revision() { throw new Error('secret backend detail'); },
    };

    const response = await handleRuntimeHealth(
      new Request('https://life.example/api/runtime/health'),
      { store: failing, userId: '11111111-1111-1111-1111-111111111111', configured: true },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      configured: true,
      databaseReachable: false,
      storeRevision: null,
    });
  });

  it('allows GET only', async () => {
    const response = await handleRuntimeHealth(
      new Request('https://life.example/api/runtime/health', { method: 'POST' }),
      { store: store(), userId: '11111111-1111-1111-1111-111111111111', configured: true },
    );
    expect(response.status).toBe(405);
  });
});
