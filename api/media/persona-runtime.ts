import type { MediaStateStore } from '../../packages/core/src/media-state-store.js';
import { loadPersonaRules, persistPersonaRules } from './_persona-memory.js';
import { createMediaStateStore } from './_state.js';
import persona from './persona.js';

type StoreFactory = (request: Request) => Promise<MediaStateStore | null>;
type Delegate = (request: Request) => Promise<Response>;

export interface PersonaRuntimeDeps {
  createStore?: StoreFactory;
  delegate?: Delegate;
  now?: () => string;
}

export async function handlePersonaRuntime(
  request: Request,
  deps: PersonaRuntimeDeps = {},
): Promise<Response> {
  const createStore = deps.createStore ?? createMediaStateStore;
  const delegate = deps.delegate ?? ((nextRequest: Request) => persona.fetch(nextRequest));
  const now = deps.now ?? (() => new Date().toISOString());
  const contentType = request.headers.get('content-type') ?? '';

  if (request.method !== 'POST' || contentType.includes('multipart/form-data')) {
    return delegate(request);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.clone().json() as Record<string, unknown>;
  } catch {
    return delegate(request);
  }

  const action = String(body.action ?? 'revise');
  if (action !== 'generate' && action !== 'revise') {
    return delegate(request);
  }

  const store = await createStore(request);
  const memory = await loadPersonaRules(store);
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  const canonicalRequest = new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, memory }),
  });

  const response = await delegate(canonicalRequest);
  if (!response.ok || !store) return response;

  const result = await response.clone().json().catch(() => null) as { learnedRules?: unknown } | null;
  if (Array.isArray(result?.learnedRules)) {
    await persistPersonaRules(
      store,
      result.learnedRules,
      action === 'revise' ? 'explicit' : 'inferred',
      now(),
    );
  }

  return response;
}

export default {
  fetch(request: Request) {
    return handlePersonaRuntime(request);
  },
};
