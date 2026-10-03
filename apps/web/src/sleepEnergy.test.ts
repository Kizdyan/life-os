import { describe, expect, it } from 'vitest';
import { newSleepEntry, readSleepEntry, saveSleepEntry, sleepSummary, suggestedSleepWindows, type SleepStorage } from './sleepEnergy';

class MemoryStorage implements SleepStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('sleep and energy sensor', () => {
  it('offers concrete windows for seven hours of sleep', () => {
    const labels = suggestedSleepWindows(7 * 60).map((window) => window.label);
    expect(labels).toContain('23:00–06:00');
    expect(labels).toContain('00:00–07:00');
    expect(labels).toContain('01:00–08:00');
    expect(labels).toContain('02:00–09:00');
    expect(labels).toContain('03:00–10:00');
  });

  it('stores one canonical entry per day', () => {
    const storage = new MemoryStorage();
    const window = suggestedSleepWindows(420)[1];
    saveSleepEntry(storage, newSleepEntry({ date: '2026-10-03', hours: 7, window, energy: 4 }, '2026-10-03T08:00:00Z', 'sleep-1'));
    saveSleepEntry(storage, newSleepEntry({ date: '2026-10-03', hours: 7.5, window: suggestedSleepWindows(450)[1], energy: 6 }, '2026-10-03T08:10:00Z', 'sleep-2'));
    expect(readSleepEntry(storage, '2026-10-03')).toMatchObject({ id: 'sleep-2', durationMinutes: 450, energy: 6 });
  });

  it('calculates a compact rolling summary', () => {
    const storage = new MemoryStorage();
    saveSleepEntry(storage, newSleepEntry({ date: '2026-10-02', hours: 7, window: suggestedSleepWindows(420)[1], energy: 6 }, '2026-10-02T08:00:00Z', 'a'));
    saveSleepEntry(storage, newSleepEntry({ date: '2026-10-03', hours: 9, window: suggestedSleepWindows(540)[3], energy: 4 }, '2026-10-03T10:00:00Z', 'b'));
    expect(sleepSummary(storage)).toEqual({ count: 2, averageHours: 8, averageEnergy: 5 });
  });
});
