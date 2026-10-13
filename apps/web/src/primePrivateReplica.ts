import type { RuntimeSyncRecord, SyncStorage } from './runtimeSync';

// Offline copy of the authenticated, owner-scoped canonical setting record.
// NEVER expose these records through Persona/public-context projections.
export const PRIME_PRIVATE_JOURNAL_ID = 'prime:private:journal:v1';
const LOCAL_KEY = 'life-os:prime-build:private:v1';
const VERSION_KEY = 'life-os:prime-build:private-record-version:v1';
const QUEUED_DIGEST_KEY = 'life-os:prime-build:private-queued-digest:v1';
export function primePrivateVersion(store: SyncStorage): number | null {
  const value = store.getItem(VERSION_KEY);
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
export function primePrivateQueuedDigest(store: SyncStorage): string | null {
  return store.getItem(QUEUED_DIGEST_KEY);
}
export function markPrimePrivateQueued(store: SyncStorage, digest: string): void {
  store.setItem(QUEUED_DIGEST_KEY, digest);
}
export function primePrivateSnapshot(store: SyncStorage): string | null {
  return store.getItem(LOCAL_KEY);
}
export function applyRemotePrimePrivateRecords(store: SyncStorage, records: RuntimeSyncRecord[]): void {
  for (const record of records) {
    if (record.kind !== 'setting' || record.id !== PRIME_PRIVATE_JOURNAL_ID) continue;
    if (record.deleted) continue; // never erase private local audit due to remote tombstone silently
    const p = record.payload;
    if (p.entityType !== 'prime_private_journal' || p.privacyClass !== 'PRIVATE' || p.personaExposure !== 'blocked') continue;
    if (!p.journal || typeof p.journal !== 'object' || Array.isArray(p.journal)) continue;
    const j = p.journal as Record<string, unknown>;
    if (!Array.isArray(j.events) || !Array.isArray(j.audit)) continue;
    // The existing sync gateway authenticates the owner before supplying records.
    store.setItem(LOCAL_KEY, JSON.stringify(j));
    store.setItem(VERSION_KEY, String(record.version));
    markPrimePrivateQueued(store, fingerprintPrimePrivate(JSON.stringify(j)));
  }
}
// Non-cryptographic change detection only. Never use this as authentication.
export function fingerprintPrimePrivate(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}
