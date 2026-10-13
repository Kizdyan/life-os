import { applyRemoteRuntimeRecords } from './localRuntime';
import { checkinPayload, readDailyCheckin, readPrimeDailyReflection, saveDailyCheckin, savePrimeDailyReflection, primeCheckinPayload, type DailyCheckin, type PrimeDailyReflection } from './dailyCheckin';
import { expectedVersionAfterPendingMutation, pendingMutations, queueMutation, syncLocalReplica } from './runtimeSync';
import { createRuntimeGateway } from './runtimeTransport';

const remote = import.meta.env.VITE_LIFE_OS_REMOTE_ENABLED === 'true';
const apiUrl = import.meta.env.VITE_LIFE_OS_API_URL ?? '';
const edgeUrl = import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '';
const storage = () => localStorage;

export async function persistDailyCheckin(v: DailyCheckin) {
  const s = storage();
  const old = readDailyCheckin(s, v.date);
  const n = {
    ...v,
    id: old?.id ?? v.id,
    version: old?.version ?? v.version,
    updatedAt: new Date().toISOString(),
  };
  saveDailyCheckin(s, n);
  if (remote) {
    queueMutation(s, {
      mutationId: crypto.randomUUID(),
      userId: 'self',
      recordId: n.id,
      kind: 'setting',
      expectedVersion: n.version ?? null,
      payload: checkinPayload(n),
      deleted: false,
      clientUpdatedAt: n.updatedAt,
    });
    try {
      await syncLocalReplica(
        s,
        createRuntimeGateway({ edgeUrl, apiUrl, storage: s }),
        (records) => applyRemoteRuntimeRecords(s, records),
      );
    } catch {}
  }
  window.dispatchEvent(new Event('lifeos-life-sensor'));
}

/** Private Prime facet shares existing Check-in store, owner session, offline outbox and sync. */
export async function persistPrimeDailyReflection(v: PrimeDailyReflection) {
  if (v.privacyClass !== 'PRIVATE' || v.personaExposure !== 'blocked')
    throw Error('Private Prime check-in cannot be exposed to Persona');
  const s = storage(), old = readPrimeDailyReflection(s, v.date);
  const entry = { ...v, id: old?.id ?? v.id, version: old?.version ?? v.version, updatedAt: new Date().toISOString() };
  savePrimeDailyReflection(s, entry);
  if (remote) {
    const pending = pendingMutations(s).filter(m => m.recordId === entry.id).at(-1);
    const expected = expectedVersionAfterPendingMutation(pending, entry.version ?? null);
    queueMutation(s, {
      mutationId: crypto.randomUUID(), userId:'self', recordId:entry.id, kind:'setting',
      expectedVersion: expected, payload:primeCheckinPayload(entry), deleted:false,
      clientUpdatedAt:entry.updatedAt,
    });
    try {
      await syncLocalReplica(s, createRuntimeGateway({ edgeUrl, apiUrl, storage:s }),
        (records) => applyRemoteRuntimeRecords(s, records));
    } catch { /* safely retained in the shared offline outbox */ }
  }
  window.dispatchEvent(new Event('lifeos-life-sensor'));
}
