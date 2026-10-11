import { applyRemoteRuntimeRecords } from './localRuntime';
import {
  readSleepEntries,
  readSleepEntry,
  saveSleepEntry,
  sleepEntryPayload,
  type SleepEnergyEntry,
  type SleepStorage,
} from './sleepEnergy';
import {
  HttpRemoteLifeOsGateway,
  pendingMutations,
  queueMutation,
  syncLocalReplica,
  type RuntimeSyncMutation,
} from './runtimeSync';

const remoteEnabled = import.meta.env.VITE_LIFE_OS_REMOTE_ENABLED === 'true';
const remoteApiUrl = import.meta.env.VITE_LIFE_OS_API_URL ?? '';

function browserStorage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('Локальное хранилище недоступно');
  return localStorage;
}

function mutationFor(entry: SleepEnergyEntry, mutationId: string, expectedVersion: number | null): RuntimeSyncMutation {
  return {
    mutationId,
    userId: 'self',
    recordId: entry.id,
    kind: 'setting',
    expectedVersion,
    payload: sleepEntryPayload(entry),
    deleted: false,
    clientUpdatedAt: new Date().toISOString(),
  };
}

function notifySyncState(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('lifeos-runtime-sync'));
  }
}

function queueUnsyncedSleepEntries(storage: SleepStorage & Storage): void {
  const pendingIds = new Set(
    pendingMutations(storage)
      .filter((mutation) => mutation.kind === 'setting' && mutation.payload.entityType === 'sleep_log')
      .map((mutation) => mutation.recordId),
  );

  for (const entry of readSleepEntries(storage)) {
    if (entry.version || pendingIds.has(entry.id)) continue;
    queueMutation(storage, mutationFor(entry, `sleep-bootstrap:${entry.id}`, null));
    pendingIds.add(entry.id);
  }
}

export async function syncSleepRuntime(): Promise<void> {
  if (!remoteEnabled) return;
  const storage = browserStorage();
  queueUnsyncedSleepEntries(storage);
  const gateway = new HttpRemoteLifeOsGateway(remoteApiUrl);
  await syncLocalReplica(storage, gateway, (records) => applyRemoteRuntimeRecords(storage, records));
  notifySyncState();
}

export async function persistSleepMeasurement(entry: SleepEnergyEntry): Promise<void> {
  const storage = browserStorage();
  const existing = readSleepEntry(storage, entry.date);
  const normalized: SleepEnergyEntry = {
    ...entry,
    id: existing?.id ?? entry.id,
    createdAt: existing?.createdAt ?? entry.createdAt,
    version: entry.version ?? existing?.version,
    updatedAt: new Date().toISOString(),
  };
  saveSleepEntry(storage, normalized);

  if (!remoteEnabled) return;

  queueMutation(
    storage,
    mutationFor(normalized, crypto.randomUUID(), normalized.version ?? null),
  );
  notifySyncState();

  try {
    await syncSleepRuntime();
  } catch {
    // Offline/server outage: the mutation remains in the durable outbox and will
    // be retried on the next normal Life OS sync. Local capture must still work.
  }
}
