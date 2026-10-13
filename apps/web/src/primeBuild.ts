import { allItems, goals, outcome, projects, saveGoal, saveItem, saveProject } from './api';
import type { Item } from './types';

export const PRIME_PROJECT_ID = 'project:prime-build:30:v1';
export const PRIME_GOAL_ID = 'goal:prime-build:30:v1';
export const PRIME_TITLE = 'Prime Build — 30 days';
export const PRIME_PRINCIPLE = 'Интерес — сразу. Значимость — только после взаимности.';
const SETTINGS_KEY = 'life-os:prime-build:settings:v1';
const PRIVATE_KEY = 'life-os:prime-build:private:v1';
export type PrimeCategory = 'body' | 'style' | 'strong' | 'social' | 'capture';
export type PrimeEventType = 'new_outreach' | 'impulse' | 'pause' | 'validation' | 'reflection' | 'self_direction';
export type PauseOutcome = 'interested' | 'skip' | 'postpone';
export interface PrimeEvent {
  id: string;
  type: PrimeEventType;
  date: string;
  createdAt: string;
  updatedAt: string;
  detail?: string;
  outcome?: PauseOutcome;
  answers?: [string, string, string];
  selfRespect?: number;
  alignment?: number;
  fingerprint?: string;
}
export interface PrimeSettings { startDate: string; outreachLimit: number; }
export interface PrimeJournal { events: PrimeEvent[]; }
export interface PrimeStorage { getItem(key: string): string | null; setItem(key: string, v: string): void; }
export const PRIME_CATEGORIES: Readonly<Record<PrimeCategory, string>> = {
  body: 'Тело / осанка', style: 'Стиль / уход',
  strong: 'Сильный контекст', social: 'Социальная жизнь',
  capture: 'Prime фото / видео',
};
const cat = Object.keys(PRIME_CATEGORIES) as PrimeCategory[];
export function primeDate(d = new Date()): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
export function addPrimeDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return primeDate(d);
}
export function dayDistance(start: string, current: string): number {
  return Math.round((new Date(current + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000);
}
function validDate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(d + 'T12:00:00').getTime());
}
export function readPrimeSettings(store: PrimeStorage): PrimeSettings | null {
  try {
    const value = JSON.parse(store.getItem(SETTINGS_KEY) || 'null');
    if (validDate(value?.startDate) && Number.isInteger(value?.outreachLimit) && value.outreachLimit >= 0 && value.outreachLimit <= 99)
      return { startDate: value.startDate, outreachLimit: value.outreachLimit };
  } catch { /* local replica may not exist yet */ }
  return null;
}
export function beginPrimeBuild(store: PrimeStorage, nowDate: string): PrimeSettings {
  if (!validDate(nowDate)) throw Error('Invalid Prime date');
  const previous = readPrimeSettings(store);
  if (previous) return previous;
  const value = { startDate: nowDate, outreachLimit: 3 };
  store.setItem(SETTINGS_KEY, JSON.stringify(value));
  return value;
}
export function setPrimeOutreachLimit(store: PrimeStorage, max: number): PrimeSettings {
  if (!Number.isInteger(max) || max < 0 || max > 99) throw Error('Outreach limit must be 0–99');
  const settings = readPrimeSettings(store);
  if (!settings) throw Error('Prime Build has not started');
  const next = { ...settings, outreachLimit: max };
  store.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
export function primeWeek(settings: PrimeSettings, date: string): { index: number; from: string; to: string } | null {
  const elapsed = dayDistance(settings.startDate, date);
  if (elapsed < 0 || elapsed >= 30) return null;
  const index = Math.floor(elapsed / 7);
  return { index, from: addPrimeDays(settings.startDate, index * 7), to: addPrimeDays(settings.startDate, Math.min(29, index * 7 + 6)) };
}
export function primeActionId(settings: PrimeSettings, week: number, category: PrimeCategory): string {
  return 'prime:v1:' + settings.startDate + ':week:' + week + ':' + category;
}
export function primeCheckinId(date: string): string { return 'prime:v1:checkin:' + date; }
export function readPrimeJournal(store: PrimeStorage): PrimeJournal {
  try {
    const p = JSON.parse(store.getItem(PRIVATE_KEY) || 'null');
    if (p && Array.isArray(p.events))
      return { events: p.events.filter((e: PrimeEvent) => typeof e?.id === 'string' && validDate(e.date) && typeof e.type === 'string') };
  } catch { /* never reinterpret broken private content as facts */ }
  return { events: [] };
}
function putEvent(store: PrimeStorage, event: PrimeEvent): PrimeEvent {
  const journal = readPrimeJournal(store);
  journal.events = [...journal.events.filter(e => e.id !== event.id), event];
  store.setItem(PRIVATE_KEY, JSON.stringify(journal));
  return event;
}
export function logPrimeEvent(store: PrimeStorage, input: Omit<PrimeEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, now = new Date().toISOString()): PrimeEvent {
  if (!validDate(input.date)) throw Error('Invalid event date');
  const old = readPrimeJournal(store).events.find(e => e.id === input.id || (input.fingerprint && e.fingerprint === input.fingerprint && e.date === input.date));
  const id = old?.id || input.id || 'prime:event:' + crypto.randomUUID();
  return putEvent(store, { ...old, ...input, id, createdAt: old?.createdAt || now, updatedAt: now });
}
export function savePrimeReflection(store: PrimeStorage, date: string, answers: [string, string, string], selfRespect?: number, alignment?: number): PrimeEvent {
  for (const score of [selfRespect, alignment])
    if (score !== undefined && (!Number.isInteger(score) || score < 1 || score > 10)) throw Error('Score must be 1–10');
  return logPrimeEvent(store, { id: 'prime:reflection:' + date, type: 'reflection', date,
    answers: answers.map(x => x.trim()) as [string, string, string], selfRespect, alignment });
}
export function primeWeeklySummary(settings: PrimeSettings, date: string, items: Item[], events: PrimeEvent[]) {
  const week = primeWeek(settings, date);
  if (!week) return null;
  const flags = Object.fromEntries(cat.map(c => [c, items.some(i => i.id === primeActionId(settings, week.index, c) && i.status === 'completed')])) as Record<PrimeCategory, boolean>;
  const scoped = events.filter(e => e.date >= week.from && e.date <= week.to);
  const outreach = scoped.filter(e => e.type === 'new_outreach').length;
  const complete = cat.filter(c => flags[c]).length;
  return { ...week, flags, complete, outreach, remaining: Math.max(0, settings.outreachLimit - outreach),
    pauses: scoped.filter(e => e.type === 'pause').length,
    validationMoments: scoped.filter(e => e.type === 'validation').length,
    checkins: scoped.filter(e => e.type === 'reflection').length,
    primeAlignment: Math.round((complete / 5) * 100) };
}
function task(id: string, title: string, date?: string): Item {
  return { id, title, kind: 'task', status: 'planned', planned_start: date ? date + 'T21:30:00' : null,
    planned_end: date ? date + 'T21:32:00' : null, project_id: PRIME_PROJECT_ID, goal_id: PRIME_GOAL_ID,
    priority: 'normal', carry_forward: false, notes: 'Prime Build · 30 дней' };
}
export async function ensurePrimeWeek(settings: PrimeSettings, date: string) {
  const week = primeWeek(settings, date);
  if (!week) return;
  const gs = await goals();
  if (!gs.some(g => g.id === PRIME_GOAL_ID))
    await saveGoal({ id: PRIME_GOAL_ID, title: 'Строить самостоятельную, насыщенную жизнь', status: 'active' });
  const ps = await projects();
  if (!ps.some(p => p.id === PRIME_PROJECT_ID))
    await saveProject({ id: PRIME_PROJECT_ID, title: PRIME_TITLE, status: 'active', goal_id: PRIME_GOAL_ID });
  const existing = new Set((await allItems()).map(x => x.id));
  for (const c of cat) {
    const id = primeActionId(settings, week.index, c);
    if (!existing.has(id)) { await saveItem(task(id, 'Prime · ' + PRIME_CATEGORIES[c])); existing.add(id); }
  }
  const checkin = primeCheckinId(date);
  if (!existing.has(checkin)) await saveItem(task(checkin, 'Prime · Вечерние 2 минуты', date));
}
export async function completePrimeCategory(settings: PrimeSettings, date: string, category: PrimeCategory): Promise<boolean> {
  const week = primeWeek(settings, date);
  if (!week) return false;
  await ensurePrimeWeek(settings, date);
  const item = (await allItems()).find(i => i.id === primeActionId(settings, week.index, category));
  if (!item || item.status === 'completed') return false;
  await outcome(item, 'complete');
  return true;
}
export async function completePrimeReflectionTask(date: string): Promise<void> {
  const item = (await allItems()).find(i => i.id === primeCheckinId(date));
  if (item && item.status !== 'completed') await outcome(item, 'complete');
}
export function classifyPrimeUtterance(text: string): { category?: PrimeCategory; event?: PrimeEventType; outcome?: PauseOutcome; message: string } | null {
  const s = text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  if (/(не стал|не стала|не буду|воздержал|выдержал|передумал).*(писать|написать|сообщен|пауз)/.test(s) || /(пауз).*(выдержал|не написал|не стал)/.test(s))
    return { event: 'pause', outcome: 'skip', message: 'Пауза отмечена. Выбор за тобой.' };
  if (/(захотел|хочется|тянет|собираюсь|импульс).*(написать|писать|познаком|девушк)/.test(s))
    return { event: 'impulse', message: 'Можешь взять 10 минут: тебе интересна именно она или сейчас хочется подтверждения?' };
  if (/(ответил|ответила|продолжил разговор|переписк|общались)/.test(s))
    return { message: 'Это продолжение общения, лимит новых инициатив не меняется.' };
  if (/(написал|познакомился|пригласил|позвал).*(девушк|свидан|романтич|instagram|инстаграм)/.test(s))
    return { event: 'new_outreach', message: 'Новая инициатива отмечена. Это ориентир, не запрет.' };
  if (/(трениров|спортзал|зарядк|осанк|растяжк|мобилити|плаван)/.test(s) && !/(не делал|не ходил)/.test(s))
    return { category: 'body', message: 'Тело / осанка — действие зачтено.' };
  if (/(фото|видео|снимал|фотосесси).*(себя|образ|портрет|prime)/.test(s))
    return { category: 'capture', message: 'Визуальная съёмка — действие зачтено.' };
  if (/(подстриг|парикмах|одежд|гардероб|ухож|стрижк|барбер|образ)/.test(s) && !/(не делал|не ходил)/.test(s))
    return { category: 'style', message: 'Стиль / уход — действие зачтено.' };
  if (/(ходил|побывал|встретился|сходил).*(друз|выставк|концерт|мероприяти|премьер|встреч)/.test(s))
    return { category: 'social', message: 'Социальная активность — действие зачтено.' };
  if (/(репетир|спектак|театр|снимал|съемк|сьемк|аранжир|сочинил|музык|проект|работал над сцен)/.test(s) && !/(не делал|не ходил)/.test(s))
    return { category: 'strong', message: 'Сильный контекст — действие зачтено.' };
  if (/(искал подтвержден|нужн.*одобрен|ждал подтвержден)/.test(s))
    return { event: 'validation', message: 'Отметила момент без оценки и осуждения.' };
  if (/ничего не сделал для себя/.test(s))
    return { event: 'self_direction', message: 'Записала наблюдение без оценки и осуждения. Завтра можно выбрать маленькое действие для себя.' };
  return null;
}
export async function logPrimeFromErika(text: string, store: PrimeStorage, date = primeDate()): Promise<string | null> {
  const settings = readPrimeSettings(store);
  if (!settings || !primeWeek(settings, date)) return null;
  const result = classifyPrimeUtterance(text);
  if (!result) return null;
  if (result.category) {
    const done = await completePrimeCategory(settings, date, result.category);
    return done ? result.message : 'Это действие уже отмечено на этой неделе — второй записи не создаю.';
  }
  if (result.event) {
    const fingerprint = 'erika:' + date + ':' + text.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
    logPrimeEvent(store, { type: result.event, date, outcome: result.outcome, fingerprint });
  }
  return result.message;
}
