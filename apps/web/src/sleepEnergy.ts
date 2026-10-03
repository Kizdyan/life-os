export interface SleepEnergyEntry {
  id: string;
  date: string;
  durationMinutes: number;
  sleepStart: string;
  wakeTime: string;
  energy: number;
  sleepQuality: number | null;
  wellbeing: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface SleepWindow {
  start: string;
  end: string;
  label: string;
}

export interface SleepStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'life-os:sleep-energy:v1';

export function durationToMinutes(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('Укажи сон от 0,5 до 24 часов');
  return Math.round(hours * 60);
}

export function suggestedSleepWindows(durationMinutes: number, wakeHours = [6, 7, 8, 9, 10, 11, 12, 13]): SleepWindow[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 24 * 60) return [];
  return wakeHours.map((wakeHour) => {
    const wake = wakeHour * 60;
    const start = ((wake - durationMinutes) % 1440 + 1440) % 1440;
    return {
      start: clock(start),
      end: clock(wake % 1440),
      label: `${clock(start)}–${clock(wake % 1440)}`,
    };
  });
}

export function readSleepEntries(storage: SleepStorage): SleepEnergyEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function readSleepEntry(storage: SleepStorage, date: string): SleepEnergyEntry | null {
  return readSleepEntries(storage).find((entry) => entry.date === date) ?? null;
}

export function saveSleepEntry(storage: SleepStorage, entry: SleepEnergyEntry): void {
  validate(entry);
  const entries = readSleepEntries(storage).filter((candidate) => candidate.date !== entry.date);
  entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  storage.setItem(KEY, JSON.stringify(entries));
}

export function sleepSummary(storage: SleepStorage, days = 30): { count: number; averageHours: number; averageEnergy: number } {
  const entries = readSleepEntries(storage).slice(-days);
  if (!entries.length) return { count: 0, averageHours: 0, averageEnergy: 0 };
  return {
    count: entries.length,
    averageHours: round(entries.reduce((sum, entry) => sum + entry.durationMinutes, 0) / entries.length / 60),
    averageEnergy: round(entries.reduce((sum, entry) => sum + entry.energy, 0) / entries.length),
  };
}

export function newSleepEntry(input: {
  date: string;
  hours: number;
  window: SleepWindow;
  energy: number;
  sleepQuality?: number | null;
  wellbeing?: number | null;
  note?: string;
}, now = new Date().toISOString(), id = crypto.randomUUID()): SleepEnergyEntry {
  const entry: SleepEnergyEntry = {
    id,
    date: input.date,
    durationMinutes: durationToMinutes(input.hours),
    sleepStart: input.window.start,
    wakeTime: input.window.end,
    energy: input.energy,
    sleepQuality: input.sleepQuality ?? null,
    wellbeing: input.wellbeing ?? null,
    note: input.note?.trim() ?? '',
    createdAt: now,
    updatedAt: now,
  };
  validate(entry);
  return entry;
}

function validate(entry: SleepEnergyEntry): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error('Некорректная дата');
  if (!Number.isInteger(entry.durationMinutes) || entry.durationMinutes <= 0 || entry.durationMinutes > 1440) throw new Error('Некорректная длительность сна');
  if (entry.energy < 1 || entry.energy > 10) throw new Error('Энергия должна быть от 1 до 10');
  if (entry.sleepQuality !== null && (entry.sleepQuality < 1 || entry.sleepQuality > 10)) throw new Error('Качество сна должно быть от 1 до 10');
  if (entry.wellbeing !== null && (entry.wellbeing < 1 || entry.wellbeing > 10)) throw new Error('Самочувствие должно быть от 1 до 10');
}

function isEntry(value: unknown): value is SleepEnergyEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SleepEnergyEntry>;
  return typeof entry.id === 'string' && typeof entry.date === 'string' && typeof entry.durationMinutes === 'number'
    && typeof entry.sleepStart === 'string' && typeof entry.wakeTime === 'string' && typeof entry.energy === 'number';
}

function clock(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
