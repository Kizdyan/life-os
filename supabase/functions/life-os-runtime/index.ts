import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OWNER_ID = 'b48182e1-0802-4741-89a1-bba6341cb8c8';
const OWNER_PASSCODE_SHA256 = '7b9f92d5fff6262ad5ccecfd3c5e7e3eb2cf7cdc4af06804d27f90bf3defcafb';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type RuntimeEnv = { url: string; serviceKey: string };
type Session = { userId: string; issuedAt: number; expiresAt: number };
type MutationInput = {
  mutationId: string;
  recordId: string;
  kind: 'life_item' | 'life_outcome' | 'memory' | 'audit' | 'project' | 'goal' | 'setting';
  expectedVersion: number | null;
  payload: Record<string, unknown>;
  deleted: boolean;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    return url.searchParams.get('health') === '1'
      ? health()
      : json({ error: 'method_not_allowed' }, 405, { Allow: 'POST, GET' });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST, GET' });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  switch (body.op) {
    case 'login': return login(body.passcode);
    case 'status': return status(body.token);
    case 'health': return health();
    case 'sync': return sync(body.token, body.mutations, body.sinceRevision);
    default: return json({ error: 'unsupported_operation' }, 400);
  }
});

async function login(rawPasscode: unknown): Promise<Response> {
  if (typeof rawPasscode !== 'string' || !rawPasscode.trim()) return json({ error: 'passcode_required' }, 400);
  const actual = await sha256Hex(rawPasscode.trim());
  if (!constantTimeEqual(actual, OWNER_PASSCODE_SHA256)) return json({ error: 'invalid_credentials' }, 401);
  const now = Date.now();
  const token = await seal({ userId: OWNER_ID, issuedAt: now, expiresAt: now + SESSION_MAX_AGE_MS });
  return json({ authenticated: true, token });
}

async function status(rawToken: unknown): Promise<Response> {
  return json({ authenticated: Boolean(await verifySession(rawToken)) });
}

async function health(): Promise<Response> {
  const runtime = runtimeEnv();
  if (!runtime) return json({ configured: false, databaseReachable: false, storeRevision: null }, 503);
  try {
    const revision = await readRevision(runtime);
    return json({ configured: true, databaseReachable: true, storeRevision: revision });
  } catch {
    return json({ configured: true, databaseReachable: false, storeRevision: null }, 502);
  }
}

async function sync(rawToken: unknown, rawMutations: unknown, rawSinceRevision: unknown): Promise<Response> {
  const session = await verifySession(rawToken);
  if (!session) return json({ error: 'authentication_required' }, 401);
  const runtime = runtimeEnv();
  if (!runtime) return json({ error: 'runtime_not_configured' }, 503);
  if (!Array.isArray(rawMutations) || rawMutations.length > 100) return json({ error: 'invalid_mutations' }, 400);
  const sinceRevision = normalizeRevision(rawSinceRevision);
  if (sinceRevision === null) return json({ error: 'invalid_since_revision' }, 400);

  const mutations: MutationInput[] = [];
  for (const raw of rawMutations) {
    const parsed = parseMutation(raw);
    if (!parsed) return json({ error: 'invalid_mutation' }, 400);
    mutations.push(parsed);
  }

  try {
    const results = [];
    for (const mutation of mutations) results.push(await applyMutation(runtime, session.userId, mutation));
    const [records, storeRevision] = await Promise.all([
      listSince(runtime, session.userId, sinceRevision),
      readRevision(runtime, session.userId),
    ]);
    return json({ storeRevision, results, records });
  } catch (error) {
    console.error('edge runtime sync failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'runtime_sync_failed' }, 502);
  }
}

function runtimeEnv(): RuntimeEnv | null {
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  return url && serviceKey ? { url, serviceKey } : null;
}

async function applyMutation(runtime: RuntimeEnv, userId: string, mutation: MutationInput): Promise<unknown> {
  const response = await fetch(`${runtime.url}/rest/v1/rpc/life_runtime_apply_mutation_server`, {
    method: 'POST',
    headers: serviceHeaders(runtime.serviceKey),
    body: JSON.stringify({
      p_user_id: userId,
      p_mutation_id: mutation.mutationId,
      p_record_id: mutation.recordId,
      p_kind: mutation.kind,
      p_expected_version: mutation.expectedVersion,
      p_payload: mutation.payload,
      p_deleted: mutation.deleted,
    }),
  });
  if (!response.ok) throw new Error(`mutation:${response.status}`);
  return response.json();
}

async function listSince(runtime: RuntimeEnv, userId: string, sinceRevision: number): Promise<unknown[]> {
  const url = new URL(`${runtime.url}/rest/v1/life_runtime_records`);
  url.searchParams.set('select', 'record_id,user_id,kind,version,payload,deleted,updated_at,server_revision');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('server_revision', `gt.${Math.max(0, Math.floor(sinceRevision))}`);
  url.searchParams.set('order', 'server_revision.asc');
  const response = await fetch(url, { headers: serviceHeaders(runtime.serviceKey) });
  if (!response.ok) throw new Error(`snapshot:${response.status}`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.record_id),
    userId: String(row.user_id),
    kind: row.kind,
    version: Number(row.version),
    payload: row.payload ?? {},
    deleted: Boolean(row.deleted),
    updatedAt: String(row.updated_at),
  }));
}

async function readRevision(runtime: RuntimeEnv, userId = OWNER_ID): Promise<number> {
  const url = new URL(`${runtime.url}/rest/v1/life_runtime_state`);
  url.searchParams.set('select', 'store_revision');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: serviceHeaders(runtime.serviceKey) });
  if (!response.ok) throw new Error(`revision:${response.status}`);
  const rows = await response.json() as Array<{ store_revision?: number }>;
  return Number(rows[0]?.store_revision ?? 0);
}

function serviceHeaders(serviceKey: string): Record<string, string> {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

function parseMutation(value: unknown): MutationInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const kinds = new Set(['life_item', 'life_outcome', 'memory', 'audit', 'project', 'goal', 'setting']);
  if (typeof input.mutationId !== 'string' || !input.mutationId.trim()) return null;
  if (typeof input.recordId !== 'string' || !input.recordId.trim()) return null;
  if (typeof input.kind !== 'string' || !kinds.has(input.kind)) return null;
  if (input.expectedVersion !== null && (typeof input.expectedVersion !== 'number' || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)) return null;
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) return null;
  if (typeof input.deleted !== 'boolean') return null;
  return {
    mutationId: input.mutationId,
    recordId: input.recordId,
    kind: input.kind as MutationInput['kind'],
    expectedVersion: input.expectedVersion as number | null,
    payload: input.payload as Record<string, unknown>,
    deleted: input.deleted,
  };
}

function normalizeRevision(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

async function verifySession(rawToken: unknown): Promise<Session | null> {
  if (typeof rawToken !== 'string' || !rawToken) return null;
  try {
    const session = await unseal<Session>(rawToken);
    if (session.userId !== OWNER_ID) return null;
    if (!Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt)) return null;
    if (session.issuedAt <= 0 || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

async function seal(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionKey();
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(cipher))}`;
}

async function unseal<T>(token: string): Promise<T> {
  const [ivPart, cipherPart] = token.split('.');
  if (!ivPart || !cipherPart) throw new Error('invalid token');
  const key = await sessionKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(ivPart) }, key, fromBase64Url(cipherPart));
  return JSON.parse(decoder.decode(plain)) as T;
}

async function sessionKey(): Promise<CryptoKey> {
  const runtime = runtimeEnv();
  if (!runtime) throw new Error('runtime not configured');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`life-os-edge-session-v1:${runtime.serviceKey}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(normalized + padding);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

function json(payload: unknown, status = 200, headersInit?: HeadersInit): Response {
  const headers = new Headers(headersInit);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { status, headers });
}
