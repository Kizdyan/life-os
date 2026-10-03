import { describe, expect, it } from 'vitest';
import { applyRemoteSleepRecords, newSleepEntry, readSleepEntry, saveSleepEntry, suggestedSleepWindows, type SleepStorage } from './sleepEnergy';
import type { RuntimeSyncRecord } from './runtimeSync';

class MemoryStorage implements SleepStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('durable sleep runtime', () => {
  it('uses a stable record id for one sleep date', () => {
    const entry = newSleepEntry({
      date: '2026-10-03',
      hours: 7,
      window: suggestedSleepWindows(420)[1],
      energy: 6,
    }, '2026-10-03T08:00:00Z');
    expect(entry.id).toBe('sleep:2026-10-03');
  });

  it('rehydrates canonical sleep_log records with their server version', () => {
    const storage = new MemoryStorage();
    const record: RuntimeSyncRecord = {
      id: 'sleep:2026-10-03',
      userId: 'self',
      kind: 'sleep_log',
      version: 3,
      payload: {
        date: '2026-10-03',
        durationMinutes: 450,
        sleepStart: '00:00',
        wakeTime: '07:30',
        energy: 7,
        sleepQuality: 6,
        wellbeing: null,
        note: '',
        createdAt: '2026-10-03T07:30:00Z',
        updatedAt: '2026-10-03T07:35:00Z',
      },
      deleted: false,
      updatedAt: '2026-10-03T07:35:00Z',
    };

    applyRemoteSleepRecords(storage, [record]);
    expect(readSleepEntry(storage, '2026-10-03')).toMatchObject({
      id: 'sleep:2026-10-03',
      durationMinutes: 450,
      energy: 7,
      version: 3,
    });
  });

  it('removes a sleep entry when the canonical record is deleted', () => {
    const storage = new MemoryStorage();
    saveSleepEntry(storage, newSleepEntry({
      date: '2026-10-03',
      hours: 7,
      window: suggestedSleepWindows(420)[1],
      energy: 6,
    }, '2026-10-03T08:00:00Z'));

    applyRemoteSleepRecords(storage, [{
      id: 'sleep:2026-10-03',
      userId: 'self',
      kind: 'sleep_log',
      version: 2,
      payload: { date: '2026-10-03' },
      deleted: true,
      updatedAt: '2026-10-03T08:10:00Z',
    }]);

    expect(readSleepEntry(storage, '2026-10-03')).toBeNull();
  });
});
