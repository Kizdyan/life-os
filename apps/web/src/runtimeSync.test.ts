import { describe, expect, it } from 'vitest';
import {
  pendingMutations,
  queueMutation,
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
    expect(appliedRecords).toHaveLength(1);
  });

  it('keeps a stale mutation queued and surfaces an explicit conflict', async () => {
    const storage = new MemoryStorage();
    queueMutation(storage, mutation('m-stale'));

    const gateway: RemoteLifeOsGateway = {
      sync: async () => ({
        storeRevision: 5,
        results: [{
          mutationId: 'm-stale',
          status: 'conflict',
          storeRevision: 5,
          record: { id: 'item-1', userId: 'user-1', kind: 'life_item', version: 4, payload: { id: 'item-1', title: 'Новая версия' }, deleted: false, updatedAt: '2026-10-02T20:02:00.000Z' },
          conflict: { expectedVersion: 1, currentVersion: 4 },
        }],
        records: [],
      }),
    };

    const result = await syncLocalReplica(storage, gateway, () => undefined);

    expect(result.conflicts).toEqual([{ mutationId: 'm-stale', expectedVersion: 1, currentVersion: 4 }]);
    expect(pendingMutations(storage).map((item) => item.mutationId)).toEqual(['m-stale']);
  });

  it('preserves the outbox when the network request fails', async () => {
    const storage = new MemoryStorage();
    queueMutation(storage, mutation());
    const gateway: RemoteLifeOsGateway = { sync: async () => { throw new Error('offline'); } };

    await expect(syncLocalReplica(storage, gateway, () => undefined)).rejects.toThrow('offline');
    expect(pendingMutations(storage)).toHaveLength(1);
  });
});
