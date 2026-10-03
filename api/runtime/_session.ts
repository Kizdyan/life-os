const COOKIE_NAME = 'lifeos_session';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface RuntimeSession {
  userId: string;
  issuedAt: number;
}

export interface RuntimeSessionConfig {
  userId: string;
  passcodeSha256: string;
  sessionSecret: string;
}

export function runtimeSessionConfigFromEnv(): RuntimeSessionConfig | null {
  const userId = (process.env.LIFE_OS_OWNER_ID ?? '').trim();
  const passcodeSha256 = (process.env.LIFE_OS_OWNER_PASSCODE_SHA256 ?? '').trim().toLowerCase();
  const explicitSessionSecret = (process.env.LIFE_OS_SESSION_SECRET ?? '').trim();
  const serviceKey = (process.env.LIFE_OS_SERVICE_KEY ?? '').trim();
  const sessionSecret = explicitSessionSecret || (serviceKey ? `life-os-owner-session:v1:${serviceKey}` : '');
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  if (!/^[0-9a-f]{64}$/.test(passcodeSha256)) return null;
  if (sessionSecret.length < 32) return null;
  return { userId, passcodeSha256, sessionSecret };
}

export async function verifyOwnerPasscode(passcode: string, config: RuntimeSessionConfig): Promise<boolean> {
  const actual = await sha256Hex(passcode);
  return constantTimeEqual(actual, config.passcodeSha256);
}

export async function createRuntimeSessionCookie(config: RuntimeSessionConfig): Promise<string> {
  const payload: RuntimeSession = { userId: config.userId, issuedAt: Date.now() };
  const token = await seal(payload, config.sessionSecret);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}

export function clearRuntimeSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function runtimeSessionFromRequest(
  request: Request,
  config: RuntimeSessionConfig,
): Promise<RuntimeSession | null> {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  try {
    const session = await unseal<RuntimeSession>(token, config.sessionSecret);
    if (session.userId !== config.userId) return null;
    if (!Number.isFinite(session.issuedAt) || session.issuedAt <= 0) return null;
    return session;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', asArrayBuffer(encoder.encode(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function seal(value: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(secret);
  const plain = encoder.encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asArrayBuffer(iv) }, key, asArrayBuffer(plain));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(cipher))}`;
}

async function unseal<T>(token: string, secret: string): Promise<T> {
  const [ivPart, cipherPart] = token.split('.');
  if (!ivPart || !cipherPart) throw new Error('invalid session');
  const iv = fromBase64Url(ivPart);
  const cipher = fromBase64Url(cipherPart);
  const key = await aesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asArrayBuffer(iv) }, key, asArrayBuffer(cipher));
  return JSON.parse(decoder.decode(plain)) as T;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', asArrayBuffer(encoder.encode(secret)));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
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
