import type { CanonicalMediaPlanV2, CompositionModeV2, MediaPlanLineageV2 } from "./canonical-media-timeline-v2";
import { validateCanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import type { CanonicalContentItemV2, TargetPublicationType } from "./content-format-v2";

export type ExecutorKindV2 = "desktop" | "iphone" | "cloud" | "third_party";
export type ExecutorAvailabilityV2 = "available" | "busy" | "offline" | "failed";
export type ExecutorSemanticFeatureV2 =
  | "video_timeline"
  | "subtitles"
  | "audio_normalization"
  | "photo_timeline"
  | "still_image"
  | "slide_layout";

export interface ExecutorCapabilitiesV2 {
  executorId: string;
  executorKind: ExecutorKindV2;
  supportedPublicationTypes: TargetPublicationType[];
  inputDecodeCodecs: string[];
  outputEncodeCodecs: string[];
  maxAssetBytes: number;
  maxAggregateBytes: number;
  maxWidth: number;
  maxHeight: number;
  compositionModes: CompositionModeV2[];
  encodeGenerations: number;
  semanticFeatures: ExecutorSemanticFeatureV2[];
  availability: ExecutorAvailabilityV2;
  observedAt: string;
  heartbeatAt: string;
  expiresAt: string;
  expectedCompletionTimeMs: number;
  estimatedCostCents: number;
  costClass: "owned" | "free_tier" | "paid";
  qualityTier: number;
}

export type MediaBudgetPolicyV2 =
  | { mode: "FREE_ONLY" }
  | { mode: "BOUNDED_PAID"; maxCostCents: number };

export type RoutingRejectionReasonV2 =
  | "unavailable"
  | "stale_capability_snapshot"
  | "publication_type_unsupported"
  | "input_codec_unsupported"
  | "output_codec_unsupported"
  | "asset_too_large"
  | "aggregate_too_large"
  | "resolution_unsupported"
  | "composition_mode_unsupported"
  | "encode_generation_limit_exceeded"
  | "semantic_feature_unsupported"
  | "quality_tier_insufficient"
  | "deadline_missed"
  | "paid_executor_disallowed"
  | "paid_budget_exceeded";

export type MediaRoutingDecisionV2 =
  | {
    status: "selected_pending_claim";
    actionable: false;
    executorId: string;
    executorKind: ExecutorKindV2;
    budgetPolicy: MediaBudgetPolicyV2;
    rejectedCandidates: Array<{ executorId: string; reasons: RoutingRejectionReasonV2[] }>;
  }
  | {
    status: "no_eligible_executor";
    actionable: false;
    budgetPolicy: MediaBudgetPolicyV2;
    rejections: Array<{ executorId: string; reasons: RoutingRejectionReasonV2[] }>;
  };

export interface ExecutorResultV2 {
  executionId: string;
  attempt: number;
  executorId: string;
  lineage: MediaPlanLineageV2;
  resultHash: string;
  qaPolicyVersion: string;
}

export interface ApprovedMasterV2 {
  executionId: string;
  resultHash: string;
  contentRevisionHash: string;
  timelineHash: string;
  qaPolicyVersion: string;
  approvedAt: string;
}

function requiredFeatures(plan: CanonicalMediaPlanV2): ExecutorSemanticFeatureV2[] {
  return [...plan.requiredOperations] as ExecutorSemanticFeatureV2[];
}

function outputCodec(plan: CanonicalMediaPlanV2): string {
  return plan.outputProfile.codec;
}

function validateExecutorSnapshot(executor: ExecutorCapabilitiesV2): void {
  if (!executor.executorId.trim()) throw new Error("executorId is required");
  const finiteNonnegative = [executor.maxAssetBytes, executor.maxAggregateBytes, executor.maxWidth, executor.maxHeight, executor.encodeGenerations, executor.expectedCompletionTimeMs, executor.estimatedCostCents, executor.qualityTier];
  if (finiteNonnegative.some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid executor capability values for ${executor.executorId}`);
  const observedAt = Date.parse(executor.observedAt);
  const heartbeatAt = Date.parse(executor.heartbeatAt);
  const expiresAt = Date.parse(executor.expiresAt);
  if (![observedAt, heartbeatAt, expiresAt].every(Number.isFinite) || observedAt > heartbeatAt || heartbeatAt >= expiresAt) throw new Error(`Invalid executor capability timestamps for ${executor.executorId}`);
}

function rejectionReasons(
  item: CanonicalContentItemV2,
  plan: CanonicalMediaPlanV2,
  executor: ExecutorCapabilitiesV2,
  now: number,
  budgetPolicy: MediaBudgetPolicyV2,
  maximumHeartbeatAgeMs: number,
  minimumQualityTier: number,
): RoutingRejectionReasonV2[] {
  const reasons: RoutingRejectionReasonV2[] = [];
  if (executor.availability !== "available") reasons.push("unavailable");
  const observedAt = Date.parse(executor.observedAt);
  const expiresAt = Date.parse(executor.expiresAt);
  const heartbeatAt = Date.parse(executor.heartbeatAt);
  if (observedAt > now || heartbeatAt > now || expiresAt <= now || now - heartbeatAt > maximumHeartbeatAgeMs) {
    reasons.push("stale_capability_snapshot");
  }
  if (!executor.supportedPublicationTypes.includes(item.targetPublicationType)) reasons.push("publication_type_unsupported");
  const inputCodecs = item.sourceAssets.map((asset) => asset.videoCodec ?? "image");
  if (inputCodecs.some((codec) => !executor.inputDecodeCodecs.includes(codec))) reasons.push("input_codec_unsupported");
  if (!executor.outputEncodeCodecs.includes(outputCodec(plan))) reasons.push("output_codec_unsupported");
  if (item.sourceAssets.some((asset) => asset.bytes > executor.maxAssetBytes)) reasons.push("asset_too_large");
  if (item.sourceAssets.reduce((sum, asset) => sum + asset.bytes, 0) > executor.maxAggregateBytes) reasons.push("aggregate_too_large");
  if (item.sourceAssets.some((asset) => asset.width > executor.maxWidth || asset.height > executor.maxHeight)) reasons.push("resolution_unsupported");
  if (plan.canvas.width > executor.maxWidth || plan.canvas.height > executor.maxHeight) reasons.push("resolution_unsupported");
  const requiredCompositionModes = plan.kind === "video_timeline"
    ? [...new Set(plan.clips.map((clip) => clip.composition.mode))]
    : [];
  if (requiredCompositionModes.some((mode) => !executor.compositionModes.includes(mode))) {
    reasons.push("composition_mode_unsupported");
  }
  if (executor.encodeGenerations > plan.outputIntent.maxEncodeGenerations) reasons.push("encode_generation_limit_exceeded");
  if (requiredFeatures(plan).some((feature) => !executor.semanticFeatures.includes(feature))) reasons.push("semantic_feature_unsupported");
  if (executor.qualityTier < minimumQualityTier) reasons.push("quality_tier_insufficient");
  if (item.deadline) {
    const deadline = Date.parse(item.deadline);
    if (!Number.isFinite(deadline) || now + executor.expectedCompletionTimeMs > deadline) reasons.push("deadline_missed");
  }
  if (budgetPolicy.mode === "FREE_ONLY" && executor.estimatedCostCents > 0) reasons.push("paid_executor_disallowed");
  if (executor.costClass === "paid") {
    if (budgetPolicy.mode === "FREE_ONLY") reasons.push("paid_executor_disallowed");
    if (budgetPolicy.mode === "BOUNDED_PAID" && executor.estimatedCostCents > budgetPolicy.maxCostCents) {
      reasons.push("paid_budget_exceeded");
    }
  }
  return [...new Set(reasons)];
}

export function routeMediaExecutionV2(input: {
  contentItem: CanonicalContentItemV2;
  plan: CanonicalMediaPlanV2;
  executors: ExecutorCapabilitiesV2[];
  now: string;
  budgetPolicy?: MediaBudgetPolicyV2;
  maximumHeartbeatAgeMs?: number;
  minimumQualityTier?: number;
}): MediaRoutingDecisionV2 {
  validateCanonicalMediaPlanV2(input.contentItem, input.plan);
  if (!input.plan.preflight.actionable) throw new Error("Non-actionable media plan cannot be routed");
  const now = Date.parse(input.now);
  if (!Number.isFinite(now)) throw new Error("now must be a valid timestamp");
  const budgetPolicy = input.budgetPolicy ?? { mode: "FREE_ONLY" as const };
  if (budgetPolicy.mode === "BOUNDED_PAID" && (!Number.isFinite(budgetPolicy.maxCostCents) || budgetPolicy.maxCostCents < 0)) throw new Error("Invalid bounded paid budget");
  const maximumHeartbeatAgeMs = input.maximumHeartbeatAgeMs ?? 120_000;
  const minimumQualityTier = input.minimumQualityTier ?? 1;
  if (!Number.isFinite(maximumHeartbeatAgeMs) || maximumHeartbeatAgeMs <= 0 || !Number.isFinite(minimumQualityTier) || minimumQualityTier < 0) throw new Error("Invalid routing policy");
  input.executors.forEach(validateExecutorSnapshot);
  if (new Set(input.executors.map((executor) => executor.executorId)).size !== input.executors.length) throw new Error("Duplicate executorId values are not allowed");
  const evaluated = input.executors.map((executor) => ({
    executor,
    reasons: rejectionReasons(input.contentItem, input.plan, executor, now, budgetPolicy, maximumHeartbeatAgeMs, minimumQualityTier),
  }));
  const eligible = evaluated.filter((entry) => entry.reasons.length === 0);
  const costRank = { owned: 0, free_tier: 1, paid: 2 } as const;
  eligible.sort((left, right) =>
    costRank[left.executor.costClass] - costRank[right.executor.costClass]
    || right.executor.qualityTier - left.executor.qualityTier
    || left.executor.expectedCompletionTimeMs - right.executor.expectedCompletionTimeMs
    || left.executor.executorId.localeCompare(right.executor.executorId));

  const selected = eligible[0]?.executor;
  if (!selected) {
    return {
      status: "no_eligible_executor",
      actionable: false,
      budgetPolicy,
      rejections: evaluated.map(({ executor, reasons }) => ({ executorId: executor.executorId, reasons })),
    };
  }
  return {
    status: "selected_pending_claim",
    actionable: false,
    executorId: selected.executorId,
    executorKind: selected.executorKind,
    budgetPolicy,
    rejectedCandidates: evaluated
      .filter((entry) => entry.reasons.length > 0)
      .map(({ executor, reasons }) => ({ executorId: executor.executorId, reasons })),
  };
}

export function createDesktopV1CapabilitySnapshot(input: { observedAt: string; expiresAt: string }): ExecutorCapabilitiesV2 {
  return {
    executorId: "desktop-v1",
    executorKind: "desktop",
    supportedPublicationTypes: ["reel"],
    inputDecodeCodecs: ["h264"],
    outputEncodeCodecs: ["h264"],
    maxAssetBytes: 2_000_000_000,
    maxAggregateBytes: 2_000_000_000,
    maxWidth: 4096,
    maxHeight: 4096,
    compositionModes: ["crop"],
    encodeGenerations: 3,
    semanticFeatures: ["video_timeline", "subtitles", "audio_normalization"],
    availability: "available",
    observedAt: input.observedAt,
    heartbeatAt: input.observedAt,
    expiresAt: input.expiresAt,
    expectedCompletionTimeMs: 15 * 60_000,
    estimatedCostCents: 0,
    costClass: "owned",
    qualityTier: 1,
  };
}

export function createExecutionIdentityV2(plan: CanonicalMediaPlanV2): string {
  return createExecutionIdentityFromLineageV2(plan.lineage, plan.outputProfile);
}

export function createExecutionIdentityFromLineageV2(
  lineage: MediaPlanLineageV2,
  outputProfile: CanonicalMediaPlanV2["outputProfile"],
): string {
  const profile = `${outputProfile.codec}@${outputProfile.platformSafeAreaProfile}`;
  return [
    "media-v2",
    lineage.contentItemId,
    lineage.contentRevision,
    lineage.contentRevisionHash,
    lineage.timelineVersion,
    lineage.timelineHash,
    profile,
  ].map(encodeURIComponent).join(":");
}

function lineageMatches(expected: MediaPlanLineageV2, actual: MediaPlanLineageV2): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

export function validateExecutorResultV2(
  plan: CanonicalMediaPlanV2,
  ownership: { executionId: string; attempt: number; executorId: string },
  result: ExecutorResultV2,
): void {
  if (result.executionId !== ownership.executionId || result.attempt !== ownership.attempt || result.executorId !== ownership.executorId) throw new Error("Execution ownership mismatch");
  if (!lineageMatches(plan.lineage, result.lineage)) throw new Error("Executor result lineage mismatch");
  if (result.qaPolicyVersion !== plan.lineage.qaPolicyVersion) throw new Error("QA policy drift detected");
  if (!/^[a-f0-9]{64}$/i.test(result.resultHash)) throw new Error("Result hash is invalid");
}

export function validateApprovedMasterV2(approval: ApprovedMasterV2, result: ExecutorResultV2): void {
  if (approval.executionId !== result.executionId) throw new Error("Approval execution mismatch");
  if (approval.resultHash !== result.resultHash) throw new Error("Approval master hash mismatch");
  if (approval.contentRevisionHash !== result.lineage.contentRevisionHash
    || approval.timelineHash !== result.lineage.timelineHash
    || approval.qaPolicyVersion !== result.qaPolicyVersion) {
    throw new Error("Approval lineage mismatch");
  }
}
