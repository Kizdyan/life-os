import { applyRemoteRuntimeRecords } from './localRuntime';
import { createRuntimeGateway } from './runtimeTransport';
import { expectedVersionAfterPendingMutation, pendingMutations, queueMutation, syncLocalReplica } from './runtimeSync';
import {
  PRIME_PRIVATE_JOURNAL_ID, fingerprintPrimePrivate, markPrimePrivateQueued,
  primePrivateQueuedDigest, primePrivateSnapshot, primePrivateVersion,
} from './primePrivateReplica';

const remote = import.meta.env.VITE_LIFE_OS_REMOTE_ENABLED === 'true';
const apiUrl = import.meta.env.VITE_LIFE_OS_API_URL ?? '';
const edgeUrl = import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '';

/** Uses the EXISTING owner-authenticated Life OS setting/outbox/audit path.
 * Local storage is the offline replica only, not a second server-side authority.
 * Importing an old local Prime journal automatically queues the same stable ID.
 */
export async function persistPrimePrivateJournal(): Promise<void> {
  const s = localStorage;
  const raw = primePrivateSnapshot(s);
  if (!raw) return;
  let journal: unknown;
  try { journal = JSON.parse(raw); } catch { return; }
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) return;
  const events = (journal as Record<string, unknown>).events;
  const audit = (journal as Record<string, unknown>).audit;
  if (!Array.isArray(events) || !Array.isArray(audit)) return;
  const digest = fingerprintPrimePrivate(raw);
  if (!remote) return; // explicit offline-local mode; never claim cloud persistence
  if (primePrivateQueuedDigest(s) === digest) return;
  const pending = pendingMutations(s).filter(m => m.recordId === PRIME_PRIVATE_JOURNAL_ID).at(-1);
  const expected = expectedVersionAfterPendingMutation(pending, primePrivateVersion(s));
  queueMutation(s, {
    mutationId: crypto.randomUUID(),
    userId: 'self', // server ignores client-supplied owner; derives it from sealed session
    recordId: PRIME_PRIVATE_JOURNAL_ID, kind:'setting', expectedVersion:expected,
    payload: { entityType:'prime_private_journal', schemaVersion:1, privacyClass:'PRIVATE',
      personaExposure:'blocked', scope:'life_os_private', journal },
    deleted:false, clientUpdatedAt:new Date().toISOString(),
  });
  markPrimePrivateQueued(s, digest);
  try {
    await syncLocalReplica(s, createRuntimeGateway({edgeUrl,apiUrl,storage:s}),
      records => applyRemoteRuntimeRecords(s, records));
  } catch { /* Offline-first: queued mutation remains in existing outbox. */ }
}
