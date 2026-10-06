import { describe, expect, it } from 'vitest';
import { MediaStateStore, type KeyValueStore } from './media-state-store';
import { ensureFirstRealPersonaPost, FIRST_REAL_PERSONA_POST } from './persona-first-post';
import { validateShootingBrief } from './persona-shooting';

class MemoryKv implements KeyValueStore {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
}

describe('first real Persona post', () => {
  it('persists the real idea and complete shooting brief in canonical MediaStateStore', async () => {
    const kv = new MemoryKv();
    const first = new MediaStateStore({ kv, now: () => '2026-10-06T18:30:00Z' });

    await ensureFirstRealPersonaPost(first);

    const reloaded = new MediaStateStore({ kv, now: () => '2026-10-06T18:31:00Z' });
    const restored = await reloaded.getPersonaProductionIdea(FIRST_REAL_PERSONA_POST.id);

    expect(restored).toEqual(FIRST_REAL_PERSONA_POST);
    expect(validateShootingBrief(restored!.shootingBrief)).toEqual([]);
    expect(restored!.status).toBe('ready_to_shoot');
    expect(restored!.shootingBrief.orientation).toBe('vertical');
    expect(restored!.shootingBrief.shots).toHaveLength(1);
    expect(restored!.shootingBrief.shots[0].bRoll).toBe(false);
    expect(restored!.script).toContain('меньше витрины, больше настоящего процесса');
  });

  it('does not overwrite an already persisted first-post record', async () => {
    const kv = new MemoryKv();
    const store = new MediaStateStore({ kv, now: () => '2026-10-06T18:32:00Z' });
    await store.savePersonaProductionIdea({ ...FIRST_REAL_PERSONA_POST, title: 'Пользовательский вариант' });

    const ensured = await ensureFirstRealPersonaPost(store);

    expect(ensured.title).toBe('Пользовательский вариант');
    expect((await store.getPersonaProductionIdea(FIRST_REAL_PERSONA_POST.id))?.title).toBe('Пользовательский вариант');
  });
});
