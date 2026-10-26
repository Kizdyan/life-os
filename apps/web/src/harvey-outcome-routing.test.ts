import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewHarveyProspectsCsv } from '../../../packages/core/src/harvey-prospect-review';
import { enqueueLocalHarveyReviewTasks, readLocalToday } from './localRuntime';

const csv = [
  'company_name,website,status,score',
  'Example Studio,https://studio.example.com,new,90',
].join('\n');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Harvey completion route with Supabase backend configured', () => {
  it('does not POST locally saved Harvey outcomes to Supabase', async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
    };
    const preview = previewHarveyProspectsCsv(csv, {
      projectId: 'sales-opportunities',
      now: '2026-10-26T12:00:00.000Z',
    });
    enqueueLocalHarveyReviewTasks(storage, preview.reviewTasks);
    vi.stubGlobal('localStorage', storage);

    const fetchSpy = vi.fn(async () => {
      throw new Error('Wrong: server should never receive local Harvey outcomes');
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.example.com');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
    vi.resetModules();

    const { backendMode, outcome } = await import('./api');
    expect(backendMode).toBe('supabase');
    const [task] = readLocalToday(storage, '2026-10-26');
    expect(task).toBeDefined();
    await outcome(task, 'complete');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readLocalToday(storage, '2026-10-26')[0].status).toBe('completed');
  });

  it('still routes ordinary cloud-backed tasks through the normal API', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => undefined,
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.example.com');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
    const fetchSpy = vi.fn(async () => new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();

    const { outcome } = await import('./api');
    await outcome({
      id: 'ordinary-task',
      title: 'Regular task',
      kind: 'task',
      status: 'planned',
      planned_start: '2026-10-26T10:00:00.000Z',
      planned_end: null,
    }, 'complete');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/rest/v1/rpc/life_set_outcome');
  });
});
