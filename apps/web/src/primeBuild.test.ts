import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, LifeGoal, LifeProject } from './types';

const state = vi.hoisted(() => ({
  items: [] as Item[], goals: [] as LifeGoal[], projects: [] as LifeProject[],
  outcomes: 0, writes: 0,
}));
vi.mock('./api', () => ({
  allItems: async () => state.items.map(i => ({ ...i })),
  goals: async () => state.goals.map(i => ({ ...i })),
  projects: async () => state.projects.map(i => ({ ...i })),
  saveGoal: async (g: LifeGoal) => { if (!state.goals.some(x => x.id === g.id)) state.goals.push(g); },
  saveProject: async (p: LifeProject) => { if (!state.projects.some(x => x.id === p.id)) state.projects.push(p); },
  saveItem: async (i: Item) => { state.writes++; const n = state.items.findIndex(x => x.id === i.id); if (n >= 0) state.items[n] = i; else state.items.push(i); },
  outcome: async (i: Item) => { state.outcomes++; state.items = state.items.map(x => x.id === i.id ? { ...x, status: 'completed' } : x); },
}));
import { migrateLegacyPrimeReflections } from './primeCheckinMigration';
import { savePrimeDailyReflection, readPrimeDailyReflection } from './dailyCheckin';
import {
  PRIME_GOAL_ID, PRIME_PROJECT_ID, addPrimeDays, beginPrimeBuild,
  classifyPrimeUtterance, completePrimeCategory, dayDistance, ensurePrimeWeek,
  logPrimeEvent, logPrimeFromErika, primeActionId, primeCheckinId,
  primeWeeklySummary, primeWeek, readPrimeJournal, readPrimeSettings,
  savePrimeReflection, setPrimeOutreachLimit, undoPrimeJournalLast,
} from './primeBuild';

class Store {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, value: string) { this.data.set(k, value); }
  reload() { const next = new Store(); next.data = new Map(this.data); return next; }
  keys() { return [...this.data.keys()]; }
}
const day = '2026-10-13';
beforeEach(() => { state.items = []; state.goals = []; state.projects = []; state.outcomes = 0; state.writes = 0; });

describe('Prime Build V1 — 30 days, existing Life OS models', () => {
  it('starts exactly once and survives storage recreation', () => {
    const s = new Store();
    expect(beginPrimeBuild(s, day)).toEqual({ startDate: day, outreachLimit: 3 });
    expect(beginPrimeBuild(s, '2026-10-14').startDate).toBe(day);
    expect(readPrimeSettings(s.reload())?.startDate).toBe(day);
  });
  it('validates editable weekly guardrail', () => {
    const s = new Store(); beginPrimeBuild(s, day);
    expect(setPrimeOutreachLimit(s, 4).outreachLimit).toBe(4);
    expect(() => setPrimeOutreachLimit(s, -1)).toThrow();
    expect(() => setPrimeOutreachLimit(s, 101)).toThrow();
  });
  it('30-day boundary and accurate weekly scoping', () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    expect(primeWeek(cfg, '2026-10-12')).toBeNull();
    expect(primeWeek(cfg, day)?.index).toBe(0);
    expect(primeWeek(cfg, addPrimeDays(day, 7))?.index).toBe(1);
    expect(primeWeek(cfg, addPrimeDays(day, 29))?.index).toBe(4);
    expect(primeWeek(cfg, addPrimeDays(day, 30))).toBeNull();
    expect(dayDistance(day, addPrimeDays(day, 30))).toBe(30);
  });
  it('reuses canonical goal/project/task entities with stable keys', async () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    await ensurePrimeWeek(cfg, day);
    expect(state.goals.map(x => x.id)).toEqual([PRIME_GOAL_ID]);
    expect(state.projects.map(x => x.id)).toEqual([PRIME_PROJECT_ID]);
    expect(state.items).toHaveLength(6);
    expect(state.items.every(x => x.project_id === PRIME_PROJECT_ID && x.goal_id === PRIME_GOAL_ID)).toBe(true);
    expect(state.items.some(x => x.id === primeCheckinId(day))).toBe(true);
    await ensurePrimeWeek(cfg, day);
    expect(state.items).toHaveLength(6);
    expect(state.writes).toBe(6);
  });
  it('migrates legacy nightly reflections to the existing Check-in domain idempotently', async () => {
    const s = new Store();
    savePrimeReflection(s,day,['Сделал для себя','Искал реакцию','Завтра работа'],8,7);
    const persist = async (v: import('./dailyCheckin').PrimeDailyReflection) => { savePrimeDailyReflection(s,v); };
    expect(await migrateLegacyPrimeReflections(s,persist)).toBe(1);
    expect(await migrateLegacyPrimeReflections(s,persist)).toBe(0);
    expect(readPrimeDailyReflection(s,day)?.answers[2]).toBe('Завтра работа');
    expect(readPrimeDailyReflection(s,day)?.selfDirection).toBe(8);
    expect(readPrimeJournal(s).events.filter(e => e.type === 'reflection' && !e.voided)).toHaveLength(0);
    expect(readPrimeJournal(s).audit).toHaveLength(2);
  });
  it('one weekly category completion does not double-count', async () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    expect(await completePrimeCategory(cfg, day, 'body')).toBe(true);
    expect(await completePrimeCategory(cfg, day, 'body')).toBe(false);
    expect(state.outcomes).toBe(1);
    const summary = primeWeeklySummary(cfg, day, state.items, []);
    expect(summary?.flags.body).toBe(true);
    expect(summary?.complete).toBe(1);
  });
  it('new romantic outreach count and remaining budget are informational', () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    for (let i = 0; i < 4; i++) logPrimeEvent(s, { type: 'new_outreach', date: day });
    const total = primeWeeklySummary(cfg, day, [], readPrimeJournal(s).events);
    expect(total?.outreach).toBe(4);
    expect(total?.remaining).toBe(0);
  });
  it('does not count replies or ongoing conversations as new romantic initiatives', () => {
    expect(classifyPrimeUtterance('Я ответил девушке в переписке')?.event).toBeUndefined();
    expect(classifyPrimeUtterance('Мы продолжили разговор')?.event).toBeUndefined();
    expect(classifyPrimeUtterance('Я поговорил с коллегой')?.event).toBeUndefined();
  });
  it('distinguishes impulse from outreach and never blocks voluntary action', () => {
    expect(classifyPrimeUtterance('Мне опять захотелось написать девушке из Instagram')?.event).toBe('impulse');
    expect(classifyPrimeUtterance('Я написал девушке из Instagram')?.event).toBe('new_outreach');
    expect(classifyPrimeUtterance('Я выдержал паузу и не стал писать')?.outcome).toBe('skip');
  });
  it('updates the same private event instead of duplicating a correction', () => {
    const s = new Store();
    const p = logPrimeEvent(s, { type: 'pause', date: day }, '2026-10-13T10:00:00Z');
    logPrimeEvent(s, { id: p.id, type: 'pause', date: day, outcome: 'skip' }, '2026-10-13T10:10:00Z');
    expect(readPrimeJournal(s).events).toHaveLength(1);
    expect(readPrimeJournal(s).events[0].outcome).toBe('skip');
  });
  it('same phrase can represent two real-world outreaches but retry identity is idempotent', async () => {
    const s = new Store(); beginPrimeBuild(s, day);
    await logPrimeFromErika('Я написал девушке из Instagram', s, day, 'real-event-1');
    await logPrimeFromErika('Я написал девушке из Instagram', s, day, 'real-event-1');
    expect(primeWeeklySummary(readPrimeSettings(s)!, day, [], readPrimeJournal(s).events)?.outreach).toBe(1);
    await logPrimeFromErika('Я написал девушке из Instagram', s, day, 'real-event-2');
    expect(primeWeeklySummary(readPrimeSettings(s)!, day, [], readPrimeJournal(s).events)?.outreach).toBe(2);
    expect(readPrimeJournal(s).audit).toHaveLength(2);
  });
  it('an explicit accidental repeat correction voids the latest recorded outreach', async () => {
    const s = new Store(); beginPrimeBuild(s, day);
    await logPrimeFromErika('Я написал девушке из Instagram', s, day, 'outreach-a');
    await logPrimeFromErika('Я написал девушке из Instagram', s, day, 'outreach-b');
    await logPrimeFromErika('Я случайно повторил сообщение', s, day, 'correction-c');
    await logPrimeFromErika('Я случайно повторил сообщение', s, day, 'correction-c');
    expect(primeWeeklySummary(readPrimeSettings(s)!, day, [], readPrimeJournal(s).events)?.outreach).toBe(1);
    expect(readPrimeJournal(s).audit).toHaveLength(3);
  });
  it('a retry of a voided outreach operation cannot resurrect the original event', async () => {
    const s = new Store(); beginPrimeBuild(s, day);
    await logPrimeFromErika('Я написал девушке из Instagram', s, day, 'op-id');
    await logPrimeFromErika('Нет, я не написал девушке', s, day, 'correction-id');
    await logPrimeFromErika('Я написал девушке из Instagram', s, day, 'op-id');
    await logPrimeFromErika('Нет, я не написал девушке', s, day, 'correction-id');
    expect(readPrimeJournal(s).events).toHaveLength(1);
    expect(readPrimeJournal(s).events[0].voided).toBe(true);
    expect(readPrimeJournal(s).audit).toHaveLength(2);
  });
  it('never marks negated or future actions as completed, and never counts a non-message', () => {
    expect(classifyPrimeUtterance('Я не написал девушке')?.event).not.toBe('new_outreach');
    expect(classifyPrimeUtterance('Сегодня не тренировался')?.category).toBeUndefined();
    expect(classifyPrimeUtterance('Завтра планирую тренировку')?.category).toBeUndefined();
    expect(classifyPrimeUtterance('Хочу сделать фотосессию')?.category).toBeUndefined();
    expect(classifyPrimeUtterance('Сегодня не репетировал')?.category).toBeUndefined();
  });
  it('classifies user example logs without forcing special syntax', () => {
    expect(classifyPrimeUtterance('Я сходил на тренировку')?.category).toBe('body');
    expect(classifyPrimeUtterance('Сегодня репетировал три часа')?.category).toBe('strong');
    expect(classifyPrimeUtterance('Снимал фото себя для образа')?.category).toBe('capture');
    expect(classifyPrimeUtterance('Сегодня ничего не сделал для себя')?.event).toBe('self_direction');
    expect(classifyPrimeUtterance('Я ходил в театр с друзьями')?.category).toBe('social');
  });
  it('reflection has one stable record per date and optional validated scores', () => {
    const s = new Store();
    savePrimeReflection(s, day, ['Сделал зарядку', 'Искал реакцию', 'Завтра репетиция'], 7, 8);
    savePrimeReflection(s, day, ['Сделал зарядку', 'Исправил ответ', 'Завтра репетиция']);
    expect(readPrimeJournal(s).events).toHaveLength(1);
    expect(readPrimeJournal(s).events[0].answers?.[1]).toBe('Исправил ответ');
    expect(() => savePrimeReflection(s, day, ['', '', ''], 0)).toThrow();
  });
  it('private romantic and reflection contents never enter ordinary goal/project/task payloads', async () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    logPrimeEvent(s, { type: 'new_outreach', date: day, detail: 'PRIVATE_EXAMPLE' });
    savePrimeReflection(s, day, ['PRIVATE_EXAMPLE', '', '']);
    await ensurePrimeWeek(cfg, day);
    const serialized = JSON.stringify([state.items, state.goals, state.projects]);
    expect(serialized).not.toContain('PRIVATE_EXAMPLE');
    expect(s.keys().some(k => k.includes('private'))).toBe(true);
  });
  it('concurrent initializers use one task set, without duplicate writes', async () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    await Promise.all([ensurePrimeWeek(cfg, day), ensurePrimeWeek(cfg, day), ensurePrimeWeek(cfg, day)]);
    expect(state.goals).toHaveLength(1);
    expect(state.projects).toHaveLength(1);
    expect(state.items).toHaveLength(6);
    expect(state.writes).toBe(6);
  });
  it('private journal supports auditable undo without silently deleting the event', () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    logPrimeEvent(s, { type: 'new_outreach', date: day });
    expect(primeWeeklySummary(cfg, day, [], readPrimeJournal(s).events)?.outreach).toBe(1);
    expect(undoPrimeJournalLast(s)).toBe(true);
    expect(readPrimeJournal(s).events).toHaveLength(1);
    expect(readPrimeJournal(s).events[0].voided).toBe(true);
    expect(readPrimeJournal(s).audit.map(x => x.reason)).toEqual(['write', 'undo']);
    expect(primeWeeklySummary(cfg, day, [], readPrimeJournal(s).events)?.outreach).toBe(0);
  });
  it('Erika impulse remains a thought, not a completed pause or new outreach', async () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    const phrase = 'Мне опять захотелось написать девушке из Instagram';
    await logPrimeFromErika(phrase, s, day, 'same-operation');
    await logPrimeFromErika(phrase, s, day, 'same-operation');
    const summary = primeWeeklySummary(cfg, day, [], readPrimeJournal(s).events);
    expect(summary?.pauses).toBe(0);
    expect(summary?.outreach).toBe(0);
    expect(readPrimeJournal(s).events).toHaveLength(1);
    expect(JSON.stringify(readPrimeJournal(s))).not.toContain(phrase);
  });
  it('explicit Erika correction voids the old outreach with provenance, not another event', async () => {
    const store = new Store(), cfg = beginPrimeBuild(store, day);
    await logPrimeFromErika('Я написал девушке из Instagram', store, day);
    expect(primeWeeklySummary(cfg, day, [], readPrimeJournal(store).events)?.outreach).toBe(1);
    await logPrimeFromErika('Нет, я не написал девушке', store, day);
    expect(primeWeeklySummary(cfg, day, [], readPrimeJournal(store).events)?.outreach).toBe(0);
    expect(readPrimeJournal(store).events).toHaveLength(1);
    expect(readPrimeJournal(store).events[0].voided).toBe(true);
    expect(readPrimeJournal(store).audit.length).toBe(2);
  });
  it('week-over-week boundaries count separate categories without inflating achievement', async () => {
    const s = new Store(), cfg = beginPrimeBuild(s, day);
    await ensurePrimeWeek(cfg, day);
    await completePrimeCategory(cfg, day, 'body');
    const nextWeekDate = addPrimeDays(day, 7);
    await ensurePrimeWeek(cfg, nextWeekDate);
    expect(primeWeeklySummary(cfg, day, state.items, [])?.flags.body).toBe(true);
    expect(primeWeeklySummary(cfg, nextWeekDate, state.items, [])?.flags.body).toBe(false);
  });
});
