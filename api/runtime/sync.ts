import { json } from '../_media-session';
import {
  runtimeStoreFromEnv,
  type RuntimeMutationInput,
  type RuntimeRemoteStore,
} from './_store';

interface SyncRequestBody {
  mutations?: unknown;
  sinceRevision?: unknown;
}

export async function handleRuntimeSync(
  request: Request,
  store: RuntimeRemoteStore | null = runtimeStoreFromEnv(),
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  }

  if (!store) {
    return json({ error: 'runtime_not_configured' }, 503);
  }

  const accessToken = bearerToken(request);
  if (!accessToken) {
    return json({ error: 'authentication_required' }, 401);
  }

  let body: SyncRequestBody;
  try {
    body = await request.json() as SyncRequestBody;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const sinceRevision = normalizeRevision(body.sinceRevision);
  if (sinceRevision === null) {
    return json({ error: 'invalid_since_revision' }, 400);
  }

  if (!Array.isArray(body.mutations) || body.mutations.length > 100) {
    return json({ error: 'invalid_mutations' }, 400);
  }

  const mutations: RuntimeMutationInput[] = [];
  for (const raw of body.mutations) {
    const parsed = parseMutation(raw);
    if (!parsed) return json({ error: 'invalid_mutation' }, 400);
    mutations.push(parsed);
  }

  try {
    const results = [];
    for (const mutation of mutations) {
      results.push(await store.apply(accessToken, mutation));
    }

    const [records, storeRevision] = await Promise.all([
      store.listSince(accessToken, sinceRevision),
      store.revision(accessToken),
    ]);

    return json({ storeRevision, results, records });
  } catch (error) {
    console.error('runtime sync failed', error);
    return json({ error: 'runtime_sync_failed' }, 502);
  }
}

export default {
  fetch(request: Request) {
    return handleRuntimeSync(request);
  },
};

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeRevision(value: unknown): number | null {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function parseMutation(value: unknown): RuntimeMutationInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const kind = input.kind;
  const supportedKinds = new Set([
    'life_item',
    'life_outcome',
    'memory',
    'audit',
    'project',
    'goal',
    'setting',
  ]);

  if (typeof input.mutationId !== 'string' || !input.mutationId.trim()) return null;
  if (typeof input.recordId !== 'string' || !input.recordId.trim()) return null;
  if (typeof kind !== 'string' || !supportedKinds.has(kind)) return null;
  if (input.expectedVersion !== null
      && (typeof input.expectedVersion !== 'number'
        || !Number.isInteger(input.expectedVersion)
        || input.expectedVersion < 1)) return null;
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) return null;
  if (typeof input.deleted !== 'boolean') return null;

  return {
    mutationId: input.mutationId,
    recordId: input.recordId,
    kind: kind as RuntimeMutationInput['kind'],
    expectedVersion: input.expectedVersion as number | null,
    payload: input.payload as Record<string, unknown>,
    deleted: input.deleted,
  };
}
