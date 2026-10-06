import { describe, expect, it } from 'vitest';
import { MediaStateStore } from '../../packages/core/src/media-state-store.js';
import { YandexDiskKeyValueStore } from '../../packages/core/src/yandex-kv-store.js';

describe('core -> API compilation boundary', () => {
  it('allows API code to consume the canonical Media Brain stores', () => {
    expect(MediaStateStore).toBeTypeOf('function');
    expect(YandexDiskKeyValueStore).toBeTypeOf('function');
  });
});
