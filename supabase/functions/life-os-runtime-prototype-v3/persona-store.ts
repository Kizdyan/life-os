import type { AiBudgetPolicy, BudgetStoreResult } from "./persona-cost.ts";
import type { SealedApproval } from "./persona-brain.ts";
import type { CreativeItem } from "./persona-creative-core.ts";

// Only the authenticated prototype Edge Function calls this service-role adapter.
// No browser is given a service-role key or permitted to read these tables.
const DEFAULT_SUPABASE_URL = "https://zhehdbhpkcucgcjwuhxm.supabase.co";
const BRAIN_KEY = "persona-v3:owner:brain:v1";
const FRESH_WINDOW_MS = 5 * 60_000;
const EVIDENCE_TTL_MS = 7 * 86_400_000;

export type ArtifactFreshness = "fresh" | "cached" | "stale" | "unverified";
export type CachedArtifact<T> = {
  value: T;
  savedAt: string;
  evidenceCheckedAt: string;
  freshness: ArtifactFreshness;
};

export function artifactFreshness(savedAt: string, evidenceCheckedAt: string, now = Date.now()): ArtifactFreshness {
  const saved = Date.parse(savedAt), evidence = Date.parse(evidenceCheckedAt);
  if (!Number.isFinite(saved) || !Number.isFinite(evidence) || saved > now + 60_000 || evidence > now + 86_400_000) {
    return "unverified";
  }
  if (evidence < now - EVIDENCE_TTL_MS) return "stale";
  return saved >= now - FRESH_WINDOW_MS && evidence >= now - FRESH_WINDOW_MS ? "fresh" : "cached";
}

export function normalizeArtifacts<T>(items: unknown, now = Date.now()): CachedArtifact<T>[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).map((raw) => {
    if (raw && typeof raw === "object" && "value" in raw) {
      const item = raw as { value: T; savedAt?: unknown; evidenceCheckedAt?: unknown };
      const savedAt = typeof item.savedAt === "string" ? item.savedAt : "";
      const evidenceCheckedAt = typeof item.evidenceCheckedAt === "string" ? item.evidenceCheckedAt : "";
      return { value: item.value, savedAt, evidenceCheckedAt,
        freshness: artifactFreshness(savedAt, evidenceCheckedAt, now) };
    }
    return { value: raw as T, savedAt: "", evidenceCheckedAt: "", freshness: "unverified" };
  });
}

function cachedArtifact<T>(value: T, savedAt: string, evidenceCheckedAt: string): CachedArtifact<T> {
  return { value, savedAt, evidenceCheckedAt,
    freshness: artifactFreshness(savedAt, evidenceCheckedAt) };
}

export type BrainSnapshot = {
  schema: 1;
  entries: SealedApproval[];
  trends: CachedArtifact<string>[];
  marketEvidence: CachedArtifact<unknown>[];
  criticJudge: CachedArtifact<unknown>[];
  shootingBriefs: Array<{ ideaId: string; brief: Record<string, unknown>; savedAt: string }>;
  creativeItems: CreativeItem[];
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
    criticJudge: [], shootingBriefs: [], creativeItems: [], updatedAt: new Date(0).toISOString() };
}

export function parseBrainSnapshot(value: unknown, rowUpdatedAt?: string): BrainSnapshot {
  if (value === null || value === undefined) return emptySnapshot();
  if (!value || typeof value !== "object" || (value as { schema?: unknown }).schema !== 1) {
    throw new Error("prototype_cache_schema_unsupported");
  }
  const snapshot = value as Partial<BrainSnapshot>;
  if (!Array.isArray(snapshot.entries)) throw new Error("prototype_cache_schema_unsupported");
  return {
    ...emptySnapshot(), ...snapshot, schema: 1,
    updatedAt: rowUpdatedAt ?? (typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : ""),
    entries: snapshot.entries.slice(0, 30),
    trends: normalizeArtifacts<string>(snapshot.trends).slice(0, 30),
    marketEvidence: normalizeArtifacts(snapshot.marketEvidence).slice(0, 40),
    criticJudge: normalizeArtifacts(snapshot.criticJudge).slice(0, 30),
    shootingBriefs: Array.isArray(snapshot.shootingBriefs) ? snapshot.shootingBriefs.slice(0, 30) : [],
    creativeItems: Array.isArray(snapshot.creativeItems) ? snapshot.creativeItems.slice(0, 3) : [],
  };
}

export async function readServerBrain(): Promise<BrainSnapshot> {
  const { origin, headers } = credentials();
  const url = origin + "/rest/v1/persona_v3_brain?cache_key=eq." +
    encodeURIComponent(BRAIN_KEY) + "&select=payload,updated_at";
  const response = await fetch(url, {
    headers, signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error("prototype_cache_read:" + response.status);
  const rows = await response.json() as Array<{ payload: unknown; updated_at?: string }>;
  if (!rows.length) return emptySnapshot();
  return parseBrainSnapshot(rows[0].payload, rows[0].updated_at);
}

export async function saveServerBrain(snapshot: BrainSnapshot): Promise<boolean> {
  const { origin, headers } = credentials();
  const creating = snapshot.updatedAt === new Date(0).toISOString();
  const nextUpdatedAt = new Date().toISOString();
  const payload = { ...snapshot, schema: 1 as const, updatedAt: nextUpdatedAt };
  const filter = creating ? "?on_conflict=cache_key" : "?cache_key=eq." + encodeURIComponent(BRAIN_KEY) +
    "&updated_at=eq." + encodeURIComponent(snapshot.updatedAt);
  const response = await fetch(origin + "/rest/v1/persona_v3_brain" + filter, {
    method: creating ? "POST" : "PATCH",
    headers: { ...headers, Prefer: creating
      ? "resolution=ignore-duplicates,return=representation" : "return=representation" },
    signal: AbortSignal.timeout(4_000),
    body: JSON.stringify({ cache_key: BRAIN_KEY, updated_at: nextUpdatedAt, payload }),
  });
  if (!response.ok) throw new Error("prototype_cache_write:" + response.status);
  const rows = await response.json() as Array<{ payload?: unknown; updated_at?: string }>;
  if (rows.length !== 1) throw new Error("prototype_cache_conflict");
  Object.assign(snapshot, parseBrainSnapshot(rows[0].payload ?? payload, rows[0].updated_at ?? nextUpdatedAt));
  return true;
}

export async function mutateServerBrain(
  mutate: (snapshot: BrainSnapshot) => BrainSnapshot,
  read: () => Promise<BrainSnapshot> = readServerBrain,
  save: (snapshot: BrainSnapshot) => Promise<unknown> = saveServerBrain,
): Promise<BrainSnapshot> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = mutate(await read());
    try { await save(snapshot); return snapshot; }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "prototype_cache_conflict" || attempt === 2) throw error;
    }
  }
  throw new Error("prototype_cache_conflict");
}

export async function persistApprovedEntry(entry: SealedApproval, criticJudge: unknown = null): Promise<void> {
  // CAS retry preserves concurrent approvals and shooting briefs.
  await mutateServerBrain((snapshot) => {
    snapshot.entries = [entry, ...snapshot.entries.filter(x => x.idea.id !== entry.idea.id)].slice(0, 30);
    snapshot.marketEvidence = snapshot.entries.flatMap(x =>
      Array.isArray(x.idea.marketEvidence) ? x.idea.marketEvidence.map(value =>
        cachedArtifact(value, x.approvedAt, x.evidenceCheckedAt)) : []).slice(0, 40);
    snapshot.trends = snapshot.entries.flatMap(x =>
      Array.isArray(x.idea.whyNow) ? x.idea.whyNow.filter((y): y is string => typeof y === "string")
        .map(value => cachedArtifact(value, x.approvedAt, x.evidenceCheckedAt)) : []).slice(0, 30);
    snapshot.criticJudge = [cachedArtifact(criticJudge ?? entry.idea.qualityVerdict,
      entry.approvedAt, entry.evidenceCheckedAt), ...snapshot.criticJudge].slice(0, 30);
    return snapshot;
  });
}

export async function persistShootingBrief(ideaId: string, brief: Record<string, unknown>): Promise<void> {
  await mutateServerBrain((snapshot) => {
    snapshot.shootingBriefs = [
      { ideaId, brief, savedAt: new Date().toISOString() },
      ...snapshot.shootingBriefs.filter(x => x.ideaId !== ideaId),
    ].slice(0, 30);
    return snapshot;
  });
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
