import type { AiBudgetPolicy, BudgetStoreResult } from "./persona-cost.ts";
import type { SealedApproval } from "./persona-brain.ts";

// Only the authenticated prototype Edge Function calls this service-role adapter.
// No browser is given a service-role key or permitted to read these tables.
const DEFAULT_SUPABASE_URL = "https://zhehdbhpkcucgcjwuhxm.supabase.co";
const BRAIN_KEY = "persona-v3:owner:brain:v1";

export type BrainSnapshot = {
  schema: 1;
  entries: SealedApproval[];
  trends: string[];
  marketEvidence: unknown[];
  criticJudge: unknown[];
  shootingBriefs: Array<{ ideaId: string; brief: Record<string, unknown>; savedAt: string }>;
  updatedAt: string;
};

function credentials() {
  const origin = (Deno.env.get("SUPABASE_URL") ?? DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!key) throw new Error("prototype_cache_service_role_missing");
  return { origin, headers: {
    apikey: key, Authorization: "Bearer " + key,
    "Content-Type": "application/json", "Cache-Control": "no-store",
  } };
}
function emptySnapshot(): BrainSnapshot {
  return { schema: 1, entries: [], trends: [], marketEvidence: [],
    criticJudge: [], shootingBriefs: [], updatedAt: new Date(0).toISOString() };
}

export async function readServerBrain(): Promise<BrainSnapshot> {
  const { origin, headers } = credentials();
  const url = origin + "/rest/v1/persona_v3_brain?cache_key=eq." +
    encodeURIComponent(BRAIN_KEY) + "&select=payload";
  const response = await fetch(url, {
    headers, signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error("prototype_cache_read:" + response.status);
  const rows = await response.json() as Array<{ payload: BrainSnapshot }>;
  const value = rows[0]?.payload;
  if (!value || value.schema !== 1 || !Array.isArray(value.entries)) return emptySnapshot();
  return {
    ...emptySnapshot(), ...value,
    entries: value.entries.slice(0, 30),
    trends: Array.isArray(value.trends) ? value.trends.slice(0, 30) : [],
    shootingBriefs: Array.isArray(value.shootingBriefs) ? value.shootingBriefs.slice(0, 30) : [],
  };
}

export async function saveServerBrain(snapshot: BrainSnapshot): Promise<boolean> {
  const { origin, headers } = credentials();
  const response = await fetch(origin + "/rest/v1/persona_v3_brain?on_conflict=cache_key", {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    signal: AbortSignal.timeout(4_000),
    body: JSON.stringify({
      cache_key: BRAIN_KEY,
      updated_at: new Date().toISOString(),
      payload: { ...snapshot, schema: 1, updatedAt: new Date().toISOString() },
    }),
  });
  if (!response.ok) throw new Error("prototype_cache_write:" + response.status);
  return true;
}

export async function persistApprovedEntry(entry: SealedApproval, criticJudge: unknown = null): Promise<void> {
  let snapshot: BrainSnapshot;
  try { snapshot = await readServerBrain(); } catch { snapshot = emptySnapshot(); }
  snapshot.entries = [entry, ...snapshot.entries.filter(x => x.idea.id !== entry.idea.id)].slice(0, 30);
  snapshot.marketEvidence = snapshot.entries.flatMap(x =>
    Array.isArray(x.idea.marketEvidence) ? x.idea.marketEvidence : []).slice(0, 40);
  snapshot.trends = snapshot.entries.flatMap(x =>
    Array.isArray(x.idea.whyNow) ? x.idea.whyNow.filter((y): y is string => typeof y === "string") : []).slice(0, 30);
  snapshot.criticJudge = [criticJudge ?? entry.idea.qualityVerdict, ...snapshot.criticJudge].slice(0, 30);
  await saveServerBrain(snapshot);
}

export async function persistShootingBrief(ideaId: string, brief: Record<string, unknown>): Promise<void> {
  const snapshot = await readServerBrain();
  snapshot.shootingBriefs = [
    { ideaId, brief, savedAt: new Date().toISOString() },
    ...snapshot.shootingBriefs.filter(x => x.ideaId !== ideaId),
  ].slice(0, 30);
  await saveServerBrain(snapshot);
}

export async function reserveServerAiCall(
  input: { day: string; month: string; policy: AiBudgetPolicy },
): Promise<BudgetStoreResult> {
  const { origin, headers } = credentials();
  const p = input.policy;
  const response = await fetch(origin + "/rest/v1/rpc/persona_v3_budget_reserve", {
    method: "POST", headers, signal: AbortSignal.timeout(4_000),
    body: JSON.stringify({
      p_day: input.day,
      p_month: input.month,
      p_daily_calls: p.callsPerDay,
      p_daily_usd: p.dailyUsd,
      p_monthly_usd: p.monthlyUsd,
      p_reserve_usd: p.reserveUsd,
      p_est_input_tokens: p.estInputTokens,
      p_est_output_tokens: p.estOutputTokens,
    }),
  });
  if (!response.ok) throw new Error("prototype_budget_reserve:" + response.status);
  return await response.json() as BudgetStoreResult;
}

export async function readServerBudget(): Promise<Record<string, unknown>> {
  const { origin, headers } = credentials();
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const url = origin + "/rest/v1/persona_v3_budget_usage?period_key=in.(" +
    encodeURIComponent("day:" + day) + "," + encodeURIComponent("month:" + month) +
    ")&select=period_key,ai_calls,reserved_usd,estimated_input_tokens,estimated_output_tokens";
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error("prototype_budget_read:" + response.status);
  const usage = await response.json() as unknown[];
  return { mode: "ECONOMY", source: "atomic_database_ledger", usage };
}
