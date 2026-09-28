import type { MediaAsset, MediaCapabilities } from "./media-brain";

export type MediaJobType =
  | "ingest"
  | "classify"
  | "analyze"
  | "draft"
  | "divem_review"
  | "prepare_edit"
  | "await_review"
  | "publish"
  | "measure"
  | "learn";

export type MediaJobState =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "dead_letter";

export interface MediaJob {
  id: string;
  type: MediaJobType;
  assetId: string | null;
  projectId: string | null;
  state: MediaJobState;
  dependsOnJobId: string | null;
  approvalGranted?: boolean;
  attempts: number;
  maxAttempts: number;
  notBefore: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaJobStore {
  enqueue(job: MediaJob): Promise<void>;
  get(jobId: string): Promise<MediaJob | null>;
  listRunnable(now: string, limit: number): Promise<MediaJob[]>;
  save(job: MediaJob): Promise<void>;
}

export interface MediaJobHandlers {
  classify(job: MediaJob): Promise<void>;
  analyze(job: MediaJob): Promise<void>;
  draft(job: MediaJob): Promise<void>;
  diveMReview(job: MediaJob): Promise<void>;
  prepareEdit(job: MediaJob): Promise<void>;
  measure(job: MediaJob): Promise<void>;
  learn(job: MediaJob): Promise<void>;
}

export interface MediaWorkerOptions {
  store: MediaJobStore;
  handlers: MediaJobHandlers;
  capabilities: MediaCapabilities;
  now: () => string;
}

export class MediaWorker {
  constructor(private readonly options: MediaWorkerOptions) {}

  async runOnce(limit = 20): Promise<MediaJob[]> {
    const now = this.options.now();
    const jobs = await this.options.store.listRunnable(now, limit);
    const results: MediaJob[] = [];

    for (const job of jobs) {
      if (!(await this.dependencySatisfied(job))) continue;

      const next = { ...job, state: "running" as const, updatedAt: now };
      await this.options.store.save(next);

      try {
        const terminal = await this.execute(next);
        await this.options.store.save(terminal);
        results.push(terminal);
      } catch (error) {
        const failed = this.fail(next, error);
        await this.options.store.save(failed);
        results.push(failed);
      }
    }

    return results;
  }

  private async dependencySatisfied(job: MediaJob): Promise<boolean> {
    if (!job.dependsOnJobId) return true;
    const dependency = await this.options.store.get(job.dependsOnJobId);
    return dependency?.state === "completed";
  }

  private async execute(job: MediaJob): Promise<MediaJob> {
    switch (job.type) {
      case "publish":
        return {
          ...job,
          state:
            this.options.capabilities.approvalBeforePublish && !job.approvalGranted
              ? "waiting_approval"
              : "completed",
          updatedAt: this.options.now(),
        };
      case "await_review":
        return {
          ...job,
          state: "waiting_approval",
          updatedAt: this.options.now(),
        };
      case "classify":
        await this.options.handlers.classify(job);
        break;
      case "analyze":
        await this.options.handlers.analyze(job);
        break;
      case "draft":
        await this.options.handlers.draft(job);
        break;
      case "divem_review":
        if (this.options.capabilities.useDiveMPrePublishAnalysis) {
          await this.options.handlers.diveMReview(job);
        }
        break;
      case "prepare_edit":
        await this.options.handlers.prepareEdit(job);
        break;
      case "measure":
        await this.options.handlers.measure(job);
        break;
      case "learn":
        await this.options.handlers.learn(job);
        break;
      case "ingest":
        break;
      default:
        return assertNever(job.type);
    }

    return {
      ...job,
      state: "completed",
      updatedAt: this.options.now(),
    };
  }

  private fail(job: MediaJob, error: unknown): MediaJob {
    const attempts = job.attempts + 1;
    const exhausted = attempts >= job.maxAttempts;
    return {
      ...job,
      attempts,
      state: exhausted ? "dead_letter" : "failed",
      lastError: error instanceof Error ? error.message : "Unknown media job failure",
      notBefore: exhausted ? null : addSeconds(this.options.now(), retrySeconds(attempts)),
      updatedAt: this.options.now(),
    };
  }
}

export function createDownstreamJobs(input: {
  asset: MediaAsset;
  capabilities: MediaCapabilities;
  now: string;
  createId: () => string;
}): MediaJob[] {
  const types: MediaJobType[] = [
    "classify",
    "analyze",
    "draft",
    ...(input.capabilities.useDiveMPrePublishAnalysis ? (["divem_review"] as const) : []),
    "prepare_edit",
    "await_review",
  ];

  let previousId: string | null = null;
  return types.map((type) => {
    const id = input.createId();
    const job: MediaJob = {
      id,
      type,
      assetId: input.asset.id,
      projectId: input.asset.projectId,
      state: "queued",
      dependsOnJobId: previousId,
      approvalGranted: false,
      attempts: 0,
      maxAttempts: 4,
      notBefore: null,
      lastError: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    previousId = id;
    return job;
  });
}

export function createReferenceJobs(input: {
  asset: MediaAsset;
  now: string;
  createId: () => string;
}): MediaJob[] {
  const types: MediaJobType[] = ["classify", "analyze", "learn"];
  let previousId: string | null = null;
  return types.map((type) => {
    const id = input.createId();
    const job: MediaJob = {
      id,
      type,
      assetId: input.asset.id,
      projectId: input.asset.projectId,
      state: "queued",
      dependsOnJobId: previousId,
      approvalGranted: false,
      attempts: 0,
      maxAttempts: 4,
      notBefore: null,
      lastError: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    previousId = id;
    return job;
  });
}

export function createPostApprovalJobs(input: {
  assetId: string | null;
  projectId: string | null;
  approvedReviewJobId: string;
  now: string;
  createId: () => string;
}): MediaJob[] {
  const types: MediaJobType[] = ["publish", "measure", "learn"];
  let previousId: string | null = input.approvedReviewJobId;

  return types.map((type) => {
    const id = input.createId();
    const job: MediaJob = {
      id,
      type,
      assetId: input.assetId,
      projectId: input.projectId,
      state: "queued",
      dependsOnJobId: previousId,
      approvalGranted: type === "publish",
      attempts: 0,
      maxAttempts: 4,
      notBefore: null,
      lastError: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    previousId = id;
    return job;
  });
}

export function retrySeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function assertNever(value: never): never {
  throw new Error(`Unhandled media job type: ${value}`);
}
