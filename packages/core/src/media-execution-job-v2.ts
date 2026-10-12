import type { CanonicalMediaPlanV2, MediaPlanLineageV2 } from "./canonical-media-timeline-v2";
import { canonicalJsonV2, deepFreezeV2 } from "./canonical-hash-v2";
import { createExecutionIdentityFromLineageV2, type ExecutorKindV2, type MediaBudgetPolicyV2 } from "./media-execution-router-v2";

export type MediaExecutionStateV2 = "QUEUED" | "CLAIMED" | "PROCESSING" | "VALIDATING" | "RETRYABLE_FAILED" | "FAILED" | "READY";
export type ExecutionAttemptStatusV2 = "CLAIMED" | "PROCESSING" | "VALIDATING" | "FAILED" | "SUCCEEDED";
export type QualityStatusV2 = "QUALITY_PASS" | "QUALITY_DEGRADED" | "OUTPUT_INVALID";

export interface PublicationDeadlineV2 { publishAt: string; escalationAt: string; readyRequiredAt: string }
export interface FallbackPolicyV2 { maxAttempts: number; allowPaidFallback: boolean; approvedFallbackAssetIds: string[] }
export interface ExecutorLeaseV2 { leaseId: string; issuedAt: string; heartbeatAt: string; expiresAt: string }
export interface RenderedAssetV2 {
  renderedAssetId: string; resultHash: string; bytes: number; codec: string; width: number; height: number;
  durationMs: number; fullDecodePassed: boolean; encodeGenerations: number; lineage: MediaPlanLineageV2;
}
export interface QualityResultV2 { status: QualityStatusV2; reasons: string[]; checkedAt: string }
export interface ExecutionAttemptV2 {
  attemptNumber: number; attemptId: string; executorId: string; executorKind: ExecutorKindV2;
  status: ExecutionAttemptStatusV2; claimedAt: string; startedAt: string | null; endedAt: string | null;
  failureCode: string | null; lease: ExecutorLeaseV2; renderedAsset: RenderedAssetV2 | null; quality: QualityResultV2 | null;
  resultSubmittedAt: string | null; estimatedCostCents: number;
}
export interface ReadyMasterV2 {
  executionId: string; attemptNumber: number; executorId: string; renderedAssetId: string; resultHash: string;
  lineage: MediaPlanLineageV2; quality: QualityResultV2; readyAt: string;
}
export interface MediaExecutionJobV2 {
  schemaVersion: 2; version: number; jobId: string; executionId: string; lineage: MediaPlanLineageV2; state: MediaExecutionStateV2;
  createdAt: string; updatedAt: string; deadline: PublicationDeadlineV2; fallbackPolicy: FallbackPolicyV2;
  outputProfile: CanonicalMediaPlanV2["outputProfile"];
  budget: { policy: MediaBudgetPolicyV2; reservedCostCents: number; spentCostCents: number };
  attempts: ExecutionAttemptV2[]; currentAttemptNumber: number | null; readyMaster: ReadyMasterV2 | null;
}

interface JobInputV2 {
  jobId: string; lineage: MediaPlanLineageV2; outputProfile: CanonicalMediaPlanV2["outputProfile"]; createdAt: string;
  deadline: PublicationDeadlineV2; fallbackPolicy: FallbackPolicyV2; budgetPolicy?: MediaBudgetPolicyV2;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const activeAttemptStatuses = new Set<ExecutionAttemptStatusV2>(["CLAIMED", "PROCESSING", "VALIDATING"]);

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a valid timestamp`);
  return parsed;
}
function eventTime(job: MediaExecutionJobV2, now: string): number {
  const parsed = timestamp(now, "now");
  if (parsed < timestamp(job.updatedAt, "updatedAt")) throw new Error("Event time cannot move backwards");
  return parsed;
}
function required(value: string, name: string): void { if (!value.trim()) throw new Error(`${name} is required`); }
function currentAttempt(job: MediaExecutionJobV2): ExecutionAttemptV2 {
  const attempt = job.attempts.find((entry) => entry.attemptNumber === job.currentAttemptNumber);
  if (!attempt) throw new Error("Current execution attempt is unavailable");
  return attempt;
}
function assertOwnership(job: MediaExecutionJobV2, attemptNumber: number, leaseId: string): ExecutionAttemptV2 {
  if (attemptNumber !== job.currentAttemptNumber) throw new Error("Stale attempt cannot mutate the logical job");
  const attempt = currentAttempt(job);
  if (attempt.lease.leaseId !== leaseId) throw new Error("Execution lease ownership mismatch");
  return attempt;
}
function replaceAttempt(job: MediaExecutionJobV2, replacement: ExecutionAttemptV2, state: MediaExecutionStateV2, now: string): MediaExecutionJobV2 {
  return deepFreezeV2({ ...job, version: job.version + 1, state, updatedAt: now, attempts: job.attempts.map((attempt) => attempt.attemptNumber === replacement.attemptNumber ? replacement : attempt) });
}
function sameLineage(expected: MediaPlanLineageV2, actual: MediaPlanLineageV2): boolean { return canonicalJsonV2(expected) === canonicalJsonV2(actual); }
function validateRenderedAsset(job: MediaExecutionJobV2, asset: RenderedAssetV2): void {
  required(asset.renderedAssetId, "renderedAssetId"); required(asset.codec, "codec");
  if (!HASH_PATTERN.test(asset.resultHash)) throw new Error("Rendered result hash is invalid");
  if (![asset.bytes, asset.width, asset.height, asset.durationMs, asset.encodeGenerations].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error("Rendered asset measurements must be positive integers");
  if (!sameLineage(job.lineage, asset.lineage)) throw new Error("Rendered asset lineage mismatch");
}

export function createMediaExecutionJobV2(input: JobInputV2): MediaExecutionJobV2 {
  required(input.jobId, "jobId");
  const createdAt = timestamp(input.createdAt, "createdAt");
  const escalationAt = timestamp(input.deadline.escalationAt, "deadline.escalationAt");
  const readyRequiredAt = timestamp(input.deadline.readyRequiredAt, "deadline.readyRequiredAt");
  const publishAt = timestamp(input.deadline.publishAt, "deadline.publishAt");
  if (escalationAt < createdAt || escalationAt >= readyRequiredAt || readyRequiredAt > publishAt) throw new Error("Publication deadline checkpoints are invalid");
  if (!Number.isSafeInteger(input.fallbackPolicy.maxAttempts) || input.fallbackPolicy.maxAttempts < 1) throw new Error("fallbackPolicy.maxAttempts must be a positive integer");
  const policy = input.budgetPolicy ?? { mode: "FREE_ONLY" as const };
  if (policy.mode === "BOUNDED_PAID" && (!Number.isSafeInteger(policy.maxCostCents) || policy.maxCostCents < 0)) throw new Error("Paid budget must be a non-negative integer");
  return deepFreezeV2({ schemaVersion: 2 as const, version: 1, jobId: input.jobId, executionId: createExecutionIdentityFromLineageV2(input.lineage, input.outputProfile), lineage: input.lineage, state: "QUEUED" as const,
    createdAt: input.createdAt, updatedAt: input.createdAt, deadline: { ...input.deadline },
    outputProfile: { ...input.outputProfile }, budget: { policy, reservedCostCents: 0, spentCostCents: 0 },
    fallbackPolicy: { ...input.fallbackPolicy, approvedFallbackAssetIds: [...input.fallbackPolicy.approvedFallbackAssetIds] },
    attempts: [], currentAttemptNumber: null, readyMaster: null });
}

export function claimMediaExecutionJobV2(job: MediaExecutionJobV2, input: { executorId: string; executorKind: ExecutorKindV2; leaseId: string; now: string; leaseDurationMs: number; estimatedCostCents?: number }): MediaExecutionJobV2 {
  const now = eventTime(job, input.now);
  if (job.state !== "QUEUED") throw new Error(job.currentAttemptNumber !== null ? "An active lease already owns this job" : "Job is not queued");
  if (job.attempts.length >= job.fallbackPolicy.maxAttempts) throw new Error("Maximum execution attempts exhausted");
  required(input.executorId, "executorId"); required(input.leaseId, "leaseId");
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) throw new Error("leaseDurationMs must be a positive integer");
  const estimatedCostCents = input.estimatedCostCents ?? 0;
  if (!Number.isSafeInteger(estimatedCostCents) || estimatedCostCents < 0) throw new Error("estimatedCostCents must be a non-negative integer");
  if (estimatedCostCents > 0 && job.budget.policy.mode === "FREE_ONLY") throw new Error("Paid executor is forbidden in FREE_ONLY mode");
  if (job.budget.policy.mode === "BOUNDED_PAID" && job.budget.spentCostCents + job.budget.reservedCostCents + estimatedCostCents > job.budget.policy.maxCostCents) throw new Error("Paid budget exhausted");
  const attemptNumber = job.attempts.length + 1;
  const attempt: ExecutionAttemptV2 = { attemptNumber, attemptId: `${job.jobId}:attempt:${attemptNumber}`, executorId: input.executorId,
    executorKind: input.executorKind, status: "CLAIMED", claimedAt: input.now, startedAt: null, endedAt: null, failureCode: null,
    lease: { leaseId: input.leaseId, issuedAt: input.now, heartbeatAt: input.now, expiresAt: new Date(Math.min(now + input.leaseDurationMs, timestamp(job.deadline.readyRequiredAt, "deadline.readyRequiredAt"))).toISOString() }, renderedAsset: null, quality: null,
    resultSubmittedAt: null, estimatedCostCents };
  return deepFreezeV2({ ...job, version: job.version + 1, state: "CLAIMED" as const, updatedAt: input.now, currentAttemptNumber: attemptNumber, attempts: [...job.attempts, attempt],
    budget: { ...job.budget, reservedCostCents: job.budget.reservedCostCents + estimatedCostCents } });
}

export function startExecutionAttemptV2(job: MediaExecutionJobV2, input: { attemptNumber: number; leaseId: string; now: string }): MediaExecutionJobV2 {
  const now = eventTime(job, input.now); const attempt = assertOwnership(job, input.attemptNumber, input.leaseId);
  if (job.state !== "CLAIMED" || attempt.status !== "CLAIMED") throw new Error("Claimed attempt is required before processing");
  if (now >= timestamp(attempt.lease.expiresAt, "lease.expiresAt")) throw new Error("Execution lease expired before processing started");
  return replaceAttempt(job, { ...attempt, status: "PROCESSING", startedAt: input.now }, "PROCESSING", input.now);
}

export function heartbeatExecutionAttemptV2(job: MediaExecutionJobV2, input: { attemptNumber: number; leaseId: string; now: string; leaseDurationMs: number }): MediaExecutionJobV2 {
  const now = eventTime(job, input.now); const attempt = assertOwnership(job, input.attemptNumber, input.leaseId);
  if (!activeAttemptStatuses.has(attempt.status)) throw new Error("Inactive attempt cannot heartbeat");
  if (now >= timestamp(attempt.lease.expiresAt, "lease.expiresAt")) throw new Error("Expired lease cannot heartbeat");
  if (!Number.isSafeInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) throw new Error("leaseDurationMs must be a positive integer");
  return replaceAttempt(job, { ...attempt, lease: { ...attempt.lease, heartbeatAt: input.now, expiresAt: new Date(Math.min(now + input.leaseDurationMs, timestamp(job.deadline.readyRequiredAt, "deadline.readyRequiredAt"))).toISOString() } }, job.state, input.now);
}

export function expireExecutionLeaseV2(job: MediaExecutionJobV2, nowText: string, failureCode: string): MediaExecutionJobV2 {
  const now = eventTime(job, nowText); const attempt = currentAttempt(job);
  if (!activeAttemptStatuses.has(attempt.status)) throw new Error("No active lease can expire");
  if (now < timestamp(attempt.lease.expiresAt, "lease.expiresAt")) throw new Error("Execution lease is not expired");
  required(failureCode, "failureCode");
  const terminal = job.attempts.length >= job.fallbackPolicy.maxAttempts;
  const failed = replaceAttempt(job, { ...attempt, status: "FAILED", endedAt: nowText, failureCode }, terminal ? "FAILED" : "RETRYABLE_FAILED", nowText);
  return deepFreezeV2({ ...failed, currentAttemptNumber: terminal ? null : failed.currentAttemptNumber,
    budget: { ...failed.budget, reservedCostCents: failed.budget.reservedCostCents - attempt.estimatedCostCents, spentCostCents: failed.budget.spentCostCents + attempt.estimatedCostCents } });
}

export function failExecutionAttemptV2(job: MediaExecutionJobV2, input: {
  attemptNumber: number;
  leaseId: string;
  now: string;
  failureCode: string;
  retryable?: boolean;
}): MediaExecutionJobV2 {
  eventTime(job, input.now);
  const attempt = assertOwnership(job, input.attemptNumber, input.leaseId);
  if (!activeAttemptStatuses.has(attempt.status)) throw new Error("Only an active attempt can fail");
  required(input.failureCode, "failureCode");
  const canRetry = (input.retryable ?? true) && job.attempts.length < job.fallbackPolicy.maxAttempts;
  const failed = replaceAttempt(job, { ...attempt, status: "FAILED", endedAt: input.now, failureCode: input.failureCode }, canRetry ? "RETRYABLE_FAILED" : "FAILED", input.now);
  const charged = deepFreezeV2({ ...failed, budget: { ...failed.budget, reservedCostCents: failed.budget.reservedCostCents - attempt.estimatedCostCents, spentCostCents: failed.budget.spentCostCents + attempt.estimatedCostCents } });
  return canRetry ? charged : deepFreezeV2({ ...charged, currentAttemptNumber: null });
}

export function retryMediaExecutionJobV2(job: MediaExecutionJobV2, now: string): MediaExecutionJobV2 {
  eventTime(job, now);
  if (job.state !== "RETRYABLE_FAILED") throw new Error("Only a retryable job can be queued again");
  if (job.attempts.length >= job.fallbackPolicy.maxAttempts) return deepFreezeV2({ ...job, version: job.version + 1, state: "FAILED" as const, updatedAt: now, currentAttemptNumber: null });
  return deepFreezeV2({ ...job, version: job.version + 1, state: "QUEUED" as const, updatedAt: now, currentAttemptNumber: null });
}

export function submitRenderedAssetV2(job: MediaExecutionJobV2, input: { attemptNumber: number; leaseId: string; now: string; asset: RenderedAssetV2 }): MediaExecutionJobV2 {
  const now = eventTime(job, input.now); const attempt = assertOwnership(job, input.attemptNumber, input.leaseId);
  if (job.state !== "PROCESSING" || attempt.status !== "PROCESSING") throw new Error("Processing attempt is required before validation");
  if (now >= timestamp(attempt.lease.expiresAt, "lease.expiresAt")) throw new Error("Execution lease expired before result submission");
  validateRenderedAsset(job, input.asset);
  return replaceAttempt(job, { ...attempt, status: "VALIDATING", renderedAsset: input.asset, resultSubmittedAt: input.now }, "VALIDATING", input.now);
}

export function promoteValidatedMasterV2(job: MediaExecutionJobV2, input: { attemptNumber: number; leaseId: string; now: string; quality: QualityResultV2 }): MediaExecutionJobV2 {
  if (job.state === "READY") {
    const existing = job.readyMaster;
    if (existing?.attemptNumber === input.attemptNumber && job.attempts.find((attempt) => attempt.attemptNumber === input.attemptNumber)?.lease.leaseId === input.leaseId && JSON.stringify(existing.quality) === JSON.stringify(input.quality)) return job;
    throw new Error("Conflicting completion cannot replace the ready master");
  }
  const now = eventTime(job, input.now); const attempt = assertOwnership(job, input.attemptNumber, input.leaseId);
  if (job.state !== "VALIDATING" || attempt.status !== "VALIDATING" || !attempt.renderedAsset) throw new Error("Validated render is required before promotion");
  if (input.quality.status !== "QUALITY_PASS" || !attempt.renderedAsset.fullDecodePassed) throw new Error("Output quality did not pass validation");
  if (now >= timestamp(attempt.lease.expiresAt, "lease.expiresAt")) throw new Error("Execution lease expired before master promotion");
  const checkedAt = timestamp(input.quality.checkedAt, "quality.checkedAt");
  if (!attempt.resultSubmittedAt || checkedAt < timestamp(attempt.resultSubmittedAt, "resultSubmittedAt") || checkedAt > now) throw new Error("Quality timestamp is not causal");
  const completed: ExecutionAttemptV2 = { ...attempt, status: "SUCCEEDED", endedAt: input.now, quality: input.quality };
  const readyMaster: ReadyMasterV2 = { executionId: job.executionId, attemptNumber: attempt.attemptNumber, executorId: attempt.executorId,
    renderedAssetId: attempt.renderedAsset.renderedAssetId, resultHash: attempt.renderedAsset.resultHash, lineage: job.lineage, quality: input.quality, readyAt: input.now };
  return deepFreezeV2({ ...job, version: job.version + 1, state: "READY" as const, updatedAt: input.now,
    attempts: job.attempts.map((entry) => entry.attemptNumber === completed.attemptNumber ? completed : entry), readyMaster,
    budget: { ...job.budget, reservedCostCents: job.budget.reservedCostCents - attempt.estimatedCostCents, spentCostCents: job.budget.spentCostCents + attempt.estimatedCostCents } });
}

export function validateMediaExecutionJobV2(job: MediaExecutionJobV2): void {
  if (job.schemaVersion !== 2 || !Number.isSafeInteger(job.version) || job.version < 1) throw new Error("Media execution snapshot invariant failed");
  required(job.jobId, "jobId");
  if (job.executionId !== createExecutionIdentityFromLineageV2(job.lineage, job.outputProfile)) throw new Error("Media execution snapshot identity invariant failed");
  const created = timestamp(job.createdAt, "createdAt"); const updated = timestamp(job.updatedAt, "updatedAt");
  const escalation = timestamp(job.deadline.escalationAt, "deadline.escalationAt"); const ready = timestamp(job.deadline.readyRequiredAt, "deadline.readyRequiredAt"); const publish = timestamp(job.deadline.publishAt, "deadline.publishAt");
  if (updated < created || escalation < created || escalation >= ready || ready > publish) throw new Error("Media execution snapshot deadline invariant failed");
  if (job.budget.reservedCostCents < 0 || job.budget.spentCostCents < 0) throw new Error("Media execution snapshot budget invariant failed");
  if (job.budget.policy.mode === "FREE_ONLY" && (job.budget.reservedCostCents !== 0 || job.budget.spentCostCents !== 0)) throw new Error("Media execution snapshot budget invariant failed");
  if (job.budget.policy.mode === "BOUNDED_PAID" && job.budget.reservedCostCents + job.budget.spentCostCents > job.budget.policy.maxCostCents) throw new Error("Media execution snapshot budget invariant failed");
  job.attempts.forEach((attempt, index) => {
    if (attempt.attemptNumber !== index + 1 || attempt.attemptId !== `${job.jobId}:attempt:${index + 1}`) throw new Error("Media execution snapshot attempt invariant failed");
    const issued = timestamp(attempt.lease.issuedAt, "lease.issuedAt"); const heartbeat = timestamp(attempt.lease.heartbeatAt, "lease.heartbeatAt"); const expires = timestamp(attempt.lease.expiresAt, "lease.expiresAt");
    if (heartbeat < issued || expires <= heartbeat || attempt.estimatedCostCents < 0) throw new Error("Media execution snapshot lease invariant failed");
    if (attempt.renderedAsset) validateRenderedAsset(job, attempt.renderedAsset);
  });
  const active = job.attempts.filter((attempt) => activeAttemptStatuses.has(attempt.status));
  if (["CLAIMED", "PROCESSING", "VALIDATING"].includes(job.state)) {
    if (active.length !== 1 || job.currentAttemptNumber !== active[0].attemptNumber || active[0].status !== job.state) throw new Error("Media execution snapshot active attempt invariant failed");
  } else if (active.length !== 0) throw new Error("Media execution snapshot active attempt invariant failed");
  if (job.state === "READY") {
    const succeeded = job.attempts.filter((attempt) => attempt.status === "SUCCEEDED");
    if (!job.readyMaster || succeeded.length !== 1 || !succeeded[0].renderedAsset || succeeded[0].attemptNumber !== job.readyMaster.attemptNumber
      || succeeded[0].renderedAsset.resultHash !== job.readyMaster.resultHash || job.readyMaster.executionId !== job.executionId
      || job.readyMaster.quality.status !== "QUALITY_PASS") throw new Error("Media execution snapshot READY invariant failed");
  } else if (job.readyMaster !== null) throw new Error("Media execution snapshot master invariant failed");
}

export function recoverMediaExecutionJobV2(snapshot: unknown, now: string): MediaExecutionJobV2 {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Invalid media execution job snapshot");
  const job = snapshot as MediaExecutionJobV2;
  if (job.schemaVersion !== 2 || !Array.isArray(job.attempts) || !job.jobId?.trim() || !job.executionId?.trim()) throw new Error("Invalid media execution job snapshot");
  validateMediaExecutionJobV2(job);
  eventTime(job, now);
  if (["CLAIMED", "PROCESSING", "VALIDATING"].includes(job.state)) {
    const attempt = currentAttempt(job);
    if (timestamp(now, "now") >= timestamp(attempt.lease.expiresAt, "lease.expiresAt")) return expireExecutionLeaseV2(job, now, "lease_expired_after_restart");
  }
  return deepFreezeV2(JSON.parse(JSON.stringify(job)) as MediaExecutionJobV2);
}
