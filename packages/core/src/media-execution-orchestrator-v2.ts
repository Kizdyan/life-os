import type { CanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import type { CanonicalContentItemV2 } from "./content-format-v2";
import type { MediaExecutionJobV2 } from "./media-execution-job-v2";
import {
  claimMediaExecutionJobV2,
  failExecutionAttemptV2,
  promoteValidatedMasterV2,
  recoverMediaExecutionJobV2,
  retryMediaExecutionJobV2,
  startExecutionAttemptV2,
  submitRenderedAssetV2,
} from "./media-execution-job-v2";
import type { MediaExecutorV2 } from "./media-executor-v2";
import { routeMediaExecutionV2, type MediaBudgetPolicyV2 } from "./media-execution-router-v2";

export type MediaOrchestrationResultV2 = {
  status: "READY" | "NO_EXECUTOR" | "ATTEMPTS_EXHAUSTED" | "WAITING_FOR_LEASE";
  job: MediaExecutionJobV2;
};

export async function orchestrateMediaExecutionV2(input: {
  job: MediaExecutionJobV2;
  contentItem: CanonicalContentItemV2;
  plan: CanonicalMediaPlanV2;
  executors: MediaExecutorV2[];
  now: () => string;
  leaseDurationMs: number;
  leaseId: (attemptNumber: number, executorId: string) => string;
  paidBudgetCents?: number;
}): Promise<MediaOrchestrationResultV2> {
  if (JSON.stringify(input.job.lineage) !== JSON.stringify(input.plan.lineage)) throw new Error("Job and timeline lineage mismatch");
  if (input.contentItem.contentItemId !== input.job.lineage.contentItemId
    || input.contentItem.revisionHash !== input.job.lineage.contentRevisionHash) throw new Error("Job and content lineage mismatch");
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) throw new Error("leaseDurationMs must be a positive integer");

  let job = recoverMediaExecutionJobV2(input.job, input.now());
  if (job.state === "READY") return { status: "READY", job };
  if (["CLAIMED", "PROCESSING", "VALIDATING"].includes(job.state)) return { status: "WAITING_FOR_LEASE", job };
  if (job.state === "RETRYABLE_FAILED") job = retryMediaExecutionJobV2(job, input.now());

  while (job.state === "QUEUED") {
    const routingNow = input.now();
    const afterEscalation = Date.parse(routingNow) >= Date.parse(job.deadline.escalationAt);
    const budgetPolicy: MediaBudgetPolicyV2 = afterEscalation && job.fallbackPolicy.allowPaidFallback && input.paidBudgetCents !== undefined
      ? { mode: "BOUNDED_PAID", maxCostCents: input.paidBudgetCents }
      : { mode: "FREE_ONLY" };
    const attemptedExecutors = new Set(job.attempts.map((attempt) => attempt.executorId));
    const candidates = input.executors.filter((executor) => !attemptedExecutors.has(executor.capabilities.executorId));
    const routing = routeMediaExecutionV2({
      contentItem: input.contentItem,
      plan: input.plan,
      executors: candidates.map((executor) => executor.capabilities),
      now: routingNow,
      budgetPolicy,
    });
    if (routing.status === "no_eligible_executor") return { status: "NO_EXECUTOR", job };
    const executor = candidates.find((candidate) => candidate.capabilities.executorId === routing.executorId);
    if (!executor) throw new Error("Selected executor adapter is unavailable");
    const attemptNumber = job.attempts.length + 1;
    const leaseId = input.leaseId(attemptNumber, executor.capabilities.executorId);
    job = claimMediaExecutionJobV2(job, {
      executorId: executor.capabilities.executorId,
      executorKind: executor.capabilities.executorKind,
      leaseId,
      now: input.now(),
      leaseDurationMs: input.leaseDurationMs,
    });
    const request = { jobId: job.jobId, executionId: job.executionId, attemptNumber, leaseId, contentItem: input.contentItem, plan: input.plan };
    try {
      const claimed = await executor.claim(request);
      if (!claimed.accepted) {
        job = failExecutionAttemptV2(job, { attemptNumber, leaseId, now: input.now(), failureCode: "claim_rejected" });
        await executor.fail(request, "claim_rejected");
      } else {
        job = startExecutionAttemptV2(job, { attemptNumber, leaseId, now: input.now() });
        const result = await executor.execute(request);
        job = submitRenderedAssetV2(job, { attemptNumber, leaseId, now: input.now(), asset: result.asset });
        const checkedAt = input.now();
        const quality = executor.validate(request, result, checkedAt);
        if (quality.status !== "QUALITY_PASS") {
          job = failExecutionAttemptV2(job, { attemptNumber, leaseId, now: input.now(), failureCode: "output_invalid" });
          await executor.fail(request, "output_invalid");
        } else {
          job = promoteValidatedMasterV2(job, { attemptNumber, leaseId, now: input.now(), quality });
          await executor.release(request);
          return { status: "READY", job };
        }
      }
    } catch (error) {
      if (["CLAIMED", "PROCESSING", "VALIDATING"].includes(job.state)) {
        job = failExecutionAttemptV2(job, { attemptNumber, leaseId, now: input.now(), failureCode: "executor_error" });
      }
      await executor.fail(request, error instanceof Error ? error.message : "executor_error").catch(() => ({ accepted: false }));
    }
    if (job.state === "FAILED") return { status: "ATTEMPTS_EXHAUSTED", job };
    job = retryMediaExecutionJobV2(job, input.now());
  }
  return { status: job.state === "FAILED" ? "ATTEMPTS_EXHAUSTED" : "NO_EXECUTOR", job };
}
