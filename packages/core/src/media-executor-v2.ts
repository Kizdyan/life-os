import type { CanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import type { CanonicalContentItemV2 } from "./content-format-v2";
import type { QualityResultV2, RenderedAssetV2 } from "./media-execution-job-v2";
import type { ExecutorCapabilitiesV2, RoutingRejectionReasonV2 } from "./media-execution-router-v2";
import { routeMediaExecutionV2 } from "./media-execution-router-v2";

export interface ExecutorWorkRequestV2 {
  jobId: string; executionId: string; attemptNumber: number; leaseId: string;
  contentItem: CanonicalContentItemV2; plan: CanonicalMediaPlanV2;
}
export interface ExecutorExecutionResultV2 { executorId: string; attemptNumber: number; leaseId: string; asset: RenderedAssetV2 }
export interface MediaExecutorV2 {
  capabilities: ExecutorCapabilitiesV2;
  canExecute(request: ExecutorWorkRequestV2, now: string): { eligible: boolean; reasons: RoutingRejectionReasonV2[] };
  estimate(request: ExecutorWorkRequestV2): { durationMs: number; costCents: number };
  claim(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  execute(request: ExecutorWorkRequestV2): Promise<ExecutorExecutionResultV2>;
  heartbeat(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  cancel(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  release(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  fail(request: ExecutorWorkRequestV2, reason: string): Promise<{ accepted: boolean }>;
  validate(request: ExecutorWorkRequestV2, result: ExecutorExecutionResultV2, checkedAt: string): QualityResultV2;
}
export interface ExecutorTransportV2 {
  claim(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  execute(request: ExecutorWorkRequestV2): Promise<ExecutorExecutionResultV2>;
  heartbeat(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  cancel(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  release(request: ExecutorWorkRequestV2): Promise<{ accepted: boolean }>;
  fail(request: ExecutorWorkRequestV2, reason: string): Promise<{ accepted: boolean }>;
}

function eligibility(capabilities: ExecutorCapabilitiesV2, request: ExecutorWorkRequestV2, now: string) {
  const decision = routeMediaExecutionV2({ contentItem: request.contentItem, plan: request.plan, executors: [capabilities], now });
  if (decision.status === "selected_pending_claim") return { eligible: true, reasons: [] as RoutingRejectionReasonV2[] };
  return { eligible: false, reasons: decision.rejections[0]?.reasons ?? [] };
}

function objectiveValidation(request: ExecutorWorkRequestV2, result: ExecutorExecutionResultV2, checkedAt: string): QualityResultV2 {
  const reasons: string[] = [];
  if (result.executorId.trim() === "" || result.attemptNumber !== request.attemptNumber || result.leaseId !== request.leaseId) reasons.push("execution_ownership_mismatch");
  if (JSON.stringify(result.asset.lineage) !== JSON.stringify(request.plan.lineage)) reasons.push("lineage_mismatch");
  if (!/^[a-f0-9]{64}$/i.test(result.asset.resultHash)) reasons.push("invalid_result_hash");
  if (!result.asset.fullDecodePassed) reasons.push("full_decode_failed");
  if (result.asset.codec !== request.plan.outputProfile.codec) reasons.push("output_codec_mismatch");
  if (result.asset.width !== request.plan.canvas.width || result.asset.height !== request.plan.canvas.height) reasons.push("output_dimensions_mismatch");
  if (![result.asset.bytes, result.asset.durationMs].every((value) => Number.isSafeInteger(value) && value > 0)) reasons.push("invalid_output_measurements");
  if (!Number.isFinite(Date.parse(checkedAt))) reasons.push("invalid_validation_timestamp");
  return { status: reasons.length === 0 ? "QUALITY_PASS" : "OUTPUT_INVALID", reasons, checkedAt };
}

function adapter(capabilities: ExecutorCapabilitiesV2, transport: ExecutorTransportV2): MediaExecutorV2 {
  return {
    capabilities,
    canExecute: (request, now) => eligibility(capabilities, request, now),
    estimate: () => ({ durationMs: capabilities.expectedCompletionTimeMs, costCents: capabilities.estimatedCostCents }),
    claim: (request) => transport.claim(request),
    execute: (request) => transport.execute(request),
    heartbeat: (request) => transport.heartbeat(request),
    cancel: (request) => transport.cancel(request),
    release: (request) => transport.release(request),
    fail: (request, reason) => transport.fail(request, reason),
    validate: objectiveValidation,
  };
}

export function createDesktopV1ExecutorAdapterV2(input: { capabilities: ExecutorCapabilitiesV2; transport: ExecutorTransportV2 }): MediaExecutorV2 {
  if (input.capabilities.executorKind !== "desktop" || input.capabilities.executorId !== "desktop-v1") throw new Error("Desktop V1 adapter requires the frozen desktop-v1 capability");
  return adapter(input.capabilities, input.transport);
}

export function createDeterministicAlternateExecutorV2(input: {
  capabilities: ExecutorCapabilitiesV2;
  resultHash: string;
  corruption?: "decode" | "codec" | "lineage";
}): MediaExecutorV2 {
  const claimed = new Set<string>();
  const transport: ExecutorTransportV2 = {
    claim: async (request) => { claimed.add(request.leaseId); return { accepted: true }; },
    heartbeat: async (request) => ({ accepted: claimed.has(request.leaseId) }),
    execute: async (request) => {
      if (!claimed.has(request.leaseId)) throw new Error("alternate_executor_lease_not_claimed");
      const lineage = input.corruption === "lineage"
        ? { ...request.plan.lineage, timelineHash: "0".repeat(64) }
        : request.plan.lineage;
      return {
        executorId: input.capabilities.executorId,
        attemptNumber: request.attemptNumber,
        leaseId: request.leaseId,
        asset: {
          renderedAssetId: `${request.executionId}:attempt:${request.attemptNumber}`,
          resultHash: input.resultHash,
          bytes: 1_000_000,
          codec: input.corruption === "codec" ? "vp9" : request.plan.outputProfile.codec,
          width: request.plan.canvas.width,
          height: request.plan.canvas.height,
          durationMs: request.plan.kind === "video_timeline" ? request.plan.targetDurationMs : 1_000,
          fullDecodePassed: input.corruption !== "decode",
          lineage,
        },
      };
    },
    cancel: async () => ({ accepted: true }),
    release: async () => ({ accepted: true }),
    fail: async () => ({ accepted: true }),
  };
  return adapter(input.capabilities, transport);
}
