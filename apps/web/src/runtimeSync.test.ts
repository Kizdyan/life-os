import { describe, expect, it } from 'vitest';
import {
  expectedVersionAfterPendingMutation,
  pendingMutations,
  queueMutation,
  readRuntimeConflicts,
  resolveRuntimeConflicts,
  syncLocalReplica,
  type RemoteLifeOsGateway,
  type RuntimeSyncMutation,
  type SyncStorage,
} from './runtimeSync';

class MemoryStorage implements SyncStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const mutation = (id = 'm-1'): RuntimeSyncMutation => ({
  mutationId: id,
  userId: 'user-1',
  recordId: 'item-1',
  kind: 'life_item',
  expectedVersion: null,
  payload: { id: 'item-1', title: 'Зал', status: 'planned' },
  deleted: false,
  clientUpdatedAt: '2026-10-02T20:00:00.000Z',
});

describe('offline-first runtime sync', () => {
  it('queues local mutations durably and de-duplicates by mutation id', () => {
    const storage = new MemoryStorage();
    queueMutation(storage, mutation());
    queueMutation(storage, mutation());
    queueMutation(storage, mutation('m-2'));

    expect(pendingMutations(storage).map((item) => item.mutationId)).toEqual(['m-1', 'm-2']);
  });

  it('predicts the version an acknowledged-or-pending mutation will produce for safe compensation', () => {
    expect(expectedVersionAfterPendingMutation({ ...mutation(), expectedVersion: null }, null)).toBe(1);
    expect(expectedVersionAfterPendingMutation({ ...mutation(), expectedVersion: 7 }, 7)).toBe(8);
    expect(expectedVersionAfterPendingMutation(undefined, 8)).toBe(8);
    expect(expectedVersionAfterPendingMutation(undefined, null)).toBeNull();
  });

  it('removes applied and duplicate mutations after remote confirmation', async () => {
    const storage = new MemoryStorage();
    queueMutation(storage, mutation('m-1'));
    queueMutation(storage, mutation('m-2'));
    const appliedRecords: unknown[] = [];

    const gateway: RemoteLifeOsGateway = {
      sync: async () => ({
        storeRevision: 2,
        results: [
          { mutationId: 'm-1', status: 'applied', storeRevision: 1, record: null, conflict: null },
          { mutationId: 'm-2', status: 'duplicate', storeRevision: 2, record: null, conflict: null },
        ],
        records: [{ id: 'item-1', userId: 'user-1', kind: 'life_item', version: 2, payload: { id: 'item-1', title: 'Зал' }, deleted: false, updatedAt: '2026-10-02T20:01:00.000Z' }],
      }),
    };

    const result = await syncLocalReplica(storage, gateway, (records) => appliedRecords.push(...records));

    expect(result.conflicts).toEqual([]);
    expect(result.storeRevision).toBe(2);
    expect(pendingMutations(storage)).toEqual([]);
    expect(readRuntimeConflicts(storage)).toEqual([]);
    expect(appliedRecords).toHaveLength(1);
  });

  it('keeps a stale mutation queued, persists the conflict, and applies the canonical conflict record locally', async () => {
    const storage = new MemoryStorage();
    queueMutation(storage, { ...mutation('m-stale'), expectedVersion: 1 });
    const appliedRecords: unknown[] = [];
    const canonical = {
      id: 'item-1',
      userId: 'user-1',
      kind: 'life_item' as const,
      version: 4,
      payload: { id: 'item-1', title: 'Новая версия', status: 'planned' },
      deleted: false,
      updatedAt: '2026-10-02T20:02:00.000Z',
    };

    const gateway: RemoteLifeOsGateway = {
      sync: async () => ({
        storeRevision: 5,
        results: [{
          mutationId: 'm-stale',
          status: 'conflict',
          storeRevision: 5,
          record: canonical,
          conflict: { expectedVersion: 1, currentVersion: 4 },
        }],
        records: [],
      }),
    };

    const result = await syncLocalReplica(storage, gateway, (records) => appliedRecords.push(...records));
    const expected = [{ mutationId: 'm-stale', expectedVersion: 1, currentVersion: 4 }];

    expect(result.conflicts).toEqual(expected);
    expect(readRuntimeConflicts(storage)).toEqual(expected);
    expect(pendingMutations(storage).map((item) => item.mutationId)).toEqual(['m-stale']);
    expect(appliedRecords).toEqual([canonical]);
  });

  it('accepts the canonical remote version by dropping only conflicted local mutations', () => {
    const storage = new MemoryStorage();
    queueMutation(storage, { ...mutation('m-stale'), expectedVersion: 1 });
    queueMutation(storage, { ...mutation('m-other'), recordId: 'item-2' });
    storage.setItem('life-os:runtime-conflicts:v1', JSON.stringify([
      { mutationId: 'm-stale', expectedVersion: 1, currentVersion: 4 },
    ]));

    const resolved = resolveRuntimeConflicts(storage, 'accept_remote');

    expect(resolved).toBe(1);
    expect(readRuntimeConflicts(storage)).toEqual([]);
    expect(pendingMutations(storage).map((item) => item.mutationId)).toEqual(['m-other']);
  });

  it('retries the local version explicitly by rebasing it onto the current remote version', () => {
    const storage = new MemoryStorage();
    queueMutation(storage, { ...mutation('m-stale'), expectedVersion: 1 });
    storage.setItem('life-os:runtime-conflicts:v1', JSON.stringify([
      { mutationId: 'm-stale', expectedVersion: 1, currentVersion: 4 },
    ]));

    const resolved = resolveRuntimeConflicts(
      storage,
      'retry_local',
      () => 'm-retry',
      () => '2026-10-03T07:00:00.000Z',
    );

    expect(resolved).toBe(1);
    expect(readRuntimeConflicts(storage)).toEqual([]);
    expect(pendingMutations(storage)).toEqual([{
      ...mutation('m-retry'),
      expectedVersion: 4,
      clientUpdatedAt: '2026-10-03T07:00:00.000Z',
    }]);
  });

  it('clears a previous conflict only after a later successful sync', async () => {
    const storage = new MemoryStorage();
    queueMutation(storage, { ...mutation('m-1'), expectedVersion: 1 });

    await syncLocalReplica(storage, {
      sync: async () => ({
        storeRevision: 2,
        results: [{
          mutationId: 'm-1',
          status: 'conflict',
          storeRevision: 2,
          record: null,
          conflict: { expectedVersion: 1, currentVersion: 2 },
        }],
        records: [],
      }),
    }, () => undefined);
    expect(readRuntimeConflicts(storage)).toHaveLength(1);

    await syncLocalReplica(storage, {
      sync: async () => ({
        storeRevision: 3,
        results: [{ mutationId: 'm-1', status: 'applied', storeRevision: 3, record: null, conflict: null }],
        records: [],
      }),
    }, () => undefined);

    expect(readRuntimeConflicts(storage)).toEqual([]);
    expect(pendingMutations(storage)).toEqual([]);
  });

  it('preserves the outbox when the network request fails', async () => {
    const storage = new MemoryStorage();
    queueMutation(storage, mutation());
    const gateway: RemoteLifeOsGateway = { sync: async () => { throw new Error('offline'); } };

    await expect(syncLocalReplica(storage, gateway, () => undefined)).rejects.toThrow('offline');
    expect(pendingMutations(storage)).toHaveLength(1);
  });
});
