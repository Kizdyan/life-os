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
let writerOwnership: Promise<void> | undefined;

/** One writer document avoids unproven cross-renderer localStorage consistency. */
export function requireOutboxWriter(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks)
    return Promise.reject(Error('Браузер не поддерживает безопасную синхронизацию между вкладками. Изменение не сохранено.'));
  if (!writerOwnership) {
    writerOwnership = new Promise<void>((resolve, reject) => {
      void navigator.locks.request('life-os:web-outbox:writer', { ifAvailable: true }, async lock => {
        if (!lock) {
          reject(Error('Очередь синхронизации открыта в другой вкладке. Закрой её, перезагрузи эту вкладку и повтори действие. Изменение не сохранено.'));
          return;
        }
        resolve();
        // Browser releases this admission lock when the document is destroyed.
        // Never hand off a writer to an existing renderer with a stale snapshot.
        await new Promise<void>(() => {});
      }).catch(reject);
    });
  }
  return writerOwnership;
}

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

/** Serialize every read/modify/write across tabs, without holding a lock over network I/O. */
async function mutateOutbox<T>(change: (queue: PendingOutcome[]) => T): Promise<T> {
  await requireOutboxWriter();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await navigator.locks.request('life-os:web-outbox:storage', { signal: controller.signal }, () => {
      const queue = readOutbox();
      const result = change(queue);
      localStorage.setItem(KEY, JSON.stringify(queue));
      return result;
    });
  } finally { clearTimeout(timeout); }
}

export async function enqueueOutcome(x: PendingOutcome, item?: Item): Promise<void> {
  await mutateOutbox(queue => {
    if (x.idempotencyKey && queue.some(entry => entry.idempotencyKey === x.idempotencyKey)) return;
    queue.push({
      ...x, idempotencyKey: x.idempotencyKey ?? crypto.randomUUID(),
      ...(item ? { item: { ...item } } : {}), state: 'PENDING',
    });
  });
}

/** Modify only this entry, re-reading storage inside the common mutation lock. */
export async function updatePendingOutcome(previous: PendingOutcome, next?: PendingOutcome): Promise<boolean> {
  return mutateOutbox(queue => {
    const index = queue.findIndex(entry => previous.idempotencyKey
      ? entry.idempotencyKey === previous.idempotencyKey
      : !entry.idempotencyKey && entry.itemId === previous.itemId &&
        entry.command === previous.command && entry.createdAt === previous.createdAt);
    if (index < 0) return false;
    if (next) queue[index] = next;
    else queue.splice(index, 1);
    return true;
  });
}
