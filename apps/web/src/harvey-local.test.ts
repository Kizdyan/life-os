import { describe, expect, it } from 'vitest';
import { previewHarveyProspectsCsv } from '../../../packages/core/src/harvey-prospect-review';
import { enqueueLocalHarveyReviewTasks, readLocalToday, mergeLocalHarveyToday } from './localRuntime';

const csv = [
  'company_name,website,status,score',
  'Example Studio,https://studio.example.com,new,72',
].join('\n');

describe('Harvey review intake in existing offline Life OS', () => {
  it('persists review tasks visibly in Today, once per company', () => {
    const memory = new Map<string,string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => { memory.set(k, v); },
    };
    const { reviewTasks } = previewHarveyProspectsCsv(csv, {
      projectId: 'sales-opportunities',
      now: '2026-10-26T12:00:00.000Z',
    });
    expect(enqueueLocalHarveyReviewTasks(storage, reviewTasks)).toBe(1);
    expect(enqueueLocalHarveyReviewTasks(storage, reviewTasks)).toBe(0);
    const today = readLocalToday(storage, '2026-10-26');
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({
      id: 'harvey:lead-review:studio.example.com',
      kind: 'task',
      status: 'planned',
      carry_forward: false,
    });
    expect(memory.size).toBe(1);
  });

  it('merges local review tasks with synced Today and keeps remote versions authoritative', () => {
    const storage = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
    };
    const { reviewTasks } = previewHarveyProspectsCsv(csv, {
      projectId: 'sales-opportunities',
      now: '2026-10-26T12:00:00.000Z',
    });
    enqueueLocalHarveyReviewTasks(mockStorage, reviewTasks);
    const local = readLocalToday(mockStorage, '2026-10-26');
    const remote = [{
      id: 'regular-appointment',
      kind: 'event',
      title: 'Meeting',
      status: 'planned' as const,
      planned_start: '2026-10-26T11:00:00.000Z',
      planned_end: null,
    }];
    const merged = mergeLocalHarveyToday(remote, local);
    expect(merged.map(item => item.id)).toEqual([
      'regular-appointment',
      'harvey:lead-review:studio.example.com',
    ]);
    const remoteOverride = { ...local[0], status: 'completed' as const };
    expect(mergeLocalHarveyToday([remoteOverride], local)).toEqual([remoteOverride]);
    expect(remote).toHaveLength(1);
  });

});
