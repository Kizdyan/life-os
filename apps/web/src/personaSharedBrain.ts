import type { PersonaIdea, PersonaShootingBrief } from './personaIdeaState';

export const PERSONA_SHARED_BRAIN_KEY = 'lifeos:persona:shared-brain:v1';
export const PERSONA_EVIDENCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PERSONA_APPROVAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PERSONA_HISTORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type StorageReader = Pick<Storage, 'getItem' | 'setItem'>;
export type Freshness = 'fresh' | 'cached' | 'stale' | 'unverified';

export interface ApprovedBrainEntry {
  idea: PersonaIdea;
  approvalProof: string;
  approvedAt: string;
  evidenceCheckedAt: string;
  savedAt: string;
  marketEvidence: PersonaIdea['marketEvidence'];
  trends: string[];
  criticJudge: PersonaIdea['qualityVerdict'];
  shootingBrief?: PersonaShootingBrief;
}

export interface PersonaSharedBrain {
  schema: 1;
  entries: ApprovedBrainEntry[];
}

export function readSharedBrain(storage: StorageReader): PersonaSharedBrain {
  try {
    const data: unknown = JSON.parse(storage.getItem(PERSONA_SHARED_BRAIN_KEY) || 'null');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { schema: 1, entries: [] };
    const value = data as Record<string, unknown>;
    if (value.schema !== 1 || !Array.isArray(value.entries)) return { schema: 1, entries: [] };
    const entries = value.entries.filter((item): item is ApprovedBrainEntry =>
      !!item && typeof item === 'object' &&
      typeof item.approvalProof === 'string' && item.approvalProof.length > 20 &&
      typeof item.savedAt === 'string' && !!item.idea && typeof item.idea === 'object');
    return { schema: 1, entries: entries.slice(0, 30) };
  } catch {
    return { schema: 1, entries: [] };
  }
}

export function entryFreshness(entry: ApprovedBrainEntry, now = Date.now()): Freshness {
  const issued = Date.parse(entry.approvedAt);
  const market = Date.parse(entry.evidenceCheckedAt);
  if (!Number.isFinite(issued) || !Number.isFinite(market) || issued > now ||
      market > now || issued < now - PERSONA_HISTORY_TTL_MS) return 'unverified';
  if (market < now - PERSONA_EVIDENCE_TTL_MS) return 'stale';
  if (issued < now - PERSONA_APPROVAL_TTL_MS) return 'stale';
  return 'cached';
}

export function brainForRuntime(storage: StorageReader, now = Date.now()): {
  entries: ApprovedBrainEntry[];
} {
  const brain = readSharedBrain(storage);
  // Pass only signed approval envelopes; server ALWAYS verifies their HMAC and expiry.
  return { entries: brain.entries.filter(x =>
    entryFreshness(x, now) !== 'unverified').slice(0, 8) };
}

export function rememberApprovedBrain(
  storage: StorageReader,
  raw: {
    recommendation?: PersonaIdea | null;
    approvalProof?: unknown;
    approvedAt?: unknown;
    evidenceCheckedAt?: unknown;
  },
  now = Date.now(),
): boolean {
  if (!raw.recommendation || typeof raw.approvalProof !== 'string' ||
      typeof raw.approvedAt !== 'string' || typeof raw.evidenceCheckedAt !== 'string' ||
      !raw.approvalProof.trim()) return false;
  const approvedAt = Date.parse(raw.approvedAt);
  const checked = Date.parse(raw.evidenceCheckedAt);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(checked) ||
      approvedAt > now || checked > now) return false;
  const idea = raw.recommendation;
  const entry: ApprovedBrainEntry = {
    idea,
    approvalProof: raw.approvalProof,
    approvedAt: raw.approvedAt,
    evidenceCheckedAt: raw.evidenceCheckedAt,
    savedAt: new Date(now).toISOString(),
    marketEvidence: idea.marketEvidence ?? [],
    trends: Array.isArray(idea.whyNow) ? idea.whyNow : [],
    criticJudge: idea.qualityVerdict,
    shootingBrief: idea.shootingBrief,
  };
  const current = readSharedBrain(storage);
  current.entries = [entry, ...current.entries.filter(x => x.idea.id !== idea.id)].slice(0, 30);
  try {
    storage.setItem(PERSONA_SHARED_BRAIN_KEY, JSON.stringify(current));
    return true;
  } catch { return false; }
}

export function rememberShootingBrain(storage: StorageReader, ideaId: string, brief: PersonaShootingBrief): void {
  const current = readSharedBrain(storage);
  const entry = current.entries.find(x => x.idea.id === ideaId);
  if (!entry) return;
  entry.shootingBrief = brief;
  try { storage.setItem(PERSONA_SHARED_BRAIN_KEY, JSON.stringify(current)); } catch { /* storage quota */ }
}

export function freshnessLabel(mode: Freshness): string {
  switch (mode) {
    case 'fresh': return 'СВЕЖАЯ АНАЛИТИКА';
    case 'cached': return 'ПОДТВЕРЖДЁННЫЙ КЭШ';
    case 'stale': return 'УСТАРЕВШИЕ ДАННЫЕ';
    case 'unverified': return 'БЕЗ РЫНОЧНОЙ ПРОВЕРКИ';
  }
}
