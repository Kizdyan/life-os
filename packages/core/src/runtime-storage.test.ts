import { describe, expect, it } from 'vitest';
import { InMemoryDurableRuntimeStore } from './runtime-storage';

const mutation = (overrides: Partial<Parameters<InMemoryDurableRuntimeStore['apply']>[0]> = {}) => ({
  mutationId: 'm-1',
  userId: 'user-1',
  recordId: 'item-1',
  kind: 'life_item' as const,
  expectedVersion: null,
  payload: { title: 'Репетиция' },
  deleted: false,
  clientUpdatedAt: '2026-10-02T20:00:00.000Z',
  ...overrides,
});

describe('durable runtime storage', () => {
  it('creates a canonical record with monotonic record and store revisions', async () => {
    const store = new InMemoryDurableRuntimeStore(() => '2026-10-02T20:01:00.000Z');

    const first = await store.apply(mutation());
    const second = await store.apply(mutation({
      mutationId: 'm-2',
      expectedVersion: 1,
      payload: { title: 'Репетиция', note: 'Большая сцена' },
    }));

    expect(first.status).toBe('applied');
    expect(first.record?.version).toBe(1);
    expect(first.storeRevision).toBe(1);
    expect(second.status).toBe('applied');
    expect(second.record?.version).toBe(2);
    expect(second.storeRevision).toBe(2);
  });

  it('replays the same mutation idempotently without incrementing revisions', async () => {
    const store = new InMemoryDurableRuntimeStore(() => '2026-10-02T20:01:00.000Z');
    const input = mutation();

    const first = await store.apply(input);
    const replay = await store.apply(input);

    expect(first.status).toBe('applied');
    expect(replay.status).toBe('duplicate');
    expect(replay.record).toEqual(first.record);
    expect(replay.storeRevision).toBe(first.storeRevision);
  });

  it('returns an explicit conflict when a stale client writes an old version', async () => {
    const store = new InMemoryDurableRuntimeStore(() => '2026-10-02T20:01:00.000Z');
    await store.apply(mutation());
    await store.apply(mutation({ mutationId: 'm-2', expectedVersion: 1, payload: { title: 'Версия 2' } }));

    const stale = await store.apply(mutation({ mutationId: 'm-3', expectedVersion: 1, payload: { title: 'Старая версия' } }));

    expect(stale.status).toBe('conflict');
    expect(stale.conflict).toEqual({ expectedVersion: 1, currentVersion: 2 });
    expect(stale.record?.payload).toEqual({ title: 'Версия 2' });
  });

  it('isolates records by user id', async () => {
    const store = new InMemoryDurableRuntimeStore(() => '2026-10-02T20:01:00.000Z');
    await store.apply(mutation());

    expect(await store.read('user-1', 'item-1')).not.toBeNull();
    expect(await store.read('user-2', 'item-1')).toBeNull();
  });
});
