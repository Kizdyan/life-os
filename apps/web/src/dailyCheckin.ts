import type { RuntimeSyncRecord } from './runtimeSync';

export type Score = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export interface DailyCheckin {
  id: string; date: string; mood: Score; focus: Score; workQuality: Score;
  daySatisfaction: Score; wellbeing: Score; energy: Score;
  note: string; updatedAt: string; version?: number;
}
// An optional private facet of the EXISTING daily check-in domain. Never invent
// normal mood/energy values when only the Prime reflection was filled in.
export interface PrimeDailyReflection {
  id: string; date: string; entityType: 'prime_daily_checkin';
  privacyClass: 'PRIVATE'; personaExposure: 'blocked'; projectId: 'project:prime-build:30:v1';
  answers: [string, string, string]; selfDirection?: Score; alignment?: Score;
  updatedAt: string; version?: number;
}
export interface CheckinStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; }
const KEY = 'life-os:daily-checkin:v1';
const score = (v: number): Score => {
  if (!Number.isInteger(v) || v < 1 || v > 10) throw Error('Оценка должна быть от 1 до 10');
  return v as Score;
};
function readAll(s: CheckinStorage): Array<Record<string, unknown>> {
  try {
    const x = JSON.parse(s.getItem(KEY) || '[]');
    return Array.isArray(x) ? x.filter(v => v && typeof v.date === 'string' && typeof v.id === 'string') : [];
  } catch { return []; }
}
function writeAll(s: CheckinStorage, values: Array<Record<string, unknown>>) {
  values.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  s.setItem(KEY, JSON.stringify(values));
}
export function readDailyCheckins(s: CheckinStorage): DailyCheckin[] {
  return readAll(s).filter(v =>
    v.entityType !== 'prime_daily_checkin' &&
    ['mood','focus','workQuality','daySatisfaction','wellbeing','energy'].every(k =>
      typeof v[k] === 'number' && Number.isInteger(v[k]) && (v[k] as number) >= 1 && (v[k] as number) <= 10
    )
  ) as unknown as DailyCheckin[];
}
export function readDailyCheckin(s: CheckinStorage, date: string) {
  return readDailyCheckins(s).find(v => v.date === date) || null;
}
export function makeDailyCheckin(v: Omit<DailyCheckin, 'id'|'updatedAt'>, now = new Date().toISOString()): DailyCheckin {
  return { id: `checkin:${v.date}`, ...v, mood: score(v.mood), focus: score(v.focus),
    workQuality: score(v.workQuality), daySatisfaction: score(v.daySatisfaction),
    wellbeing: score(v.wellbeing), energy: score(v.energy), updatedAt: now };
}
export function saveDailyCheckin(s: CheckinStorage, v: DailyCheckin) {
  const all = readAll(s).filter(x => !(x.date === v.date && x.entityType !== 'prime_daily_checkin'));
  all.push(v as unknown as Record<string, unknown>);
  writeAll(s, all);
}
export function checkinPayload(v: DailyCheckin) {
  return { entityType:'daily_checkin', date:v.date, mood:v.mood, focus:v.focus, workQuality:v.workQuality,
    daySatisfaction:v.daySatisfaction, wellbeing:v.wellbeing, energy:v.energy, note:v.note, updatedAt:v.updatedAt };
}
export function makePrimeDailyReflection(date: string, answers: [string, string, string],
  selfDirection?: number, alignment?: number, now = new Date().toISOString()): PrimeDailyReflection {
  const values = [selfDirection, alignment].map(v => v === undefined ? undefined : score(v));
  return { id:`checkin:prime:${date}`, date, entityType:'prime_daily_checkin',
    privacyClass:'PRIVATE', personaExposure:'blocked', projectId:'project:prime-build:30:v1',
    answers: answers.map(v => v.trim()) as [string, string, string],
    selfDirection: values[0], alignment: values[1], updatedAt:now };
}
export function readPrimeDailyReflections(s: CheckinStorage): PrimeDailyReflection[] {
  return readAll(s).filter(x =>
    x.entityType === 'prime_daily_checkin' && x.privacyClass === 'PRIVATE' && x.personaExposure === 'blocked'
    && Array.isArray(x.answers) && x.answers.length === 3 && x.answers.every(a => typeof a === 'string')
  ) as unknown as PrimeDailyReflection[];
}
export function readPrimeDailyReflection(s: CheckinStorage, date: string) {
  return readPrimeDailyReflections(s).find(v => v.date === date) || null;
}
export function savePrimeDailyReflection(s: CheckinStorage, v: PrimeDailyReflection) {
  if (v.privacyClass !== 'PRIVATE' || v.personaExposure !== 'blocked' || v.entityType !== 'prime_daily_checkin')
    throw Error('Private reflection classification required');
  const all = readAll(s).filter(x => x.id !== v.id);
  all.push(v as unknown as Record<string, unknown>);
  writeAll(s, all);
}
export function primeCheckinPayload(v: PrimeDailyReflection) {
  return { ...v };
}
export function applyRemoteCheckins(s: CheckinStorage, records: RuntimeSyncRecord[]) {
  for (const r of records.filter(x => x.kind === 'setting')) {
    const date = String(r.payload.date || '');
    if (!date) continue;
    if (r.payload.entityType === 'prime_daily_checkin') {
      if (r.deleted) {
        writeAll(s, readAll(s).filter(x => x.id !== r.id));
        continue;
      }
      if (r.payload.privacyClass !== 'PRIVATE' || r.payload.personaExposure !== 'blocked') continue;
      const p = r.payload;
      try {
        savePrimeDailyReflection(s, {
          id:r.id, date, entityType:'prime_daily_checkin', privacyClass:'PRIVATE', personaExposure:'blocked',
          projectId:'project:prime-build:30:v1', answers:p.answers as [string, string, string],
          selfDirection:p.selfDirection == null ? undefined : score(Number(p.selfDirection)),
          alignment:p.alignment == null ? undefined : score(Number(p.alignment)),
          updatedAt:String(p.updatedAt || r.updatedAt), version:r.version,
        });
      } catch { /* malformed private record must not become check-in data */ }
      continue;
    }
    if (r.payload.entityType !== 'daily_checkin') continue;
    if (r.deleted) { writeAll(s, readAll(s).filter(x => x.id !== r.id && !(x.date === date && x.entityType !== 'prime_daily_checkin'))); continue; }
    try {
      saveDailyCheckin(s, {
        id:r.id,date,mood:score(Number(r.payload.mood)),focus:score(Number(r.payload.focus)),
        workQuality:score(Number(r.payload.workQuality)),daySatisfaction:score(Number(r.payload.daySatisfaction)),
        wellbeing:score(Number(r.payload.wellbeing)),energy:score(Number(r.payload.energy)),
        note:String(r.payload.note || ''),updatedAt:String(r.payload.updatedAt || r.updatedAt),version:r.version,
      });
    } catch { /* invalid remote data is ignored */ }
  }
}
