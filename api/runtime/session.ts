import { json } from '../_media-session';
import {
  clearRuntimeSessionCookie,
  createRuntimeSessionCookie,
  runtimeSessionConfigFromEnv,
  runtimeSessionFromRequest,
  verifyOwnerPasscode,
  type RuntimeSessionConfig,
} from './_session';

export async function handleRuntimeSession(
  request: Request,
  config: RuntimeSessionConfig | null = runtimeSessionConfigFromEnv(),
): Promise<Response> {
  if (!config) return json({ configured: false, authenticated: false }, 503);

  if (request.method === 'GET') {
    const session = await runtimeSessionFromRequest(request, config);
    return json({ configured: true, authenticated: Boolean(session) });
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
