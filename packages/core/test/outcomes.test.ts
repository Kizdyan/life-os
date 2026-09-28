import { describe, expect, it } from 'vitest';
import { applyOutcome } from '../src/outcomes';
import type { LifeItem } from '../src/life-item';

const item: LifeItem = {
  id: 'music-theory',
  kind: 'task',
  title: 'Повторить теорию музыки',
  status: 'planned',
  plannedStart: '2026-09-30T12:00:00+03:00',
  plannedEnd: '2026-09-30T12:45:00+03:00',
  actualStart: null,
  actualEnd: null,
  projectId: null,
  version: 1,
  createdAt: '2026-09-29T00:00:00Z',
  updatedAt: '2026-09-29T00:00:00Z',
};

describe('outcomes', () => {
  it('records completion without creating a successor', () => {
    const result = applyOutcome({ item, command: 'complete', plannedDate: '2026-09-30', source: 'ui', now: '2026-09-30T13:00:00+03:00', carryForward: false });
    expect(result.current.status).toBe('completed');
    expect(result.successor).toBeNull();
    expect(result.outcome.result).toBe('completed');
  });

  it('keeps a missed result and creates tomorrow successor for important work', () => {
    const result = applyOutcome({ item, command: 'not_complete', plannedDate: '2026-09-30', source: 'erika', now: '2026-09-30T23:00:00+03:00', carryForward: true, nextDate: '2026-10-01', successorId: 'music-theory:2026-10-01' });
    expect(result.current.status).toBe('missed_time');
    expect(result.outcome.result).toBe('missed_time');
    expect(result.successor?.status).toBe('planned');
    expect(result.successor?.plannedStart?.startsWith('2026-10-01')).toBe(true);
  });

  it('records final non-completion without carry-forward', () => {
    const result = applyOutcome({ item, command: 'not_complete', plannedDate: '2026-09-30', source: 'ui', now: '2026-09-30T23:00:00+03:00', carryForward: false });
    expect(result.current.status).toBe('not_completed');
    expect(result.successor).toBeNull();
  });
});
