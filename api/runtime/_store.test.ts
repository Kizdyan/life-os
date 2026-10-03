import { describe, expect, it } from 'vitest';
import {
  SupabaseServiceRuntimeStore,
  type RuntimeMutationInput,
} from './_store';

const mutation: RuntimeMutationInput = {
  mutationId: 'm-1',
  recordId: 'item-1',
  kind: 'life_item',
  expectedVersion: 2,
  payload: { title: 'Театр' },
  deleted: false,
};

describe('SupabaseServiceRuntimeStore', () => {
  it('keeps the legacy service key in server headers and passes the sealed principal to the server RPC', async () => {
    let capturedUrl = '';
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = '';
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      capturedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({
        mutationId: 'm-1',
        status: 'applied',
        storeRevision: 3,
        record: null,
        conflict: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const store = new SupabaseServiceRuntimeStore({
      url: 'https://db.example',
      serviceKey: 'server-secret',
      fetchImpl,
    });

    await store.apply('11111111-1111-1111-1111-111111111111', mutation);

    expect(capturedUrl).toBe('https://db.example/rest/v1/rpc/life_runtime_apply_mutation_server');
    expect(capturedHeaders).toMatchObject({
      apikey: 'server-secret',
      Authorization: 'Bearer server-secret',
    });
    expect(JSON.parse(capturedBody)).toMatchObject({
      p_user_id: '11111111-1111-1111-1111-111111111111',
      p_mutation_id: 'm-1',
      p_record_id: 'item-1',
      p_expected_version: 2,
    });
  });

  it('sends modern Supabase secret keys only in the apikey header', async () => {
    let capturedHeaders: HeadersInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({
        mutationId: 'm-1',
        status: 'applied',
        storeRevision: 1,
        record: null,
        conflict: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const store = new SupabaseServiceRuntimeStore({
      url: 'https://db.example',
      serviceKey: 'sb_secret_runtime_example',
      fetchImpl,
    });

    await store.apply('11111111-1111-1111-1111-111111111111', mutation);

    expect(capturedHeaders).toMatchObject({
      apikey: 'sb_secret_runtime_example',
      'Content-Type': 'application/json',
    });
    expect(capturedHeaders).not.toHaveProperty('Authorization');
  });

  it('scopes snapshot and revision reads to the server principal', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('life_runtime_state')) {
        return new Response(JSON.stringify([{ store_revision: 7 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const store = new SupabaseServiceRuntimeStore({
      url: 'https://db.example',
      serviceKey: 'server-secret',
      fetchImpl,
    });

    await store.listSince('22222222-2222-2222-2222-222222222222', 4);
    expect(await store.revision('22222222-2222-2222-2222-222222222222')).toBe(7);

    const recordsUrl = new URL(urls[0]);
    expect(recordsUrl.searchParams.get('user_id')).toBe('eq.22222222-2222-2222-2222-222222222222');
    expect(recordsUrl.searchParams.get('server_revision')).toBe('gt.4');

    const revisionUrl = new URL(urls[1]);
    expect(revisionUrl.searchParams.get('user_id')).toBe('eq.22222222-2222-2222-2222-222222222222');
  });

  it('fails closed when server-only configuration is missing', () => {
    expect(() => new SupabaseServiceRuntimeStore({
      url: '',
      serviceKey: 'secret',
    })).toThrow('LIFE_OS_DATA_URL');

    expect(() => new SupabaseServiceRuntimeStore({
      url: 'https://db.example',
      serviceKey: '',
    })).toThrow('LIFE_OS_SERVICE_KEY');
  });
});
