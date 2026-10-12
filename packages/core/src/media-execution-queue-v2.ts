import type { MediaExecutionJobV2 } from "./media-execution-job-v2";
import { deepFreezeV2 } from "./canonical-hash-v2";

export interface MediaExecutionQueueV2 {
  enqueue(job: MediaExecutionJobV2): Promise<boolean>;
  read(jobId: string): Promise<MediaExecutionJobV2 | null>;
  compareAndSwap(jobId: string, expectedVersion: number, next: MediaExecutionJobV2): Promise<boolean>;
}

function detached(job: MediaExecutionJobV2): MediaExecutionJobV2 {
  return deepFreezeV2(JSON.parse(JSON.stringify(job)) as MediaExecutionJobV2);
}

export function createInMemoryMediaExecutionQueueV2(initial: MediaExecutionJobV2[] = []): MediaExecutionQueueV2 {
  if (new Set(initial.map((job) => job.jobId)).size !== initial.length) throw new Error("Duplicate logical media jobs are not allowed");
  const jobs = new Map(initial.map((job) => [job.jobId, detached(job)]));
  return {
    enqueue: async (job) => {
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
      jobs.set(jobId, detached(next));
      return true;
    },
  };
}
