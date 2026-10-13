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
  voided?: boolean;
}
export interface PrimeSettings { startDate: string; outreachLimit: number; }
export interface PrimeAuditEntry { eventId: string; at: string; before: PrimeEvent | null; after: PrimeEvent; reason: 'write' | 'undo'; }
export interface PrimeJournal { events: PrimeEvent[]; audit: PrimeAuditEntry[]; }
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
      return {
        events: p.events.filter((e: PrimeEvent) => typeof e?.id === 'string' && validDate(e.date) && typeof e.type === 'string'),
        audit: Array.isArray(p.audit) ? p.audit : [],
      };
  } catch { /* never reinterpret broken private content as facts */ }
  return { events: [], audit: [] };
}
function persistJournal(store: PrimeStorage, journal: PrimeJournal) {
  store.setItem(PRIVATE_KEY, JSON.stringify(journal));
}
function putEvent(store: PrimeStorage, event: PrimeEvent, now: string): PrimeEvent {
  const journal = readPrimeJournal(store);
  const old = journal.events.find(e => e.id === event.id) ?? null;
  journal.events = [...journal.events.filter(e => e.id !== event.id), event];
  journal.audit.push({ eventId: event.id, at: now, before: old, after: event, reason: 'write' });
  persistJournal(store, journal);
  return event;
}
export function undoPrimeJournalLast(store: PrimeStorage, now = new Date().toISOString()): boolean {
  const journal = readPrimeJournal(store);
  const last = journal.audit.at(-1);
  if (!last) return false;
  const current = journal.events.find(e => e.id === last.eventId);
  if (!current) return false;
  const restored = last.before ? { ...last.before, updatedAt: now }
    : { ...current, voided: true, updatedAt: now };
  journal.events = [...journal.events.filter(e => e.id !== last.eventId), restored];
  journal.audit.push({ eventId: last.eventId, at: now, before: current, after: restored, reason: 'undo' });
  persistJournal(store, journal);
  return true;
}
export function voidPrimeEvent(store: PrimeStorage, eventId: string, now = new Date().toISOString()): boolean {
  const existing = readPrimeJournal(store).events.find(e => e.id === eventId && !e.voided);
  if (!existing) return false;
  putEvent(store, { ...existing, voided: true, updatedAt: now }, now);
  return true;
}
export function logPrimeEvent(store: PrimeStorage, input: Omit<PrimeEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, now = new Date().toISOString()): PrimeEvent {
  if (!validDate(input.date)) throw Error('Invalid event date');
  const old = readPrimeJournal(store).events.find(e => e.id === input.id || (input.fingerprint && e.fingerprint === input.fingerprint && e.date === input.date));
  const id = old?.id || input.id || 'prime:event:' + crypto.randomUUID();
  const event: PrimeEvent = { ...old, ...input, id, voided: false, createdAt: old?.createdAt || now, updatedAt: now };
  if (old && !old.voided) {
    const comparable = (x: PrimeEvent) => JSON.stringify([x.type, x.date, x.detail, x.outcome, x.answers, x.selfRespect, x.alignment, x.fingerprint]);
    if (comparable(old) === comparable(event)) return old;
  }
  return putEvent(store, event, now);
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
  const scoped = events.filter(e => !e.voided && e.date >= week.from && e.date <= week.to);
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
const primeSeedInFlight = new Map<string, Promise<void>>();
export async function ensurePrimeWeek(settings: PrimeSettings, date: string): Promise<void> {
  const week = primeWeek(settings, date);
  if (!week) return;
  const key = settings.startDate + ':' + date;
  const running = primeSeedInFlight.get(key);
  if (running) return running;
  const pending = (async () => {
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
  })();
  primeSeedInFlight.set(key, pending);
  try { await pending; } finally { primeSeedInFlight.delete(key); }
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
  if (/(захотел|хотелось|хочется|тянет|собираюсь|импульс).*(написать|писать|познаком|девушк)/.test(s))
    return { event: 'impulse', message: 'Можешь взять 10 минут: тебе интересна именно она или сейчас хочется подтверждения?' };
  if (/(?:^|\s)не\s+(?:написал|познакомился|пригласил|позвал)(?:\s|$)/.test(s))
    return { message: 'Новая инициатива не записана: ты сообщил, что не отправлял её.' };
  if (/(ответил|ответила|продолжил разговор|переписк|общались)/.test(s))
    return { message: 'Это продолжение общения, лимит новых инициатив не меняется.' };
  if (/(написал|познакомился|пригласил|позвал).*(девушк|свидан|романтич|instagram|инстаграм)/.test(s))
    return { event: 'new_outreach', message: 'Новая инициатива отмечена. Это ориентир, не запрет.' };
  // A plan, canceled activity or negated action must not be silently marked completed.
  if (/(?:завтра|планирую|собираюсь|хочу|хотел бы|буду|предстоит|нужно|надо).*(?:трениров|зарядк|репетир|спектак|съемк|сьемк|снимал|фото|видео|выставк|концерт|мероприяти|друз|премьер)/.test(s))
    return null;
  if (/(?:не\s+(?:тренир|занимал|репетир|снимал|фотографир|был|ходил|сходил|встречал|делал)|отменил|сорвалась|не\s+получилось)/.test(s))
    return null;
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
export async function logPrimeFromErika(text: string, store: PrimeStorage, date = primeDate(), operationId?: string): Promise<string | null> {
  const settings = readPrimeSettings(store);
  if (!settings || !primeWeek(settings, date)) return null;
  const normalizedText = text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  // Correct the last explicitly misreported outreach; never create a second active truth.
  const explicitCorrection = /(?:^|[\s,.:])(?:нет|неа)(?:[\s,.:]|$)|ошибся|исправь|на самом деле/.test(normalizedText);
  const deniedOutreach = /(?:^|\s)не\s+(?:написал|познакомился|пригласил|позвал)(?:\s|$)/.test(normalizedText);
  if (explicitCorrection && deniedOutreach) {
    const previous = readPrimeJournal(store).events
      .filter(e => !e.voided && e.type === 'new_outreach' && e.date === date)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).at(-1);
    if (previous) {
      voidPrimeEvent(store, previous.id);
      return 'Исправила последнюю новую инициативу: она не считается, но история изменения сохранена.';
    }
    return 'Не отмечаю новую инициативу: подтверждённой записи для исправления не нашла.';
  }
  if (/(?:случайн[а-яё]*\s+повтор|повторил[а-яё]*\s+сообщен|это\s+(?:дубль|повтор))/u.test(normalizedText)) {
    const previous = readPrimeJournal(store).events.filter(e => !e.voided && e.type === 'new_outreach' && e.date === date)
      .sort((x, y) => x.updatedAt.localeCompare(y.updatedAt)).at(-1);
    if (!previous) return 'Повтор не найден: количество новых инициатив не меняю.';
    voidPrimeEvent(store, previous.id);
    return 'Повторная запись отменена. История сохранена.';
  }
  if (explicitCorrection && /(исправь|ту же девушк|тот же разговор)/u.test(normalizedText) && !deniedOutreach) {
    return 'Запись не дублирую. Уточни, какое событие нужно исправить и что именно изменить.';
  }
  const result = classifyPrimeUtterance(text);
  if (!result) return null;
  if (result.category) {
    const done = await completePrimeCategory(settings, date, result.category);
    return done ? result.message : 'Это действие уже отмечено на этой неделе — второй записи не создаю.';
  }
  if (result.event) {
    // Dedupe network/voice retries by explicit operation identity, NOT by sentence text.
    // Two distinct submissions of the same phrase may describe two genuine events.
    const fingerprint = operationId ? 'erika:operation:' + operationId : undefined;
    logPrimeEvent(store, { type: result.event, date, outcome: result.outcome, fingerprint });
  }
  return result.message;
}
