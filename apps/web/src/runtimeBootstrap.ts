import type { Item } from './types';
import {
  pendingMutations,
  queueMutation,
  type SyncStorage,
} from './runtimeSync';

export type RemoteBootstrapState = 'not_started' | 'queued' | 'complete';

const BOOTSTRAP_KEY = 'life-os:remote-bootstrap:v1';
const BOOTSTRAP_PREFIX = 'bootstrap:';

export function remoteBootstrapState(storage: SyncStorage): RemoteBootstrapState {
  const raw = storage.getItem(BOOTSTRAP_KEY);
  return raw === 'queued' || raw === 'complete' ? raw : 'not_started';
}

export function queueLocalBootstrap(storage: SyncStorage, items: Item[]): number {
  if (remoteBootstrapState(storage) === 'complete') return 0;

  let queued = 0;
  for (const item of items) {
    if (typeof item.version === 'number') continue;
    const mutationId = `${BOOTSTRAP_PREFIX}${item.id}`;
    const before = pendingMutations(storage).length;
    queueMutation(storage, {
      mutationId,
      userId: 'self',
      recordId: item.id,
      kind: 'life_item',
      expectedVersion: null,
      payload: itemPayload(item),
      deleted: false,
      clientUpdatedAt: new Date().toISOString(),
    });
    if (pendingMutations(storage).length > before) queued += 1;
  }

  storage.setItem(BOOTSTRAP_KEY, 'queued');
  return queued;
}

export function completeRemoteBootstrapIfAcknowledged(storage: SyncStorage): boolean {
  const stillPending = pendingMutations(storage)
    .some((mutation) => mutation.mutationId.startsWith(BOOTSTRAP_PREFIX));
  if (stillPending) return false;
  storage.setItem(BOOTSTRAP_KEY, 'complete');
  return true;
}

function itemPayload(item: Item): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    status: item.status,
    planned_start: item.planned_start,
    planned_end: item.planned_end,
    carry_forward: item.carry_forward === true,
  };
}
