import type { MediaStateStore } from '../../packages/core/src/media-state-store.js';
import type { PersonaMemoryRuleSource } from '../../packages/core/src/persona-state.js';
import { loadPersonaRules, persistPersonaRules } from './_persona-memory.js';
import { createMediaStateStore } from './_state.js';

type StoreFactory = (request: Request) => Promise<MediaStateStore | null>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function handlePersonaMemory(
  request: Request,
  createStore: StoreFactory = createMediaStateStore,
  now: () => string = () => new Date().toISOString(),
): Promise<Response> {
  const store = await createStore(request);
  if (request.method === 'GET') {
    return json({ rules: await loadPersonaRules(store), durable: Boolean(store) });
  }
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  if (!store) return json({ error: 'durable_memory_unavailable' }, 503);

  const body = await request.json().catch(() => null) as { rules?: unknown; source?: unknown } | null;
  const source: PersonaMemoryRuleSource | null = body?.source === 'explicit' || body?.source === 'inferred' ? body.source : null;
  if (!source) return json({ error: 'memory_source_required' }, 400);

  await persistPersonaRules(store, body?.rules, source, now());
  return json({ rules: await loadPersonaRules(store), durable: true });
}

export default { fetch: handlePersonaMemory };
