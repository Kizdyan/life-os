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

describe('offline outcome synchronization', () => {
  let values: Map<string, string>;
  let requests: Record<string, unknown>[];
  let send: (body: Record<string, unknown>) => Promise<Response>;
  let offline: typeof import('./offline');
  let outbox: typeof import('./outbox');

  beforeEach(async () => {
    vi.resetModules();
    values = new Map();
    requests = [];
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
    const reloaded = await import('./outbox');
    expect(reloaded.readOutbox()[0]).toMatchObject({ itemId: task.id, state: 'NEEDS_RESOLUTION' });
  });

  it('retries an unresolved legacy outcome when its day becomes available', async () => {
    outbox.enqueueOutcome(pending);
    await offline.flush([]);
    expect(await offline.flush([task])).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ p_item_id: task.id, p_planned_date: '2026-11-20', p_carry_forward: true });
    expect(outbox.readOutbox()).toEqual([]);
  });

  it('sends a newly queued original-day snapshot after switching days and reloading', async () => {
    outbox.enqueueOutcome(pending, task);
    vi.resetModules();
    const reloaded = await import('./offline');
    expect(await reloaded.flush([{ ...task, id: 'tomorrow', planned_start: '2026-11-21T09:00:00+03:00' }])).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ p_item_id: task.id, p_planned_date: '2026-11-20', p_next_date: '2026-11-21' });
  });

  it('keeps an in-flight outcome persisted until the server confirms it', async () => {
    outbox.enqueueOutcome(pending);
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
    outbox.enqueueOutcome(pending);
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
    outbox.enqueueOutcome(pending);
    const started = deferred(), response = deferred();
    send = async body => { started.resolve(); await response.promise; return acknowledgement(body); };
    const flushing = offline.flush([task]);
    await started.promise;
    const later = { itemId: 'task-b', command: 'complete' as const, createdAt: '2026-11-20T10:02:00Z' };
    outbox.enqueueOutcome(later);
    response.resolve();
    expect(await flushing).toBe(1);
    expect(outbox.readOutbox()).toEqual([expect.objectContaining(later)]);
  });

  it('keeps failed requests and later additions across reload before a successful retry', async () => {
    outbox.enqueueOutcome(pending);
    send = async () => { outbox.enqueueOutcome({ itemId: 'task-b', command: 'complete', createdAt: 'later' }); throw Error('offline'); };
    expect(await offline.flush([task])).toBe(2);
    expect(outbox.readOutbox().map(x => x.itemId)).toEqual(['task-a', 'task-b']);
    vi.resetModules();
    const reloaded = await import('./offline');
    send = async body => acknowledgement(body);
    expect(await reloaded.flush([task])).toBe(1);
    expect(outbox.readOutbox()[0].itemId).toBe('task-b');
  });

  it('retains HTTP errors and invalid server acknowledgements for retry', async () => {
    outbox.enqueueOutcome(pending);
    send = async () => new Response('service unavailable', { status: 503 });
    expect(await offline.flush([task])).toBe(1);
    send = async () => new Response('{');
    expect(await offline.flush([task])).toBe(1);
    expect(outbox.readOutbox()[0]).toMatchObject(pending);
  });
  it('reuses the persisted request after a failed send even if the item later moves days', async () => {
    outbox.enqueueOutcome(pending);
    send = async () => { throw Error('response lost'); };
    expect(await offline.flush([task])).toBe(1);
    const saved = outbox.readOutbox()[0];
    expect(saved.idempotencyKey).toEqual(expect.any(String));
    send = async body => acknowledgement(body);
    vi.resetModules();
    const reloaded = await import('./offline');
    expect(await reloaded.flush([{ ...task, carry_forward: false, planned_start: '2026-11-22T09:00:00+03:00' }])).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  });

  it('does not append the same identified operation twice', () => {
    outbox.enqueueOutcome({ ...pending, idempotencyKey: 'same-operation' }, task);
    outbox.enqueueOutcome({ ...pending, idempotencyKey: 'same-operation' }, task);
    expect(outbox.readOutbox()).toHaveLength(1);
  });

  it('preserves damaged persisted data and refuses to overwrite it', async () => {
    for (const raw of ['{broken', '{}', '[null]']) {
      values.set(KEY, raw);
      await expect(offline.flush([task])).rejects.toThrow();
      expect(() => outbox.enqueueOutcome(pending)).toThrow();
      expect(values.get(KEY)).toBe(raw);
    }
    expect(requests).toHaveLength(0);
  });

  it('does not guess a planned date for an outcome without stable item context', async () => {
    outbox.enqueueOutcome(pending, { ...task, planned_start: null });
    expect(await offline.flush([task])).toBe(1);
    expect(requests).toHaveLength(0);
    expect(outbox.readOutbox()[0]).toMatchObject({ state: 'NEEDS_RESOLUTION', reason: expect.any(String) });
  });

  it('serializes independent tab runtimes through browser Web Locks', async () => {
    let tail: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', { locks: { request: (_name: string, run: () => Promise<number>) => {
      const result = tail.then(run);
      tail = result.catch(() => {});
      return result;
    } } });
    outbox.enqueueOutcome(pending, task);
    const started = deferred(), response = deferred();
    send = async body => { started.resolve(); await response.promise; return acknowledgement(body); };
    const first = offline.flush([task]);
    await started.promise;
    vi.resetModules();
    const otherTab = await import('./offline');
    const second = otherTab.flush([task]);
    response.resolve();
    expect(await Promise.all([first, second])).toEqual([0, 0]);
    expect(requests).toHaveLength(1);
  });
});
