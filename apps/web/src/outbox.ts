import type { Item } from './types';

// Keep the original array/key and required fields readable by older clients.
export interface PendingOutcome {
  itemId: string;
  command: 'complete' | 'not_complete';
  createdAt: string;
  idempotencyKey?: string;
  item?: Item;
  state?: 'PENDING' | 'NEEDS_RESOLUTION' | 'FAILED';
  reason?: string;
}
const KEY = 'life-os:web-outbox';
export function readOutbox(): PendingOutcome[] {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return [];
  // Never interpret damaged persisted data as an empty queue and overwrite it.
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(x => !x || typeof x.itemId !== 'string' ||
    !['complete', 'not_complete'].includes(x.command) || typeof x.createdAt !== 'string'))
    throw Error('Некорректная очередь синхронизации. Исходные данные сохранены.');
  return value;
}
export function enqueueOutcome(x: PendingOutcome, item?: Item) {
  const queue = readOutbox();
  if (x.idempotencyKey && queue.some(entry => entry.idempotencyKey === x.idempotencyKey)) return;
  replaceOutbox([...queue, {
    ...x, idempotencyKey: x.idempotencyKey ?? crypto.randomUUID(),
    ...(item ? { item: { ...item } } : {}), state: 'PENDING',
  }]);
}
export function replaceOutbox(xs: PendingOutcome[]) {
  localStorage.setItem(KEY, JSON.stringify(xs));
}

/** Modify only this entry, re-reading storage to preserve later enqueues. */
export function updatePendingOutcome(previous: PendingOutcome, next?: PendingOutcome) {
  const queue = readOutbox();
  const index = queue.findIndex(entry => previous.idempotencyKey
    ? entry.idempotencyKey === previous.idempotencyKey
    : !entry.idempotencyKey && entry.itemId === previous.itemId &&
      entry.command === previous.command && entry.createdAt === previous.createdAt);
  if (index < 0) return;
  if (next) queue[index] = next;
  else queue.splice(index, 1);
  replaceOutbox(queue);
}
