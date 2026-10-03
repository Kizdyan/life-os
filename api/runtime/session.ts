import { json } from '../_media-session.js';
import {
  clearRuntimeSessionCookie,
  createRuntimeSessionCookie,
  runtimeSessionConfigFromEnv,
  runtimeSessionFromRequest,
  verifyOwnerPasscode,
  type RuntimeSessionConfig,
} from './_session.js';
import { runtimeStoreFromEnv, type RuntimeRemoteStore } from './_store.js';

export async function handleRuntimeSession(
  request: Request,
  config: RuntimeSessionConfig | null = runtimeSessionConfigFromEnv(),
  store: RuntimeRemoteStore | null = runtimeStoreFromEnv(),
): Promise<Response> {
  const healthRequested = request.method === 'GET'
    && new URL(request.url).searchParams.get('health') === '1';

  if (!config) {
    if (healthRequested) {
      return json({
        configured: false,
        authenticated: false,
        databaseReachable: false,
        storeRevision: null,
      }, 503);
    }
    return json({ configured: false, authenticated: false }, 503);
  }

  if (request.method === 'GET') {
    const session = await runtimeSessionFromRequest(request, config);
    const authenticated = Boolean(session);

    if (!healthRequested) {
      return json({ configured: true, authenticated });
    }

    if (!store) {
      return json({
        configured: false,
        authenticated,
        databaseReachable: false,
        storeRevision: null,
      }, 503);
    }

    try {
      const storeRevision = await store.revision(config.userId);
      return json({
        configured: true,
        authenticated,
        databaseReachable: true,
        storeRevision,
      });
    } catch (error) {
      console.error('runtime health check failed', error);
      return json({
        configured: true,
        authenticated,
        databaseReachable: false,
        storeRevision: null,
      }, 503);
    }
  }

  if (request.method === 'POST') {
    let body: { passcode?: unknown };
    try {
      body = await request.json() as { passcode?: unknown };
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    if (typeof body.passcode !== 'string' || !body.passcode) {
      return json({ error: 'passcode_required' }, 400);
    }

    if (!(await verifyOwnerPasscode(body.passcode, config))) {
      return json({ error: 'invalid_credentials' }, 401);
    }

    const headers = new Headers();
    headers.append('Set-Cookie', await createRuntimeSessionCookie(config));
    return json({ configured: true, authenticated: true }, 200, headers);
  }

  if (request.method === 'DELETE') {
    const headers = new Headers();
    headers.append('Set-Cookie', clearRuntimeSessionCookie());
    return json({ configured: true, authenticated: false }, 200, headers);
  }

  return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST, DELETE' });
}

export default {
  fetch(request: Request) {
    return handleRuntimeSession(request);
  },
};
