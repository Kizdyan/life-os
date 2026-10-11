import { json } from '../_media-session.js';
import { callEdgeRuntime, readEdgeSessionToken } from './_edge.js';

export async function handleEdgeSync(
  request: Request,
  edgeUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const token = readEdgeSessionToken(request);
  if (!token) return json({ error: 'authentication_required' }, 401);

  let body: { mutations?: unknown; sinceRevision?: unknown };
  try {
    body = await request.json() as { mutations?: unknown; sinceRevision?: unknown };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!Array.isArray(body.mutations) || body.mutations.length > 100) {
    return json({ error: 'invalid_mutations' }, 400);
  }
  if (body.sinceRevision !== undefined
      && (typeof body.sinceRevision !== 'number'
        || !Number.isInteger(body.sinceRevision)
        || body.sinceRevision < 0)) {
    return json({ error: 'invalid_since_revision' }, 400);
  }

  try {
    const edgeResponse = await callEdgeRuntime(edgeUrl, {
      op: 'sync',
      token,
      mutations: body.mutations,
      sinceRevision: body.sinceRevision ?? 0,
    }, fetchImpl);
    const text = await edgeResponse.text();
    const headers = new Headers({
      'Content-Type': edgeResponse.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    });
    return new Response(text, { status: edgeResponse.status, headers });
  } catch {
    return json({ error: 'runtime_sync_failed' }, 502);
  }
}
