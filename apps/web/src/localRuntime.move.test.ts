import { describe, expect, it } from 'vitest';
import { applyLocalPlan, moveLocalItem, undoLocalMove, readLocalToday, type StorageLike } from './localRuntime';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('durable local task move', () => {
  it('moves one item, survives a fresh read, and rejects stale undo without duplicates', () => {
    const storage = new MemoryStorage();
    applyLocalPlan(storage, 'seed', [{ title: 'Репетиция', planned_start: '2026-10-19T10:00:00+03:00', planned_end: null }], () => 'task-1');
    const moved = moveLocalItem(storage, 'task-1', '2026-10-20T14:00:00+03:00');
    expect(moved.item.id).toBe('task-1');
    expect(readLocalToday(storage, '2026-10-20')).toMatchObject([{ id: 'task-1', planned_start: '2026-10-20T14:00:00+03:00' }]);
    expect(undoLocalMove(storage, moved.undo)).toMatchObject({ id: 'task-1', planned_start: '2026-10-19T10:00:00+03:00' });
    expect(() => undoLocalMove(storage, moved.undo)).toThrow('stale move undo');
    expect(readLocalToday(storage, '2026-10-19')).toHaveLength(1);
  });
});
