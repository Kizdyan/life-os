import type { RuntimeSyncRecord, SyncStorage } from './runtimeSync';

export type EvidenceLevel = 'self_report' | 'aspiration' | 'hypothesis' | 'observed';
export type HeroModeId = 'gentleman' | 'urban_charmer' | 'quiet_romantic' | 'dark_presence' | 'raw_realist';
export interface HeroExercise {
  id: string;
  createdAt: string;
  mode: HeroModeId;
  naturalness: number;
  confidence: number;
  note: string;
  evidenceLevel: 'self_report';
}
export interface HeroIdentityProfile {
  schemaVersion: 1;
  updatedAt: string;
  version?: number;
  interview: { answered: 76; total: 76; visualVerified: false };
  core: { values: string[]; source: 'self_report'; questionRefs: number[] };
  prime: { priorities: string[]; activation: string[]; boundaries: string[]; source: 'aspiration' };
  publicBrand: { workingName: string; direction: string; distanceFromEveryday: number; verified: false };
  style: { colors: string[]; garments: string[]; hair: 'unresolved'; glasses: 'to_test' };
  actor: { freedom: number; independentFromPublicBrand: true; modes: { id: HeroModeId; status: EvidenceLevel }[] };
  exercises: HeroExercise[];
}
const KEY = 'life-os:hero-identity:v1';
const RECORD_ID = 'persona:hero-identity';
export const HERO_IDENTITY_RECORD_ID = RECORD_ID;
export function seedHeroIdentity(): HeroIdentityProfile {
  return {
    schemaVersion: 1,
    updatedAt: '',
    interview: { answered: 76, total: 76, visualVerified: false },
    core: {
      values: [], // private questionnaire values arrive through authenticated runtime memory
      source: 'self_report',
      questionRefs: [4, 24, 72],
    },
    prime: {
      priorities: [], // keep private interview data out of public frontend bundle
      activation: [],
      boundaries: [],
      source: 'aspiration',
    },
    publicBrand: {
      workingName: 'Архетип и бренд',
      direction: 'Персональный профиль ожидает защищённой синхронизации',
      distanceFromEveryday: 0,
      verified: false,
    },
    style: {
      colors: [],
      garments: [],
      hair: 'unresolved',
      glasses: 'to_test',
    },
    actor: {
      freedom: 0,
      independentFromPublicBrand: true,
      modes: [
        { id: 'gentleman', status: 'hypothesis' },
        { id: 'urban_charmer', status: 'hypothesis' },
        { id: 'quiet_romantic', status: 'hypothesis' },
        { id: 'dark_presence', status: 'hypothesis' },
        { id: 'raw_realist', status: 'hypothesis' },
      ],
    },
    exercises: [],
  };
}
export function readHeroIdentity(storage: SyncStorage): HeroIdentityProfile {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) || 'null');
    if (value && typeof value === 'object' && (value as HeroIdentityProfile).schemaVersion === 1) {
      const record = value as HeroIdentityProfile;
      return { ...seedHeroIdentity(), ...record, exercises: Array.isArray(record.exercises) ? record.exercises : [] };
    }
  } catch { /* invalid local state must not break Persona */ }
  return seedHeroIdentity();
}
export function saveHeroIdentity(storage: SyncStorage, p: HeroIdentityProfile): void {
  storage.setItem(KEY, JSON.stringify(p));
}
export function heroIdentityPayload(p: HeroIdentityProfile): Record<string, unknown> {
  return { entityType: 'hero_identity_profile', profile: p };
}
export function addHeroExercise(p: HeroIdentityProfile, x: HeroExercise): HeroIdentityProfile {
  if (!Number.isInteger(x.naturalness) || x.naturalness < 1 || x.naturalness > 10 ||
      !Number.isInteger(x.confidence) || x.confidence < 1 || x.confidence > 10) {
    throw new Error('Exercise scores must be 1–10');
  }
  return { ...p, exercises: [...p.exercises, x].slice(-100) };
}
export function applyRemoteHeroIdentity(storage: SyncStorage, records: RuntimeSyncRecord[]): void {
  const matching = records.filter(r => r.kind === 'memory' && r.id === RECORD_ID && !r.deleted && r.payload.entityType === 'hero_identity_profile');
  const latest = matching.reduce<RuntimeSyncRecord | null>((best, current) => !best || current.version > best.version ? current : best, null);
  if (!latest) return;
  const profile = latest.payload.profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || (profile as any).schemaVersion !== 1) return;
  const next = profile as HeroIdentityProfile;
  saveHeroIdentity(storage, { ...seedHeroIdentity(), ...next, version: latest.version, updatedAt: latest.updatedAt });
}
