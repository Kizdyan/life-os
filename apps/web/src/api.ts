import type { Item } from './types';
import {
  applyLocalOutcome,
  applyLocalPlan,
  applyRemoteRuntimeRecords,
  readAllLocalItems,
  readLocalRange,
  readLocalProjects,
  readLocalGoals,
  upsertLocalItem,
  upsertLocalProject,
  upsertLocalGoal,
  readLocalItemsByIds,
  readLocalToday,
  startLocalItem,
  undoLocalOutcome,
} from './localRuntime';
import { completeRemoteBootstrapIfAcknowledged, queueLocalBootstrap } from './runtimeBootstrap';
import {
  expectedVersionAfterPendingMutation,
  pendingMutations,
  queueMutation,
  resolveRuntimeConflicts as resolveQueuedRuntimeConflicts,
  syncLocalReplica,
  type RuntimeConflictResolution,
  type RuntimeConflictState,
} from './runtimeSync';
import { createRuntimeGateway } from './runtimeTransport';

const su = import.meta.env.VITE_SUPABASE_URL;
const sk = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const remote = import.meta.env.VITE_LIFE_OS_REMOTE_ENABLED === 'true';
const url = import.meta.env.VITE_LIFE_OS_API_URL ?? '';
const edgeUrl = import.meta.env.VITE_LIFE_OS_EDGE_RUNTIME_URL ?? '';

export const backendMode = remote ? 'remote' : su && sk ? 'legacy-supabase' : 'local';

export interface OutcomeSyncMeta {
  currentMutationId: string | null;
  successorMutationId: string | null;
}

export class RuntimeConflictError extends Error {
  constructor(readonly conflicts: RuntimeConflictState[]) {
    super('Есть конфликт синхронизации между устройствами.');
  }
}

const storage = () => localStorage;

function payload(i: Item) {
  return {
    id: i.id,
    title: i.title,
    kind: i.kind,
    status: i.status,
    planned_start: i.planned_start,
    planned_end: i.planned_end,
    actual_start: i.actual_start ?? null,
    actual_end: i.actual_end ?? null,
    deep_work: i.deep_work === true,
    carry_forward: i.carry_forward === true,
    priority: i.priority ?? 'normal', project_id:i.project_id??null, goal_id:i.goal_id??null, notes:i.notes??null,
  };
}

function queue(i: Item, id: string, v: number | null, deleted = false) {
  queueMutation(storage(), {
    mutationId: id,
    userId: 'self',
    recordId: i.id,
    kind: 'life_item',
    expectedVersion: v,
    payload: payload(i),
    deleted,
    clientUpdatedAt: new Date().toISOString(),
  });
}

async function sync() {
  if (!remote) return;
  const s = storage();
  queueLocalBootstrap(s, readAllLocalItems(s));
  const r = await syncLocalReplica(
    s,
    createRuntimeGateway({ edgeUrl, apiUrl: url, storage: s }),
    (records) => applyRemoteRuntimeRecords(s, records),
  );
  completeRemoteBootstrapIfAcknowledged(s);
  window.dispatchEvent(new Event('lifeos-runtime-sync'));
  if (r.conflicts.length) throw new RuntimeConflictError(r.conflicts);
}

export async function today(d: string) {
  if (backendMode === 'remote') {
    try { await sync(); } catch {}
    return readLocalToday(storage(), d);
  }
  if (backendMode === 'local') return readLocalToday(storage(), d);
  const r = await fetch(
    `${su}/rest/v1/life_items?select=*&planned_start=gte.${d}T00:00:00&planned_start=lt.${d}T23:59:59&order=planned_start.asc`,
    { headers: { apikey: sk, Authorization: `Bearer ${sk}` } },
  );
  return r.json();
}

export async function startItem(i: Item) {
  if (backendMode === 'legacy-supabase') throw Error('Обнови runtime для учёта фактического времени');
  const n = startLocalItem(storage(), i);
  if (remote) {
    queue(n, crypto.randomUUID(), i.version ?? null);
    try { await sync(); } catch {}
  }
  return n;
}

export async function outcome(i: Item, c: 'complete' | 'not_complete') {
  if (backendMode === 'legacy-supabase') {
    const r = await fetch(`${su}/rest/v1/rpc/life_set_outcome`, {
      method: 'POST',
      headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_item_id: i.id,
        p_planned_date: i.planned_start?.slice(0, 10),
        p_command: c,
        p_source: 'ui',
        p_carry_forward: c === 'not_complete' && !!i.carry_forward,
        p_next_date: null,
      }),
    });
    return r.json();
  }

  const r = applyLocalOutcome(storage(), i, c, () => crypto.randomUUID());
  const mid = crypto.randomUUID();
  const sid = r.successor ? crypto.randomUUID() : null;
  if (remote) {
    queue(r.current, mid, i.version ?? null);
    if (r.successor && sid) queue(r.successor, sid, null);
    try { await sync(); } catch {}
  }
  return {
    ...r,
    sync: {
      currentMutationId: remote ? mid : null,
      successorMutationId: remote ? sid : null,
    },
  };
}

export async function undoOutcome(previous: Item, successorId: string | null, meta: OutcomeSyncMeta) {
  const s = storage();
  const before = pendingMutations(s);
  const cp = before.find((item) => item.mutationId === meta.currentMutationId);
  const sp = before.find((item) => item.mutationId === meta.successorMutationId);
  const u = undoLocalOutcome(s, previous, successorId);
  if (remote) {
    queue(u.restored, crypto.randomUUID(), expectedVersionAfterPendingMutation(cp, u.currentVersion));
    if (u.removedSuccessor) {
      queue(
        u.removedSuccessor,
        crypto.randomUUID(),
        expectedVersionAfterPendingMutation(sp, u.removedSuccessor.version ?? null),
        true,
      );
    }
    try { await sync(); } catch {}
  }
}

export type PlanInput = {
  title: string;
  planned_start: string;
  planned_end: string;
  kind?: string;
  carry_forward?: boolean;
  deep_work?: boolean;
};

export async function applyPlan(k: string, items: PlanInput[]) {
  if (backendMode === 'legacy-supabase') {
    const r = await fetch(`${su}/rest/v1/rpc/life_apply_plan`, {
      method: 'POST',
      headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_idempotency_key: k, p_items: items, p_source: 'erika' }),
    });
    return r.json();
  }

  const r = applyLocalPlan(storage(), k, items, () => crypto.randomUUID());
  if (remote && r.applied) {
    for (const i of readLocalItemsByIds(storage(), r.ids)) queue(i, `${k}:${i.id}`, null);
    try { await sync(); } catch {}
  }
  return r;
}

export async function resolveSyncConflicts(r: RuntimeConflictResolution) {
  const n = resolveQueuedRuntimeConflicts(storage(), r);
  if (r === 'retry_local' && n) {
    try { await sync(); } catch {}
  }
  return n;
}

export async function range(from:string,to:string){if(remote){try{await sync()}catch{}}return readLocalRange(storage(),from,to)}
export async function allItems(){if(remote){try{await sync()}catch{}}return readAllLocalItems(storage())}
export async function saveItem(i:Item){if(backendMode==='legacy-supabase')throw Error('Обнови runtime');const old=readAllLocalItems(storage()).find(x=>x.id===i.id);const n=upsertLocalItem(storage(),i);if(remote){queue(n,crypto.randomUUID(),old?.version??null);try{await sync()}catch{}}return n}
export async function createItem(input:Partial<Item>&Pick<Item,'title'>){const now=new Date(),start=input.planned_start??null,end=input.planned_end??null;return saveItem({id:crypto.randomUUID(),title:input.title.trim(),kind:input.kind??'task',status:input.status??'planned',planned_start:start,planned_end:end,actual_start:null,actual_end:null,deep_work:input.deep_work===true,carry_forward:input.carry_forward===true,priority:input.priority??'normal',project_id:input.project_id??null,goal_id:input.goal_id??null,notes:input.notes??null})}
function queueDomain(kind:'project'|'goal',id:string,payload:Record<string,unknown>,version:number|null){queueMutation(storage(),{mutationId:crypto.randomUUID(),userId:'self',recordId:id,kind,expectedVersion:version,payload,deleted:false,clientUpdatedAt:new Date().toISOString()})}
export async function projects(){if(remote){try{await sync()}catch{}}return readLocalProjects(storage())}
export async function goals(){if(remote){try{await sync()}catch{}}return readLocalGoals(storage())}
export async function saveProject(p:import('./types').LifeProject){const old=readLocalProjects(storage()).find(x=>x.id===p.id);upsertLocalProject(storage(),p);if(remote){queueDomain('project',p.id,{title:p.title,status:p.status,goal_id:p.goal_id??null},old?.version??null);try{await sync()}catch{}}return p}
export async function saveGoal(g:import('./types').LifeGoal){const old=readLocalGoals(storage()).find(x=>x.id===g.id);upsertLocalGoal(storage(),g);if(remote){queueDomain('goal',g.id,{title:g.title,status:g.status},old?.version??null);try{await sync()}catch{}}return g}
