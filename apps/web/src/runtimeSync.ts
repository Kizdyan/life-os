export interface SyncStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type RuntimeRecordKind =
  | 'life_item'
  | 'life_outcome'
  | 'memory'
  | 'audit'
  | 'project'
  | 'goal'
  | 'setting';

export interface RuntimeSyncMutation {
  mutationId: string;
  userId: string;
  recordId: string;
  kind: RuntimeRecordKind;
  expectedVersion: number | null;
  payload: Record<string, unknown>;
  deleted: boolean;
  clientUpdatedAt: string;
}

export interface RuntimeSyncRecord {
  id: string;
  userId: string;
  kind: RuntimeRecordKind;
  version: number;
  payload: Record<string, unknown>;
  deleted: boolean;
  updatedAt: string;
}

export interface RuntimeConflictState {
  mutationId: string;
  expectedVersion: number | null;
  currentVersion: number | null;
}

export type RuntimeConflictResolution = 'accept_remote' | 'retry_local';

export interface RuntimeSyncResponse {
  storeRevision: number;
  results: Array<{
    mutationId: string;
    status: 'applied' | 'duplicate' | 'conflict';
    storeRevision: number;
    record: RuntimeSyncRecord | null;
    conflict: { expectedVersion: number | null; currentVersion: number | null } | null;
  }>;
  records: RuntimeSyncRecord[];
}

export interface RemoteLifeOsGateway {
  sync(input: { mutations: RuntimeSyncMutation[]; sinceRevision: number }): Promise<RuntimeSyncResponse>;
}

export interface ReplicaSyncResult {
  storeRevision: number;
  conflicts: RuntimeConflictState[];
}

const OUTBOX_KEY = 'life-os:runtime-outbox:v1';
const REVISION_KEY = 'life-os:runtime-revision:v1';
const CONFLICT_KEY = 'life-os:runtime-conflicts:v1';

export function pendingMutations(storage: SyncStorage): RuntimeSyncMutation[] {
  try {
    const raw = storage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isMutation) : [];
  } catch {
    return [];
  }
}

export function readRuntimeConflicts(storage: SyncStorage): RuntimeConflictState[] {
  try {
    const raw = storage.getItem(CONFLICT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConflict);
  } catch {
    return [];
  }
}

export function queueMutation(storage: SyncStorage, mutation: RuntimeSyncMutation): void {
  validateMutation(mutation);
  const current = pendingMutations(storage);
  if (current.some((item) => item.mutationId === mutation.mutationId)) return;
  storage.setItem(OUTBOX_KEY, JSON.stringify([...current, mutation]));
}

export function currentStoreRevision(storage: SyncStorage): number {
  const raw = storage.getItem(REVISION_KEY);
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function resolveRuntimeConflicts(
  storage: SyncStorage,
  resolution: RuntimeConflictResolution,
  createMutationId: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
): number {
  const conflicts = readRuntimeConflicts(storage);
  if (!conflicts.length) return 0;

  const conflictByMutation = new Map(conflicts.map((conflict) => [conflict.mutationId, conflict]));
  let resolved = 0;
  const nextOutbox: RuntimeSyncMutation[] = [];

  for (const mutation of pendingMutations(storage)) {
    const conflict = conflictByMutation.get(mutation.mutationId);
    if (!conflict) {
      nextOutbox.push(mutation);
      continue;
    }

    resolved += 1;
    if (resolution === 'accept_remote') continue;

    const replacement: RuntimeSyncMutation = {
      ...mutation,
      mutationId: createMutationId(),
      expectedVersion: conflict.currentVersion,
      clientUpdatedAt: now(),
    };
    validateMutation(replacement);
    nextOutbox.push(replacement);
  }

  storage.setItem(OUTBOX_KEY, JSON.stringify(nextOutbox));
  // Conflict state describes the previous outbox generation. Orphan entries have
  // no local mutation left to resolve, so keeping them would create a permanent
  // false-positive conflict banner.
  storage.setItem(CONFLICT_KEY, JSON.stringify([]));
  return resolved;
}

export async function syncLocalReplica(
  storage: SyncStorage,
  gateway: RemoteLifeOsGateway,
  applyRecords: (records: RuntimeSyncRecord[]) => void,
): Promise<ReplicaSyncResult> {
  const mutations = pendingMutations(storage);
  const sinceRevision = currentStoreRevision(storage);
  const response = await gateway.sync({ mutations, sinceRevision });

  // A stale client can already be at the server's current store revision. In
  // that case listSince(sinceRevision) is empty even though a conflict result
  // contains the canonical record that must replace the stale local replica.
  // Seed with conflict records, then let the end-of-request snapshot win when
  // the same record also appears there.
  const canonicalRecords = new Map<string, RuntimeSyncRecord>();
  for (const result of response.results) {
    if (result.status !== 'conflict' || !result.record) continue;
    canonicalRecords.set(recordKey(result.record), result.record);
  }
  for (const record of response.records) canonicalRecords.set(recordKey(record), record);
  applyRecords([...canonicalRecords.values()]);

  const acknowledged = new Set(
    response.results
      .filter((result) => result.status === 'applied' || result.status === 'duplicate')
      .map((result) => result.mutationId),
  );

  const remaining = mutations.filter((mutation) => !acknowledged.has(mutation.mutationId));
  storage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
  storage.setItem(REVISION_KEY, String(response.storeRevision));

  const conflicts = response.results
    .filter((result) => result.status === 'conflict' && result.conflict)
    .map((result) => ({
      mutationId: result.mutationId,
      expectedVersion: result.conflict!.expectedVersion,
      currentVersion: result.conflict!.currentVersion,
    }));

  storage.setItem(CONFLICT_KEY, JSON.stringify(conflicts));
  return { storeRevision: response.storeRevision, conflicts };
}

export class HttpRemoteLifeOsGateway implements RemoteLifeOsGateway {
  constructor(private readonly baseUrl = '', private readonly fetchImpl: typeof fetch = fetch) {}

  async sync(input: { mutations: RuntimeSyncMutation[]; sinceRevision: number }): Promise<RuntimeSyncResponse> {
    const base = this.baseUrl.trim().replace(/\/+$/, '');
    const endpoint = base ? `${base}/api/runtime/sync` : '/api/runtime/sync';

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) throw new Error(`Life OS sync failed: ${response.status}`);
    return response.json() as Promise<RuntimeSyncResponse>;
  }
}

function recordKey(record: RuntimeSyncRecord): string {
  return `${record.userId}\u0000${record.id}`;
}

function validateMutation(mutation: RuntimeSyncMutation): void {
  if (!mutation.mutationId.trim()) throw new Error('mutationId is required');
  if (!mutation.userId.trim()) throw new Error('userId is required');
  if (!mutation.recordId.trim()) throw new Error('recordId is required');
}

function isMutation(value: unknown): value is RuntimeSyncMutation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RuntimeSyncMutation>;
  return typeof candidate.mutationId === 'string'
    && typeof candidate.userId === 'string'
    && typeof candidate.recordId === 'string'
    && typeof candidate.kind === 'string'
    && (candidate.expectedVersion === null || typeof candidate.expectedVersion === 'number')
    && typeof candidate.payload === 'object'
    && candidate.payload !== null
    && !Array.isArray(candidate.payload)
    && typeof candidate.deleted === 'boolean'
    && typeof candidate.clientUpdatedAt === 'string';
}

function isConflict(value: unknown): value is RuntimeConflictState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RuntimeConflictState>;
  return typeof candidate.mutationId === 'string'
    && (candidate.expectedVersion === null || typeof candidate.expectedVersion === 'number')
    && (candidate.currentVersion === null || typeof candidate.currentVersion === 'number');
}
