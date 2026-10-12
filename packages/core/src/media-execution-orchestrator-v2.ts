import type { CanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import { canonicalJsonV2 } from "./canonical-hash-v2";
import type { CanonicalContentItemV2 } from "./content-format-v2";
import {
  claimMediaExecutionJobV2, failExecutionAttemptV2, heartbeatExecutionAttemptV2,
  promoteValidatedMasterV2, recoverMediaExecutionJobV2, retryMediaExecutionJobV2,
  startExecutionAttemptV2, submitRenderedAssetV2, type MediaExecutionJobV2,
} from "./media-execution-job-v2";
import type { MediaExecutionQueueV2 } from "./media-execution-queue-v2";
import type { ExecutorWorkRequestV2, MediaExecutorV2 } from "./media-executor-v2";
import { createExecutionIdentityV2, routeMediaExecutionV2, type MediaBudgetPolicyV2 } from "./media-execution-router-v2";

export type MediaOrchestrationResultV2 = {
  status: "READY" | "NO_EXECUTOR" | "ATTEMPTS_EXHAUSTED" | "WAITING_FOR_LEASE" | "DEADLINE_BLOCKED";
  job: MediaExecutionJobV2;
};

async function swap(queue: MediaExecutionQueueV2, current: MediaExecutionJobV2, next: MediaExecutionJobV2): Promise<MediaExecutionJobV2 | null> {
  return await queue.compareAndSwap(current.jobId, current.version, next) ? next : null;
}

export async function orchestrateMediaExecutionV2(input: {
  job: MediaExecutionJobV2;
  queue: MediaExecutionQueueV2;
  contentItem: CanonicalContentItemV2;
  plan: CanonicalMediaPlanV2;
  executors: MediaExecutorV2[];
  now: () => string;
  leaseDurationMs: number;
  leaseId: (attemptNumber: number, executorId: string) => string;
}): Promise<MediaOrchestrationResultV2> {
  if (canonicalJsonV2(input.job.lineage) !== canonicalJsonV2(input.plan.lineage)) throw new Error("Job and timeline lineage mismatch");
  if (input.job.executionId !== createExecutionIdentityV2(input.plan)) throw new Error("Job execution identity does not match canonical timeline");
  if (input.contentItem.contentItemId !== input.job.lineage.contentItemId || input.contentItem.revisionHash !== input.job.lineage.contentRevisionHash) throw new Error("Job and content lineage mismatch");
  if (input.contentItem.deadline !== input.job.deadline.readyRequiredAt) throw new Error("Content and execution ready deadline mismatch");
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) throw new Error("leaseDurationMs must be a positive integer");

  await input.queue.enqueue(input.job);
  const initial = await input.queue.read(input.job.jobId);
  if (!initial) throw new Error("Durable media job is unavailable");
  let job: MediaExecutionJobV2 = initial;
  const recovered = recoverMediaExecutionJobV2(job, input.now());
  if (recovered.version !== job.version) {
    const persisted = await swap(input.queue, job, recovered);
    if (!persisted) return { status: "WAITING_FOR_LEASE", job: (await input.queue.read(job.jobId))! };
    job = persisted;
  }
  if (job.state === "READY") return { status: "READY", job };
  if (["CLAIMED", "PROCESSING", "VALIDATING"].includes(job.state)) return { status: "WAITING_FOR_LEASE", job };
  if (job.state === "RETRYABLE_FAILED") {
    const persisted = await swap(input.queue, job, retryMediaExecutionJobV2(job, input.now()));
    if (!persisted) return { status: "WAITING_FOR_LEASE", job: (await input.queue.read(job.jobId))! };
    job = persisted;
  }

  while (job.state === "QUEUED") {
    const routingNow = input.now();
    if (Date.parse(routingNow) >= Date.parse(job.deadline.readyRequiredAt)) return { status: "DEADLINE_BLOCKED", job };
    const afterEscalation = Date.parse(routingNow) >= Date.parse(job.deadline.escalationAt);
    const remaining = job.budget.policy.mode === "BOUNDED_PAID" ? job.budget.policy.maxCostCents - job.budget.spentCostCents - job.budget.reservedCostCents : 0;
    const budgetPolicy: MediaBudgetPolicyV2 = afterEscalation && job.fallbackPolicy.allowPaidFallback && job.budget.policy.mode === "BOUNDED_PAID"
      ? { mode: "BOUNDED_PAID", maxCostCents: remaining } : { mode: "FREE_ONLY" };
    const candidates = input.executors.filter((executor) => {
      const attempts = job.attempts.filter((attempt) => attempt.executorId === executor.capabilities.executorId);
      if (attempts.some((attempt) => attempt.failureCode === "claim_rejected" || attempt.failureCode === "output_invalid")) return false;
      return attempts.length < 2;
    });
    const routing = routeMediaExecutionV2({ contentItem: input.contentItem, plan: input.plan, executors: candidates.map((executor) => executor.capabilities), now: routingNow, budgetPolicy });
    if (routing.status === "no_eligible_executor") return { status: "NO_EXECUTOR", job };
    const executor = candidates.find((candidate) => candidate.capabilities.executorId === routing.executorId);
    if (!executor) throw new Error("Selected executor adapter is unavailable");
    const attemptNumber = job.attempts.length + 1;
    const leaseId = input.leaseId(attemptNumber, executor.capabilities.executorId);
    const request: ExecutorWorkRequestV2 = { jobId: job.jobId, executionId: job.executionId, attemptNumber, leaseId, contentItem: input.contentItem, plan: input.plan };
    const claimNow = input.now();
    const claimEligibility = routeMediaExecutionV2({ contentItem: input.contentItem, plan: input.plan, executors: [executor.capabilities], now: claimNow, budgetPolicy });
    if (claimEligibility.status === "no_eligible_executor") return { status: "NO_EXECUTOR", job };
    const estimate = executor.estimate(request);
    let claimedState: MediaExecutionJobV2;
    try {
      claimedState = claimMediaExecutionJobV2(job, { executorId: executor.capabilities.executorId, executorKind: executor.capabilities.executorKind, leaseId, now: claimNow, leaseDurationMs: input.leaseDurationMs, estimatedCostCents: estimate.costCents });
    } catch (error) {
      if (error instanceof Error && /budget/i.test(error.message)) return { status: "NO_EXECUTOR", job };
      throw error;
    }
    const persistedClaim = await swap(input.queue, job, claimedState);
    if (!persistedClaim) return { status: "WAITING_FOR_LEASE", job: (await input.queue.read(job.jobId))! };
    job = persistedClaim;

    const persistFailure = async (reason: string, retryable = true): Promise<MediaExecutionJobV2> => {
      const authoritative = await input.queue.read(job.jobId);
      if (!authoritative || !["CLAIMED", "PROCESSING", "VALIDATING"].includes(authoritative.state) || authoritative.currentAttemptNumber !== attemptNumber) return authoritative ?? job;
      const failed = failExecutionAttemptV2(authoritative, { attemptNumber, leaseId, now: input.now(), failureCode: reason, retryable });
      return await swap(input.queue, authoritative, failed) ?? (await input.queue.read(job.jobId))!;
    };
    try {
      const accepted = await executor.claim(request);
      if (!accepted.accepted) {
        job = await persistFailure("claim_rejected");
        await executor.fail(request, "claim_rejected").catch(() => ({ accepted: false }));
      } else {
        const started = startExecutionAttemptV2(job, { attemptNumber, leaseId, now: input.now() });
        const persistedStart = await swap(input.queue, job, started);
        if (!persistedStart) return { status: "WAITING_FOR_LEASE", job: (await input.queue.read(job.jobId))! };
        job = persistedStart;
        const result = await executor.execute(request, { heartbeat: async () => {
          const authoritative = await input.queue.read(job.jobId);
          if (!authoritative) throw new Error("durable_job_missing");
          const renewed = heartbeatExecutionAttemptV2(authoritative, { attemptNumber, leaseId, now: input.now(), leaseDurationMs: input.leaseDurationMs });
          const saved = await swap(input.queue, authoritative, renewed);
          if (!saved) throw new Error("execution_lease_lost");
          job = saved;
        } });
        const authoritative = (await input.queue.read(job.jobId))!;
        const submitted = submitRenderedAssetV2(authoritative, { attemptNumber, leaseId, now: input.now(), asset: result.asset });
        const persistedSubmit = await swap(input.queue, authoritative, submitted);
        if (!persistedSubmit) return { status: "WAITING_FOR_LEASE", job: (await input.queue.read(job.jobId))! };
        job = persistedSubmit;
        const checkedAt = input.now();
        const quality = executor.validate(request, result, checkedAt);
        if (quality.status !== "QUALITY_PASS") {
          job = await persistFailure("output_invalid");
          await executor.fail(request, "output_invalid").catch(() => ({ accepted: false }));
        } else {
          const ready = promoteValidatedMasterV2(job, { attemptNumber, leaseId, now: input.now(), quality });
          const persistedReady = await swap(input.queue, job, ready);
          if (!persistedReady) return { status: "WAITING_FOR_LEASE", job: (await input.queue.read(job.jobId))! };
          job = persistedReady;
          await executor.release(request).catch(() => ({ accepted: false }));
          return { status: "READY", job };
        }
      }
    } catch (error) {
      job = await persistFailure("executor_error");
      await executor.fail(request, error instanceof Error ? error.message : "executor_error").catch(() => ({ accepted: false }));
    }
    if (job.state === "FAILED") return { status: "ATTEMPTS_EXHAUSTED", job };
    if (job.state !== "RETRYABLE_FAILED") return { status: "WAITING_FOR_LEASE", job };
    const persistedRetry = await swap(input.queue, job, retryMediaExecutionJobV2(job, input.now()));
    if (!persistedRetry) return { status: "WAITING_FOR_LEASE", job: (await input.queue.read(job.jobId))! };
    job = persistedRetry;
  }
  return { status: job.state === "FAILED" ? "ATTEMPTS_EXHAUSTED" : "NO_EXECUTOR", job };
}
