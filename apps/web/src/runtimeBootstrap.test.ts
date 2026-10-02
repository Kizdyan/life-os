import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import { pendingMutations, type SyncStorage } from './runtimeSync';
import {
  completeRemoteBootstrapIfAcknowledged,
  queueLocalBootstrap,
  remoteBootstrapState,
} from './runtimeBootstrap';

class MemoryStorage implements SyncStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const item = (id: string, version?: number): Item => ({
  id,
  title: id,
  kind: 'task',
  status: 'planned',
  planned_start: '2026-10-02T12:00:00+03:00',
  planned_end: null,
  version,
});

describe('remote bootstrap', () => {
  it('queues only local records that have never received a canonical version', () => {
    const storage = new MemoryStorage();
    const count = queueLocalBootstrap(storage, [item('local'), item('canonical', 3)]);

    expect(count).toBe(1);
    expect(pendingMutations(storage)).toMatchObject([
      {
        mutationId: 'bootstrap:local',
        recordId: 'local',
        expectedVersion: null,
        kind: 'life_item',
      },
    ]);
    expect(remoteBootstrapState(storage)).toBe('queued');
  });

  it('is idempotent while bootstrap mutations are waiting for the network', () => {
    const storage = new MemoryStorage();
    queueLocalBootstrap(storage, [item('one')]);
    queueLocalBootstrap(storage, [item('one')]);

    expect(pendingMutations(storage)).toHaveLength(1);
  });

  it('does not mark bootstrap complete until bootstrap mutations are acknowledged', () => {
    const storage = new MemoryStorage();
    queueLocalBootstrap(storage, [item('one')]);

    expect(completeRemoteBootstrapIfAcknowledged(storage)).toBe(false);
    expect(remoteBootstrapState(storage)).toBe('queued');
  });

  it('marks bootstrap complete when no bootstrap mutations remain', () => {
    const storage = new MemoryStorage();
    queueLocalBootstrap(storage, []);

    expect(completeRemoteBootstrapIfAcknowledged(storage)).toBe(true);
    expect(remoteBootstrapState(storage)).toBe('complete');
    expect(queueLocalBootstrap(storage, [item('later')])).toBe(0);
  });
});
