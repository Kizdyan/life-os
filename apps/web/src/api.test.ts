import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Item } from './types';
const task: Item = { id: 'walk', title: 'Walk', kind: 'task', status: 'planned', planned_start: '2026-11-20T09:00:00+03:00', planned_end: null, carry_forward: true };
let bodies: Record<string, unknown>[];
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://outbox.test');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key');
  bodies = [];
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    bodies.push(JSON.parse(String(options.body)));
    const body = bodies.at(-1)!;
    return new Response(JSON.stringify({ item_id: task.id, status: body.p_command === 'complete' ? 'completed' : 'missed_time', successor: body.p_carry_forward ? { id: body.p_successor_id } : null }));
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('supplies the existing SQL RPC required timestamp and a stable carry successor on retry', async () => {
  const { outcome } = await import('./api');
  const mutation = { idempotencyKey: 'offline-operation-1', createdAt: '2026-11-20T10:00:00Z' };
  await outcome(task, 'not_complete', mutation);
  await outcome(task, 'not_complete', mutation);
  expect(bodies[0]).toMatchObject({ p_now: '2026-11-20T10:00:00Z', p_successor_id: expect.any(String), p_next_date: '2026-11-21' });
  expect(bodies[1]).toEqual(bodies[0]);
});
it('keeps terminal commands from creating a successor', async () => {
  const { outcome } = await import('./api');
  await outcome(task, 'complete');
  expect(bodies[0]).toMatchObject({ p_now: expect.any(String), p_successor_id: null, p_next_date: null, p_carry_forward: false });
});
it('rejects a response that does not acknowledge the requested item and outcome', async () => {
  const { outcome } = await import('./api');
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ item_id: 'other', status: 'completed' })));
  await expect(outcome(task, 'complete')).rejects.toThrow();
});
it('reuses one carry successor across not_complete, complete, not_complete operations', async () => {
  const { outcome } = await import('./api');
  await outcome(task, 'not_complete', { idempotencyKey: 'operation-a', createdAt: '2026-11-20T10:00:00Z' });
  await outcome(task, 'complete', { idempotencyKey: 'operation-b', createdAt: '2026-11-20T10:01:00Z' });
  await outcome(task, 'not_complete', { idempotencyKey: 'operation-c', createdAt: '2026-11-20T10:02:00Z' });
  expect(bodies[2].p_successor_id).toBe(bodies[0].p_successor_id);
  expect(bodies[1].p_successor_id).toBeNull();
  await outcome({ ...task, planned_start: '2026-11-22T09:00:00+03:00' }, 'not_complete');
  expect(bodies[3].p_successor_id).not.toBe(bodies[0].p_successor_id);
});
