import { validateMediaExecutionJobV2, type MediaExecutionJobV2 } from "./media-execution-job-v2";
import { canonicalJsonV2, deepFreezeV2 } from "./canonical-hash-v2";

export interface MediaExecutionQueueV2 {
  enqueue(job: MediaExecutionJobV2): Promise<boolean>;
  read(jobId: string): Promise<MediaExecutionJobV2 | null>;
  compareAndSwap(jobId: string, expectedVersion: number, next: MediaExecutionJobV2): Promise<boolean>;
}

function detached(job: MediaExecutionJobV2): MediaExecutionJobV2 {
  return deepFreezeV2(JSON.parse(JSON.stringify(job)) as MediaExecutionJobV2);
}

export function createInMemoryMediaExecutionQueueV2(initial: MediaExecutionJobV2[] = []): MediaExecutionQueueV2 {
  initial.forEach(validateMediaExecutionJobV2);
  if (new Set(initial.map((job) => job.jobId)).size !== initial.length) throw new Error("Duplicate logical media jobs are not allowed");
  const jobs = new Map(initial.map((job) => [job.jobId, detached(job)]));
  return {
    enqueue: async (job) => {
      validateMediaExecutionJobV2(job);
      if (jobs.has(job.jobId)) return false;
      jobs.set(job.jobId, detached(job));
      return true;
    },
    read: async (jobId) => {
      const job = jobs.get(jobId);
      return job ? detached(job) : null;
    },
    compareAndSwap: async (jobId, expectedVersion, next) => {
      const current = jobs.get(jobId);
      if (!current || current.version !== expectedVersion) return false;
      if (next.jobId !== jobId || next.executionId !== current.executionId || next.version !== expectedVersion + 1) {
        throw new Error("Invalid media queue compare-and-swap transition");
      }
      validateMediaExecutionJobV2(next);
      const immutable = (job: MediaExecutionJobV2) => ({ lineage: job.lineage, outputProfile: job.outputProfile, createdAt: job.createdAt, deadline: job.deadline, fallbackPolicy: job.fallbackPolicy, budgetPolicy: job.budget.policy });
      if (canonicalJsonV2(immutable(next)) !== canonicalJsonV2(immutable(current))) throw new Error("Immutable media job fields cannot change");
      const allowed: Record<MediaExecutionJobV2["state"], MediaExecutionJobV2["state"][]> = {
        QUEUED: ["CLAIMED"], CLAIMED: ["PROCESSING", "RETRYABLE_FAILED", "FAILED"], PROCESSING: ["PROCESSING", "VALIDATING", "RETRYABLE_FAILED", "FAILED"],
        VALIDATING: ["VALIDATING", "READY", "RETRYABLE_FAILED", "FAILED"], RETRYABLE_FAILED: ["QUEUED", "FAILED"], FAILED: [], READY: [],
      };
      if (!allowed[current.state].includes(next.state)) throw new Error("Illegal media queue state transition");
      if (next.attempts.length < current.attempts.length || next.attempts.length > current.attempts.length + 1) throw new Error("Invalid media attempt history transition");
      const historicalCount = current.currentAttemptNumber === null ? current.attempts.length : Math.max(0, current.attempts.length - 1);
      if (canonicalJsonV2(next.attempts.slice(0, historicalCount)) !== canonicalJsonV2(current.attempts.slice(0, historicalCount))) throw new Error("Historical media attempts are immutable");
      jobs.set(jobId, detached(next));
      return true;
    },
  };
}
