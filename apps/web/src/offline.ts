import { outcome } from './api';
import { enqueueOutcome, readOutbox, requireOutboxWriter, updatePendingOutcome } from './outbox';
import type { Item } from './types';

export function cacheToday(date: string, items: Item[]) {
  localStorage.setItem('life-os:today:' + date, JSON.stringify(items));
}
export function cachedToday(date: string): Item[] {
  try { return JSON.parse(localStorage.getItem('life-os:today:' + date) || '[]'); }
  catch { return []; }
}

/** All cloud commands use the same persisted ordering, online or offline.
 * A saved command awaiting sync is never described as a server acknowledgement.
 */
export async function submitQueuedOutcome(item: Item, command: 'complete' | 'not_complete',
  { online, items }: { online: boolean; items: Item[] }): Promise<'PENDING' | 'CONFIRMED'> {
  const idempotencyKey = crypto.randomUUID();
  await enqueueOutcome({ itemId: item.id, command, createdAt: new Date().toISOString(), idempotencyKey }, item);
  if (online) {
    try { await flush(items); }
    catch {
      // Enqueue has already succeeded. Preserve it for retry; do not tell the
      // caller that an action was never saved. Damaged storage still throws.
      return readOutbox().some(entry => entry.idempotencyKey === idempotencyKey) ? 'PENDING' : 'CONFIRMED';
    }
  }
  return readOutbox().some(entry => entry.idempotencyKey === idempotencyKey) ? 'PENDING' : 'CONFIRMED';
}

let inFlight: Promise<number> | undefined;
export function flush(items: Item[]): Promise<number> {
  if (inFlight) return inFlight;
  const run = () => flushPending(items);
  if (typeof navigator === 'undefined' || !navigator.locks)
    return Promise.reject(Error('Браузер не поддерживает безопасную синхронизацию между вкладками.'));
  // Separate from the short storage lock: enqueues can proceed during network I/O.
  const operation = requireOutboxWriter().then(() => navigator.locks.request('life-os:web-outbox:flush', run));
  inFlight = Promise.resolve(operation).finally(() => { inFlight = undefined; });
  return inFlight;
}

async function flushPending(items: Item[]): Promise<number> {
  const blockedItems = new Set<string>();
  for (const entry of readOutbox()) {
    if (blockedItems.has(entry.itemId)) continue;
    const item = entry.item ?? items.find(candidate => candidate.id === entry.itemId);
    if (!item || item.id !== entry.itemId || !item.planned_start ||
      !Number.isFinite(Date.parse(item.planned_start))) {
      blockedItems.add(entry.itemId);
      await updatePendingOutcome(entry, {
        ...entry, state: 'NEEDS_RESOLUTION',
        reason: item ? 'INVALID_ITEM_CONTEXT' : 'ITEM_NOT_IN_CURRENT_DAY',
      });
      continue;
    }
    // Persist the exact original request context before sending. Retries must
    // not pick up a different day, carry setting, timestamp or successor ID.
    const pending = {
      ...entry, item, idempotencyKey: entry.idempotencyKey ?? crypto.randomUUID(),
      state: 'PENDING' as const, reason: undefined,
    };
    if (!await updatePendingOutcome(entry, pending)) continue;
    try {
      await outcome(item, pending.command, pending);
    } catch (cause) {
      blockedItems.add(entry.itemId);
      await updatePendingOutcome(pending, {
        ...pending, state: 'FAILED',
        reason: cause instanceof Error ? cause.message : 'SYNC_FAILED',
      });
      continue;
    }
    // Only a matching server acknowledgement permits removing this entry.
    await updatePendingOutcome(pending);
  }
  return readOutbox().length;
}
