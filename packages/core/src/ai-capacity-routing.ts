/**
 * Evidence-gated provider-neutral routing for Life OS / Erika / Persona / DIVE M.
 * Selects candidates only. Does not invoke providers or approve side effects.
 */
export type CapabilityDomain =
  | "engineering" | "video" | "photo" | "social_content" | "research"
  | "speech" | "music" | "design" | "analytics" | "operations";
export type DataClassification = "public" | "internal" | "personal" | "restricted";
export type AutonomyTier = "AUTO" | "AUTO_REPORT" | "APPROVAL";
export type ProviderReadiness = "verified" | "unverified" | "unavailable";
export interface DomainEvidence {
  domain: CapabilityDomain;
  samples: number;
  quality: number;
  reliability: number;
  costPerTask: number | null;
  medianLatencySeconds: number | null;
}
export interface AICapabilityProvider {
  id: string;
  readiness: ProviderReadiness;
  allowedDataClassification: DataClassification;
  autonomousExecutionApproved: boolean;
  tools: string[];
  evidence: DomainEvidence[];
}
export interface AICapabilityTask {
  domain: CapabilityDomain;
  classification: DataClassification;
  autonomy: AutonomyTier;
  requiredTools: string[];
  minQuality: number;
  maxCostPerTask: number;
  minMeasuredSamples?: number;
}
export interface RankedProvider {
  id: string;
  score: number;
  quality: number;
  reliability: number;
  expectedCost: number;
  medianLatencySeconds: number | null;
}
export interface AICapabilityRoute {
  status: "ready" | "approval_required" | "no_verified_provider";
  primary: RankedProvider | null;
  fallbacks: RankedProvider[];
  excluded: Array<{ id: string; reason: string }>;
  mayExecuteWithoutApproval: boolean;
}
const DATA_LEVEL: Record<DataClassification, number> = {
  public: 0, internal: 1, personal: 2, restricted: 3,
};
const unitInterval = (n: number): boolean =>
  Number.isFinite(n) && n >= 0 && n <= 1;

export function routeAICapability(
  task: AICapabilityTask,
  providers: readonly AICapabilityProvider[],
): AICapabilityRoute {
  if (!unitInterval(task.minQuality)) throw new Error("Invalid minimum quality");
  if (!Number.isFinite(task.maxCostPerTask) || task.maxCostPerTask < 0)
    throw new Error("Invalid task budget");
  const minSamples = task.minMeasuredSamples ?? 1;
  if (!Number.isSafeInteger(minSamples) || minSamples < 1)
    throw new Error("Invalid minimum measured samples");

  const excluded: AICapabilityRoute["excluded"] = [];
  const ranked: RankedProvider[] = [];
  const seenIds = new Set<string>();
  for (const provider of providers) {
    if (!provider.id.trim() || seenIds.has(provider.id))
      throw new Error("Provider IDs must be unique and nonempty");
    seenIds.add(provider.id);

    let reason: string | null = null;
    const evidence = provider.evidence.find((e) => e.domain === task.domain);
    if (provider.readiness !== "verified") reason = "Connection not verified";
    else if (DATA_LEVEL[provider.allowedDataClassification] < DATA_LEVEL[task.classification])
      reason = "Data classification exceeds provider permission";
    else if (task.requiredTools.some((t) => !provider.tools.includes(t)))
      reason = "Required tool not verified";
    else if (!evidence || !Number.isSafeInteger(evidence.samples) ||
             evidence.samples < minSamples)
      reason = "No sufficient benchmark evidence";
    else if (!unitInterval(evidence.quality) || !unitInterval(evidence.reliability))
      reason = "Invalid benchmark evidence";
    else if (evidence.quality < task.minQuality)
      reason = "Below measured quality threshold";
    else if (evidence.costPerTask === null ||
             !Number.isFinite(evidence.costPerTask) || evidence.costPerTask < 0)
      reason = "Cost not reliably measured";
    else if (evidence.costPerTask > task.maxCostPerTask)
      reason = "Task budget exceeded";
    else if (evidence.medianLatencySeconds !== null &&
             (!Number.isFinite(evidence.medianLatencySeconds) || evidence.medianLatencySeconds < 0))
      reason = "Invalid latency measurement";
    else if (task.autonomy !== "APPROVAL" && !provider.autonomousExecutionApproved)
      reason = "Autonomous execution permission not verified";

    if (reason || !evidence || evidence.costPerTask === null) {
      excluded.push({ id: provider.id, reason: reason ?? "Incomplete evidence" });
      continue;
    }
    const costEfficiency = task.maxCostPerTask === 0
      ? 1 : 1 - evidence.costPerTask / task.maxCostPerTask;
    const latencyEfficiency = evidence.medianLatencySeconds === null
      ? 0 : 1 / (1 + evidence.medianLatencySeconds / 60);
    const score = .55 * evidence.quality + .3 * evidence.reliability +
                  .1 * costEfficiency + .05 * latencyEfficiency;
    ranked.push({
      id: provider.id, score: Math.round(score * 10000) / 10000,
      quality: evidence.quality, reliability: evidence.reliability,
      expectedCost: evidence.costPerTask,
      medianLatencySeconds: evidence.medianLatencySeconds,
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const primary = ranked[0] ?? null;
  return {
    status: !primary ? "no_verified_provider" :
      task.autonomy === "APPROVAL" ? "approval_required" : "ready",
    primary, fallbacks: ranked.slice(1), excluded,
    mayExecuteWithoutApproval: !!primary && task.autonomy !== "APPROVAL",
  };
}
