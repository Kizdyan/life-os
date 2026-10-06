import { MediaStateStore } from '../../packages/core/src/media-state-store.js';
import { YandexDiskKeyValueStore } from '../../packages/core/src/yandex-kv-store.js';
import { DEFAULT_YANDEX_DISK_CONFIG } from '../../packages/core/src/yandex-disk.js';
import { resolveMediaStateToken } from './_state-token.js';

export async function createMediaStateStore(
  request: Request,
  options: { fetchImpl?: typeof fetch; now?: () => string } = {},
): Promise<MediaStateStore | null> {
  const token = await resolveMediaStateToken(request);
  if (!token) return null;

  const kv = new YandexDiskKeyValueStore({
    oauthToken: token,
    rootPath: DEFAULT_YANDEX_DISK_CONFIG.rootPath,
    fetchImpl: options.fetchImpl,
  });

  return new MediaStateStore({
    kv,
    now: options.now ?? (() => new Date().toISOString()),
  });
}
