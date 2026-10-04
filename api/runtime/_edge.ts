const COOKIE_NAME = 'lifeos_session';

export function edgeRuntimeUrlFromEnv(): string {
  return (process.env.LIFE_OS_EDGE_RUNTIME_URL ?? '').trim();
}

export function readEdgeSessionToken(request: Request): string | null {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

export function createEdgeSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}

export function clearEdgeSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function callEdgeRuntime(
  edgeUrl: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(edgeUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchEdgeHealth(
  edgeUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(edgeUrl);
  url.searchParams.set('health', '1');
  return fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}
