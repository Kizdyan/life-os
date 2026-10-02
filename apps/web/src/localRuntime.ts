import type { Item } from './types';
import type { RuntimeSyncRecord } from './runtimeSync';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LocalPlanInput {
  title: string;
  planned_start: string;
  planned_end: string | null;
  kind?: string;
  carry_forward?: boolean;
}

interface LocalState {
  schemaVersion: 1;
  items: Item[];
  plans: Record<string, string[]>;
}

const KEY = 'life-os:local-runtime:v1';

export function readAllLocalItems(storage: StorageLike): Item[] {
  return read(storage).items.map((item) => ({ ...item }));
}

export function readLocalToday(storage: StorageLike, date: string): Item[] {
  return read(storage).items
    .filter((item) => item.planned_start?.slice(0, 10) === date)
    .sort((a, b) => (a.planned_start ?? '').localeCompare(b.planned_start ?? ''));
}

export function readLocalItemsByIds(storage: StorageLike, ids: string[]): Item[] {
  const wanted = new Set(ids);
  return read(storage).items.filter((item) => wanted.has(item.id));
}

export function applyLocalPlan(
  storage: StorageLike,
  idempotencyKey: string,
  inputs: LocalPlanInput[],
  createId: () => string,
): { applied: boolean; ids: string[]; replayed: boolean } {
  const key = idempotencyKey.trim();
  if (!key) throw new Error('Idempotency key is required');
  const state = read(storage);
  const known = state.plans[key];
  if (known) return { applied: false, ids: [...known], replayed: true };

  const created: Item[] = inputs.map((input) => {
    if (!input.title.trim()) throw new Error('Plan title is required');
    if (!input.planned_start) throw new Error('planned_start is required');
    return {
      id: createId(),
      title: input.title.trim(),
      kind: input.kind?.trim() || 'task',
      status: 'planned',
      planned_start: input.planned_start,
      planned_end: input.planned_end ?? null,
      carry_forward: input.carry_forward === true,
    };
  });

  state.items.push(...created);
  state.plans[key] = created.map((item) => item.id);
  write(storage, state);
  return { applied: true, ids: created.map((item) => item.id), replayed: false };
}

export function applyLocalOutcome(
  storage: StorageLike,
  item: Item,
  command: 'complete' | 'not_complete',
  createId: () => string,
): { current: Item; successor: Item | null } {
  const state = read(storage);
  const index = state.items.findIndex((candidate) => candidate.id === item.id);
  const existing = index >= 0 ? state.items[index] : item;
  const carry = command === 'not_complete' && existing.carry_forward === true;
  const current: Item = {
    ...existing,
    status: command === 'complete' ? 'completed' : carry ? 'missed_time' : 'not_completed',
  };
  if (index >= 0) state.items[index] = current;
  else state.items.push(current);

  let successor: Item | null = null;
  if (carry) {
    const nextDate = nextDay(existing.planned_start?.slice(0, 10) ?? localDate());
    successor = {
      ...existing,
      id: createId(),
      status: 'planned',
      planned_start: shiftDate(existing.planned_start, nextDate),
      planned_end: shiftDate(existing.planned_end, nextDate),
      version: undefined,
    };
    state.items.push(successor);
  }

  write(storage, state);
  return { current, successor };
}

export function applyRemoteRuntimeRecords(storage: StorageLike, records: RuntimeSyncRecord[]): void {
  if (!records.length) return;
  const state = read(storage);
  const byId = new Map(state.items.map((item) => [item.id, item]));

  for (const record of records) {
    if (record.kind !== 'life_item') continue;
    if (record.deleted) {
      byId.delete(record.id);
      continue;
    }

    const payload = record.payload;
    if (typeof payload.title !== 'string' || typeof payload.status !== 'string') continue;

    const previous = byId.get(record.id);
    const item: Item = {
      id: record.id,
      title: payload.title,
      kind: typeof payload.kind === 'string' ? payload.kind : previous?.kind ?? 'task',
      status: payload.status as Item['status'],
      planned_start: typeof payload.planned_start === 'string' || payload.planned_start === null
        ? payload.planned_start
        : previous?.planned_start ?? null,
      planned_end: typeof payload.planned_end === 'string' || payload.planned_end === null
        ? payload.planned_end
        : previous?.planned_end ?? null,
      carry_forward: typeof payload.carry_forward === 'boolean'
        ? payload.carry_forward
        : previous?.carry_forward,
      version: record.version,
    };
    byId.set(record.id, item);
  }

  state.items = [...byId.values()];
  write(storage, state);
}

function read(storage: StorageLike): LocalState {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items) || !parsed.plans || typeof parsed.plans !== 'object') {
      return empty();
    }
    return {
      schemaVersion: 1,
      items: parsed.items as Item[],
      plans: parsed.plans as Record<string, string[]>,
    };
  } catch {
    return empty();
  }
}

function write(storage: StorageLike, state: LocalState): void {
  storage.setItem(KEY, JSON.stringify(state));
}

function empty(): LocalState {
  return { schemaVersion: 1, items: [], plans: {} };
}

function nextDay(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function shiftDate(value: string | null, nextDate: string): string | null {
  return value ? `${nextDate}${value.slice(10)}` : null;
}

function localDate(): string {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
