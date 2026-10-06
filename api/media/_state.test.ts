import { afterEach, describe, expect, it } from 'vitest';
import { MediaStateStore } from '../../packages/core/src/media-state-store.js';
import { createMediaStateStore } from './_state.js';

const savedToken = process.env.YANDEX_DISK_OAUTH_TOKEN;
afterEach(() => {
  if (savedToken === undefined) delete process.env.YANDEX_DISK_OAUTH_TOKEN;
  else process.env.YANDEX_DISK_OAUTH_TOKEN = savedToken;
});

describe('canonical MediaStateStore composition', () => {
  it('builds the canonical durable store from the server-side Yandex token', async () => {
    process.env.YANDEX_DISK_OAUTH_TOKEN = ' durable-token ';
    const request = new Request('https://life-os.test/api/media/state');

    expect(await createMediaStateStore(request)).toBeInstanceOf(MediaStateStore);
  });

  it('returns no store when the server has no durable or interactive Yandex session', async () => {
    delete process.env.YANDEX_DISK_OAUTH_TOKEN;
    delete process.env.MEDIA_COOKIE_SECRET;
    const request = new Request('https://life-os.test/api/media/state');

    expect(await createMediaStateStore(request)).toBeNull();
  });
});
