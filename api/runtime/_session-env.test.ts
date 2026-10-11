import { afterEach, describe, expect, it } from 'vitest';
import { runtimeSessionConfigFromEnv } from './_session.js';

const keys = [
  'LIFE_OS_OWNER_ID',
  'LIFE_OS_OWNER_PASSCODE_SHA256',
  'LIFE_OS_SESSION_SECRET',
  'LIFE_OS_SERVICE_KEY',
] as const;

const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('runtime session env', () => {
  it('derives the cookie encryption secret from the server-only service key when no explicit session secret is set', () => {
    process.env.LIFE_OS_OWNER_ID = '11111111-1111-1111-1111-111111111111';
    process.env.LIFE_OS_OWNER_PASSCODE_SHA256 = 'a'.repeat(64);
    process.env.LIFE_OS_SERVICE_KEY = 'sb_secret_test_high_entropy_server_key_123456789';
    delete process.env.LIFE_OS_SESSION_SECRET;

    const config = runtimeSessionConfigFromEnv();

    expect(config).not.toBeNull();
    expect(config?.sessionSecret).toBe('life-os-owner-session:v1:sb_secret_test_high_entropy_server_key_123456789');
  });

  it('prefers an explicit session secret when one is configured', () => {
    process.env.LIFE_OS_OWNER_ID = '11111111-1111-1111-1111-111111111111';
    process.env.LIFE_OS_OWNER_PASSCODE_SHA256 = 'b'.repeat(64);
    process.env.LIFE_OS_SERVICE_KEY = 'sb_secret_test_high_entropy_server_key_123456789';
    process.env.LIFE_OS_SESSION_SECRET = 'explicit-session-secret-that-is-definitely-long-enough';

    const config = runtimeSessionConfigFromEnv();

    expect(config?.sessionSecret).toBe('explicit-session-secret-that-is-definitely-long-enough');
  });
});
