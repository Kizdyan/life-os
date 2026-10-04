import { json } from '../_media-session.js';
import {
  callEdgeRuntime,
  clearEdgeSessionCookie,
  createEdgeSessionCookie,
  fetchEdgeHealth,
  readEdgeSessionToken,
} from './_edge.js';

export async function handleEdgeSession(
  request: Request,
  edgeUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const healthRequested = request.method === 'GET'
    && new URL(request.url).searchParams.get('health') === '1';

  if (request.method === 'GET') {
    const token = readEdgeSessionToken(request);
    let authenticated = false;
    if (token) {
      try {
        const statusResponse = await callEdgeRuntime(edgeUrl, { op: 'status', token }, fetchImpl);
        if (statusResponse.ok) {
          const payload = await statusResponse.json() as { authenticated?: unknown };
          authenticated = payload.authenticated === true;
        }
      } catch {
        if (!healthRequested) return json({ configured: true, authenticated: false }, 503);
      }
    }

    if (!healthRequested) return json({ configured: true, authenticated });

    try {
      const healthResponse = await fetchEdgeHealth(edgeUrl, fetchImpl);
      const payload = await healthResponse.json() as {
        configured?: unknown;
        databaseReachable?: unknown;
        storeRevision?: unknown;
      };
      const databaseReachable = payload.databaseReachable === true;
      return json({
        configured: payload.configured === true,
        authenticated,
        databaseReachable,
        storeRevision: typeof payload.storeRevision === 'number' ? payload.storeRevision : null,
      }, healthResponse.ok && databaseReachable ? 200 : 503);
    } catch {
      return json({ configured: true, authenticated, databaseReachable: false, storeRevision: null }, 503);
    }
  }

  if (request.method === 'POST') {
    let body: { passcode?: unknown };
    try {
      body = await request.json() as { passcode?: unknown };
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
    if (typeof body.passcode !== 'string' || !body.passcode) return json({ error: 'passcode_required' }, 400);

    try {
      const edgeResponse = await callEdgeRuntime(edgeUrl, { op: 'login', passcode: body.passcode }, fetchImpl);
      if (edgeResponse.status === 401) return json({ error: 'invalid_credentials' }, 401);
      if (!edgeResponse.ok) return json({ error: 'runtime_not_configured' }, 503);
      const payload = await edgeResponse.json() as { token?: unknown; authenticated?: unknown };
      if (payload.authenticated !== true || typeof payload.token !== 'string' || !payload.token) {
        return json({ error: 'runtime_not_configured' }, 503);
      }
      const headers = new Headers();
      headers.append('Set-Cookie', createEdgeSessionCookie(payload.token));
      return json({ configured: true, authenticated: true }, 200, headers);
    } catch {
      return json({ error: 'runtime_not_configured' }, 503);
    }
  }

  if (request.method === 'DELETE') {
    const headers = new Headers();
    headers.append('Set-Cookie', clearEdgeSessionCookie());
    return json({ configured: true, authenticated: false }, 200, headers);
  }

  return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST, DELETE' });
}
