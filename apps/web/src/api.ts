import type { Item } from './types';
import {
  applyLocalOutcome,
  applyLocalPlan,
  applyRemoteRuntimeRecords,
  readLocalItemsByIds,
  readLocalToday,
} from './localRuntime';
import {
  HttpRemoteLifeOsGateway,
  queueMutation,
  syncLocalReplica,
  type RuntimeSyncMutation,
} from './runtimeSync';

const legacySupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const legacySupabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const remoteEnabled = import.meta.env.VITE_LIFE_OS_REMOTE_ENABLED === 'true';
const remoteApiUrl = import.meta.env.VITE_LIFE_OS_API_URL ?? '';

export const backendMode = remoteEnabled
  ? 'remote'
  : legacySupabaseUrl && legacySupabaseKey
    ? 'legacy-supabase'
    : 'local';

function legacyHeaders() {
  return {
    apikey: legacySupabaseKey,
    Authorization: `Bearer ${legacySupabaseKey}`,
    'Content-Type': 'application/json',
  };
}

function storage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('Локальное хранилище недоступно');
  return localStorage;
}

function itemPayload(item: Item): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    status: item.status,
    planned_start: item.planned_start,
    planned_end: item.planned_end,
    carry_forward: item.carry_forward === true,
  };
}

function queueItemMutation(
  item: Item,
  mutationId: string,
  expectedVersion: number | null,
): void {
  const mutation: RuntimeSyncMutation = {
    mutationId,
    userId: 'self',
    recordId: item.id,
    kind: 'life_item',
    expectedVersion,
    payload: itemPayload(item),
    deleted: false,
    clientUpdatedAt: new Date().toISOString(),
  };
  queueMutation(storage(), mutation);
}

async function tryRemoteSync(): Promise<void> {
  if (!remoteEnabled) return;
  const local = storage();
  const gateway = new HttpRemoteLifeOsGateway(remoteApiUrl);
  await syncLocalReplica(local, gateway, (records) => applyRemoteRuntimeRecords(local, records));
}

export async function today(date: string): Promise<Item[]> {
  if (backendMode === 'remote') {
    try {
      await tryRemoteSync();
    } catch {
      // Offline-first: Today remains usable from the local replica.
    }
    return readLocalToday(storage(), date);
  }

  if (backendMode === 'local') return readLocalToday(storage(), date);

  const response = await fetch(
    `${legacySupabaseUrl}/rest/v1/life_items?select=*&planned_start=gte.${date}T00:00:00&planned_start=lt.${date}T23:59:59&order=planned_start.asc`,
    { headers: legacyHeaders() },
  );
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function outcome(item: Item, command: 'complete' | 'not_complete') {
  if (backendMode === 'remote') {
    const previousVersion = item.version ?? null;
    const result = applyLocalOutcome(storage(), item, command, () => crypto.randomUUID());
    queueItemMutation(result.current, crypto.randomUUID(), previousVersion);
    if (result.successor) queueItemMutation(result.successor, crypto.randomUUID(), null);
    try {
      await tryRemoteSync();
    } catch {
      // The mutation stays in the durable outbox and will retry later.
    }
    return result;
  }

  if (backendMode === 'local') {
    return applyLocalOutcome(storage(), item, command, () => crypto.randomUUID());
  }

  const carry = command === 'not_complete' && !!item.carry_forward;
  const date = item.planned_start?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const response = await fetch(`${legacySupabaseUrl}/rest/v1/rpc/life_set_outcome`, {
    method: 'POST',
    headers: legacyHeaders(),
    body: JSON.stringify({
      p_item_id: item.id,
      p_planned_date: date,
      p_command: command,
      p_source: 'ui',
      p_carry_forward: carry,
      p_next_date: carry ? next.toISOString().slice(0, 10) : null,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export type PlanInput = {
  title: string;
  planned_start: string;
  planned_end: string;
  kind?: string;
  carry_forward?: boolean;
};

export async function applyPlan(idempotencyKey: string, items: PlanInput[]) {
  if (backendMode === 'remote') {
    const result = applyLocalPlan(storage(), idempotencyKey, items, () => crypto.randomUUID());
    if (result.applied) {
      const created = readLocalItemsByIds(storage(), result.ids);
      for (const item of created) {
        queueItemMutation(item, `${idempotencyKey}:${item.id}`, null);
      }
    }
    try {
      await tryRemoteSync();
    } catch {
      // The plan is usable locally and remains queued until remote sync succeeds.
    }
    return result;
  }

  if (backendMode === 'local') {
    return applyLocalPlan(storage(), idempotencyKey, items, () => crypto.randomUUID());
  }

  const response = await fetch(`${legacySupabaseUrl}/rest/v1/rpc/life_apply_plan`, {
    method: 'POST',
    headers: legacyHeaders(),
    body: JSON.stringify({ p_idempotency_key: idempotencyKey, p_items: items, p_source: 'erika' }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ applied: boolean; ids: string[]; replayed: boolean }>;
}
