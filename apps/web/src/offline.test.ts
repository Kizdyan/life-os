import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from './types';

const KEY = 'life-os:web-outbox';
const task: Item = {
  id: 'task-a', title: 'Walk', kind: 'task', status: 'planned',
  planned_start: '2026-11-20T09:00:00+03:00',
  planned_end: '2026-11-20T10:00:00+03:00', carry_forward: true,
};
const pending = { itemId: task.id, command: 'not_complete' as const, createdAt: '2026-11-20T10:01:00Z' };

function acknowledgement(body: Record<string, unknown>) {
  const status = body.p_command === 'complete' ? 'completed' : body.p_carry_forward ? 'missed_time' : 'not_completed';
  return new Response(JSON.stringify({ item_id: body.p_item_id, status, successor: body.p_carry_forward ? { id: body.p_successor_id } : null }));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function installMemoryLocks() {
  const tails = new Map<string, Promise<unknown>>();
  const held = new Set<string>();
  vi.stubGlobal('navigator', { locks: { request: (name: string, optionsOrRun: unknown, callback?: (lock: unknown) => unknown) => {
    const run = (callback ?? optionsOrRun) as (lock: unknown) => unknown;
    if ((optionsOrRun as { ifAvailable?: boolean })?.ifAvailable && held.has(name))
      return Promise.resolve(run(null));
    const result = (tails.get(name) ?? Promise.resolve()).then(async () => {
      held.add(name);
      try { return await run({ name }); }
      finally { held.delete(name); }
    });
    tails.set(name, result.catch(() => {}));
    return result;
  } } });
}
describe('offline outcome synchronization', () => {
  let values: Map<string, string>;
  let requests: Record<string, unknown>[];
  let send: (body: Record<string, unknown>) => Promise<Response>;
  let offline: typeof import('./offline');
  let outbox: typeof import('./outbox');

  beforeEach(async () => {
    vi.resetModules();
    installMemoryLocks();
    values = new Map();
    requests = [];
    installMemoryLocks();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://outbox.test');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    send = async body => acknowledgement(body);
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      requests.push(body);
      return send(body);
    });
    offline = await import('./offline');
    outbox = await import('./outbox');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('retains a legacy outcome absent from the current UI day with a persisted resolution reason', async () => {
    values.set(KEY, JSON.stringify([pending]));
    expect(await offline.flush([])).toBe(1);
    expect(outbox.readOutbox()).toEqual([expect.objectContaining({
      ...pending, state: 'NEEDS_RESOLUTION', reason: expect.any(String),
    })]);
    expect(requests).toHaveLength(0);
    vi.resetModules();
    installMemoryLocks();
    const reloaded = await import('./outbox');
    expect(reloaded.readOutbox()[0]).toMatchObject({ itemId: task.id, state: 'NEEDS_RESOLUTION' });
  });

  it('retries an unresolved legacy outcome when its day becomes available', async () => {
    await outbox.enqueueOutcome(pending);
    await offline.flush([]);
    expect(await offline.flush([task])).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ p_item_id: task.id, p_planned_date: '2026-11-20', p_carry_forward: true });
    expect(outbox.readOutbox()).toEqual([]);
  });

  it('sends a newly queued original-day snapshot after switching days and reloading', async () => {
    await outbox.enqueueOutcome(pending, task);
    vi.resetModules();
    installMemoryLocks();
    const reloaded = await import('./offline');
    expect(await reloaded.flush([{ ...task, id: 'tomorrow', planned_start: '2026-11-21T09:00:00+03:00' }])).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ p_item_id: task.id, p_planned_date: '2026-11-20', p_next_date: '2026-11-21' });
  });

  it('keeps an in-flight outcome persisted until the server confirms it', async () => {
    await outbox.enqueueOutcome(pending);
    const started = deferred(), response = deferred();
    send = async body => { started.resolve(); await response.promise; return acknowledgement(body); };
    const flushing = offline.flush([task]);
    await started.promise;
    expect(outbox.readOutbox()).toHaveLength(1);
    response.resolve();
    expect(await flushing).toBe(0);
    expect(outbox.readOutbox()).toEqual([]);
  });

  it('coalesces simultaneous flushes and a later flush does not resend an acknowledged outcome', async () => {
    await outbox.enqueueOutcome(pending);
    const started = deferred(), response = deferred();
    send = async body => { started.resolve(); await response.promise; return acknowledgement(body); };
    const first = offline.flush([task]);
    await started.promise;
    const second = offline.flush([task]);
    response.resolve();
    await Promise.all([first, second]);
    await offline.flush([task]);
    expect(requests).toHaveLength(1);
    expect(outbox.readOutbox()).toEqual([]);
  });

  it('preserves an outcome queued while an earlier outcome is being sent', async () => {
    await outbox.enqueueOutcome(pending);
    const started = deferred(), response = deferred();
    send = async body => { started.resolve(); await response.promise; return acknowledgement(body); };
    const flushing = offline.flush([task]);
    await started.promise;
    const later = { itemId: 'task-b', command: 'complete' as const, createdAt: '2026-11-20T10:02:00Z' };
    await outbox.enqueueOutcome(later);
    response.resolve();
    expect(await flushing).toBe(1);
    expect(outbox.readOutbox()).toEqual([expect.objectContaining(later)]);
  });

  it('keeps failed requests and later additions across reload before a successful retry', async () => {
    await outbox.enqueueOutcome(pending);
    send = async () => { await outbox.enqueueOutcome({ itemId: 'task-b', command: 'complete', createdAt: 'later' }); throw Error('offline'); };
    expect(await offline.flush([task])).toBe(2);
    expect(outbox.readOutbox().map(x => x.itemId)).toEqual(['task-a', 'task-b']);
    vi.resetModules();
    installMemoryLocks();
    const reloaded = await import('./offline');
    send = async body => acknowledgement(body);
    expect(await reloaded.flush([task])).toBe(1);
    expect(outbox.readOutbox()[0].itemId).toBe('task-b');
  });

  it('retains HTTP errors and invalid server acknowledgements for retry', async () => {
    await outbox.enqueueOutcome(pending);
    send = async () => new Response('service unavailable', { status: 503 });
    expect(await offline.flush([task])).toBe(1);
    send = async () => new Response('{');
    expect(await offline.flush([task])).toBe(1);
    expect(outbox.readOutbox()[0]).toMatchObject(pending);
  });
  it('reuses the persisted request after a failed send even if the item later moves days', async () => {
    await outbox.enqueueOutcome(pending);
    send = async () => { throw Error('response lost'); };
    expect(await offline.flush([task])).toBe(1);
    const saved = outbox.readOutbox()[0];
    expect(saved.idempotencyKey).toEqual(expect.any(String));
    send = async body => acknowledgement(body);
    vi.resetModules();
    installMemoryLocks();
    const reloaded = await import('./offline');
    expect(await reloaded.flush([{ ...task, carry_forward: false, planned_start: '2026-11-22T09:00:00+03:00' }])).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  });

  it('does not append the same identified operation twice', async () => {
    await outbox.enqueueOutcome({ ...pending, idempotencyKey: 'same-operation' }, task);
    await outbox.enqueueOutcome({ ...pending, idempotencyKey: 'same-operation' }, task);
    expect(outbox.readOutbox()).toHaveLength(1);
  });

  it('preserves damaged persisted data and refuses to overwrite it', async () => {
    for (const raw of ['{broken', '{}', '[null]']) {
      values.set(KEY, raw);
      await expect(offline.flush([task])).rejects.toThrow();
      await expect(outbox.enqueueOutcome(pending)).rejects.toThrow();
      expect(values.get(KEY)).toBe(raw);
    }
    expect(requests).toHaveLength(0);
  });

  it('does not guess a planned date for an outcome without stable item context', async () => {
    await outbox.enqueueOutcome(pending, { ...task, planned_start: null });
    expect(await offline.flush([task])).toBe(1);
    expect(requests).toHaveLength(0);
    expect(outbox.readOutbox()[0]).toMatchObject({ state: 'NEEDS_RESOLUTION', reason: expect.any(String) });
  });

  it('rejects a second writer runtime without resending the first writer outcome', async () => {
    await outbox.enqueueOutcome(pending, task);
    const started = deferred(), response = deferred();
    send = async body => { started.resolve(); await response.promise; return acknowledgement(body); };
    const first = offline.flush([task]);
    await started.promise;
    vi.resetModules();
    const otherTab = await import('./offline');
    await expect(otherTab.flush([task])).rejects.toThrow('другой вкладке');
    response.resolve();
    expect(await first).toBe(0);
    expect(requests).toHaveLength(1);
  });
  it('blocks newer commands of a failed item while allowing other items, then replays in order', async () => {
    await outbox.enqueueOutcome(pending, task);
    await outbox.enqueueOutcome({ ...pending, command: 'complete', createdAt: '2026-11-20T10:02:00Z' }, task);
    await outbox.enqueueOutcome({ itemId: 'task-b', command: 'complete', createdAt: '2026-11-20T10:03:00Z' }, { ...task, id: 'task-b' });
    send = async body => body.p_item_id === task.id
      ? new Response('unavailable', { status: 503 }) : acknowledgement(body);
    expect(await offline.flush([task])).toBe(2);
    expect(requests.map(body => [body.p_item_id, body.p_command])).toEqual([
      ['task-a', 'not_complete'], ['task-b', 'complete'],
    ]);
    expect(outbox.readOutbox().map(entry => entry.command)).toEqual(['not_complete', 'complete']);
    send = async body => acknowledgement(body);
    expect(await offline.flush([task])).toBe(0);
    expect(requests.slice(2).map(body => body.p_command)).toEqual(['not_complete', 'complete']);
  });

  it('queues a new online command behind a retained failed action, then confirms in original order', async () => {
    await outbox.enqueueOutcome(pending, task);
    send = async () => new Response('unavailable', { status: 503 });
    expect(await offline.flush([task])).toBe(1);
    expect(await offline.submitQueuedOutcome(task, 'complete', { online: true, items: [task] })).toBe('PENDING');
    expect(requests.map(body => body.p_command)).toEqual(['not_complete', 'not_complete']);
    expect(outbox.readOutbox().map(entry => entry.command)).toEqual(['not_complete', 'complete']);
    send = async body => acknowledgement(body);
    expect(await offline.flush([task])).toBe(0);
    expect(requests.slice(2).map(body => body.p_command)).toEqual(['not_complete', 'complete']);
  });

  it('rejects an online command in a second writer before network or queue changes', async () => {
    await outbox.enqueueOutcome(pending, task);
    const saved = values.get(KEY);
    vi.resetModules();
    const other = await import('./offline');
    await expect(other.submitQueuedOutcome(task, 'complete', { online: true, items: [task] })).rejects.toThrow('другой вкладке');
    expect(values.get(KEY)).toBe(saved);
    expect(requests).toHaveLength(0);
  });

  it('blocks newer commands behind an unresolved older command for the same item', async () => {
    await outbox.enqueueOutcome(pending);
    await outbox.enqueueOutcome({ ...pending, command: 'complete' }, task);
    expect(await offline.flush([])).toBe(2);
    expect(requests).toHaveLength(0);
    expect(await offline.flush([task])).toBe(0);
    expect(requests.map(body => body.p_command)).toEqual(['not_complete', 'complete']);
  });

  it('waits for the shared short storage lock before enqueue or acknowledgement writes', async () => {
    await outbox.enqueueOutcome(pending, task);
    const saved = outbox.readOutbox()[0];
    const entered = deferred(), release = deferred();
    const held = navigator.locks.request('life-os:web-outbox:storage', async () => {
      entered.resolve(); await release.promise;
    });
    await entered.promise;
    const adding = outbox.enqueueOutcome({ itemId: 'task-b', command: 'complete', createdAt: 'later' });
    const removing = outbox.updatePendingOutcome(saved);
    try { expect(outbox.readOutbox().map(entry => entry.itemId)).toEqual(['task-a']); }
    finally { release.resolve(); await held; }
    await Promise.all([adding, removing]);
    expect(outbox.readOutbox().map(entry => entry.itemId)).toEqual(['task-b']);
  });

  it('fails closed without browser locks and preserves the queue', async () => {
    await outbox.enqueueOutcome(pending, task);
    const before = values.get(KEY);
    vi.stubGlobal('navigator', {});
    await expect(outbox.enqueueOutcome({ ...pending, itemId: 'task-b' })).rejects.toThrow();
    await expect(offline.flush([task])).rejects.toThrow();
    expect(values.get(KEY)).toBe(before);
    expect(requests).toHaveLength(0);
  });
});
