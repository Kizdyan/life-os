import { describe, expect, it } from "vitest";
import {
  MediaWorker,
  createDownstreamJobs,
  retrySeconds,
  type MediaJob,
  type MediaJobStore,
} from "./media-jobs";
import {
  DEFAULT_MEDIA_CAPABILITIES,
  PERSONAL_HIGH_AUTONOMY_MEDIA,
  type MediaAsset,
} from "./media-brain";

class JobStore implements MediaJobStore {
  jobs: MediaJob[] = [];
  saves: MediaJob[] = [];

  async enqueue(job: MediaJob): Promise<void> {
    this.jobs.push(job);
  }

  async get(jobId: string): Promise<MediaJob | null> {
    return this.jobs.find((job) => job.id === jobId) ?? null;
  }

  async listRunnable(): Promise<MediaJob[]> {
    return this.jobs.filter((job) => job.state === "queued" || job.state === "failed");
  }

  async save(job: MediaJob): Promise<void> {
    this.saves.push(job);
    const index = this.jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) this.jobs[index] = job;
  }
}

const asset: MediaAsset = {
  id: "asset-1",
  provider: "yandex",
  providerId: "provider-1",
  providerPath: "/Media/Inbox/a.mov",
  contentHash: "hash",
  mimeType: "video/quicktime",
  source: "own_raw",
  section: "inbox",
  status: "ingested",
  projectId: null,
  createdAt: null,
  importedAt: "2026-09-28T20:00:00.000Z",
  provenance: {
    originalProviderPath: "/Media/Inbox/a.mov",
    originalProviderId: "provider-1",
    destructiveMoveVerified: false,
  },
};

function queuedJob(id: string, type: MediaJob["type"], dependsOnJobId: string | null = null): MediaJob {
  return {
    id,
    type,
    assetId: "asset-1",
    projectId: null,
    state: "queued",
    dependsOnJobId,
    attempts: 0,
    maxAttempts: 4,
    notBefore: null,
    lastError: null,
    createdAt: "2026-09-28T20:00:00.000Z",
    updatedAt: "2026-09-28T20:00:00.000Z",
  };
}

const handlers = {
  classify: async () => undefined,
  analyze: async () => undefined,
  draft: async () => undefined,
  diveMReview: async () => undefined,
  prepareEdit: async () => undefined,
  measure: async () => undefined,
  learn: async () => undefined,
};

describe("Media autonomous jobs", () => {
  it("adds DiveM review only for the personal capability profile", () => {
    let id = 0;
    const personal = createDownstreamJobs({
      asset,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      now: "2026-09-28T20:00:00.000Z",
      createId: () => `p-${++id}`,
    });
    const standard = createDownstreamJobs({
      asset,
      capabilities: DEFAULT_MEDIA_CAPABILITIES,
      now: "2026-09-28T20:00:00.000Z",
      createId: () => `s-${++id}`,
    });

    expect(personal.map((job) => job.type)).toContain("divem_review");
    expect(standard.map((job) => job.type)).not.toContain("divem_review");

    for (let index = 1; index < personal.length; index += 1) {
      expect(personal[index].dependsOnJobId).toBe(personal[index - 1].id);
    }
  });

  it("runs dependencies in order even when both are runnable in one worker tick", async () => {
    const store = new JobStore();
    store.jobs.push(
      queuedJob("classify", "classify"),
      queuedJob("analyze", "analyze", "classify"),
    );
    const calls: string[] = [];

    const worker = new MediaWorker({
      store,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      now: () => "2026-09-28T20:01:00.000Z",
      handlers: {
        ...handlers,
        classify: async () => {
          calls.push("classify");
        },
        analyze: async () => {
          calls.push("analyze");
        },
      },
    });

    const result = await worker.runOnce();
    expect(result.map((job) => job.id)).toEqual(["classify", "analyze"]);
    expect(calls).toEqual(["classify", "analyze"]);
    expect(store.jobs.find((job) => job.id === "analyze")?.state).toBe("completed");
  });

  it("stops at review instead of publishing autonomously", async () => {
    const store = new JobStore();
    store.jobs.push(queuedJob("review", "await_review"));

    const worker = new MediaWorker({
      store,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      now: () => "2026-09-28T20:01:00.000Z",
      handlers,
    });

    const [result] = await worker.runOnce();
    expect(result.state).toBe("waiting_approval");
  });

  it("retries bounded failures with exponential backoff", async () => {
    const store = new JobStore();
    store.jobs.push(queuedJob("analyze", "analyze"));

    const worker = new MediaWorker({
      store,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      now: () => "2026-09-28T20:01:00.000Z",
      handlers: {
        ...handlers,
        analyze: async () => {
          throw new Error("temporary");
        },
      },
    });

    const [result] = await worker.runOnce();
    expect(result.state).toBe("failed");
    expect(result.attempts).toBe(1);
    expect(result.notBefore).toBe("2026-09-28T20:01:30.000Z");
    expect(retrySeconds(4)).toBe(240);
  });
});
