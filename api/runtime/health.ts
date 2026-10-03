import { json } from '../_media-session.js';
import { runtimeStoreFromEnv, type RuntimeRemoteStore } from './_store.js';
import { runtimeSessionConfigFromEnv } from './_session.js';

export interface RuntimeHealthContext {
  store: RuntimeRemoteStore | null;
  userId: string | null;
  configured: boolean;
}

export async function handleRuntimeHealth(
  request: Request,
  override?: RuntimeHealthContext,
): Promise<Response> {
  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }

  const context = override ?? contextFromEnv();
  if (!context.configured || !context.store || !context.userId) {
    return json({
      configured: false,
      databaseReachable: false,
      storeRevision: null,
    }, 503);
  }

  try {
    const storeRevision = await context.store.revision(context.userId);
    return json({
      configured: true,
      databaseReachable: true,
      storeRevision,
    });
  } catch (error) {
    console.error('runtime health check failed', error);
    return json({
      configured: true,
      databaseReachable: false,
      storeRevision: null,
    }, 503);
  }
}

export default {
  fetch(request: Request) {
    return handleRuntimeHealth(request);
  },
};

function contextFromEnv(): RuntimeHealthContext {
  const store = runtimeStoreFromEnv();
  const session = runtimeSessionConfigFromEnv();
  return {
    store,
    userId: session?.userId ?? null,
    configured: Boolean(store && session),
  };
}
