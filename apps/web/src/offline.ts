import { outcome } from './api';
import { readOutbox, updatePendingOutcome } from './outbox';
import type { Item } from './types';

export function cacheToday(date: string, items: Item[]) {
  localStorage.setItem('life-os:today:' + date, JSON.stringify(items));
}
export function cachedToday(date: string): Item[] {
  try { return JSON.parse(localStorage.getItem('life-os:today:' + date) || '[]'); }
  catch { return []; }
}

let inFlight: Promise<number> | undefined;
export function flush(items: Item[]): Promise<number> {
  if (inFlight) return inFlight;
  const run = () => flushPending(items);
  // Serialize participating tabs too, when browser Web Locks are available.
  const operation = typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('life-os:web-outbox:flush', run) : run();
  inFlight = Promise.resolve(operation).finally(() => { inFlight = undefined; });
  return inFlight;
}

async function flushPending(items: Item[]): Promise<number> {
  for (const entry of readOutbox()) {
    const item = entry.item ?? items.find(candidate => candidate.id === entry.itemId);
    if (!item || item.id !== entry.itemId || !item.planned_start ||
      !Number.isFinite(Date.parse(item.planned_start))) {
      updatePendingOutcome(entry, {
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
    updatePendingOutcome(entry, pending);
    try {
      await outcome(item, pending.command, pending);
    } catch (cause) {
      updatePendingOutcome(pending, {
        ...pending, state: 'FAILED',
        reason: cause instanceof Error ? cause.message : 'SYNC_FAILED',
      });
      continue;
    }
    // Only a matching server acknowledgement permits removing this entry.
    updatePendingOutcome(pending);
  }
  return readOutbox().length;
}
