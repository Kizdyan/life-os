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
  });

  it("stops at review instead of publishing autonomously", async () => {
    const store = new JobStore();
    store.jobs.push({
      id: "review",
      type: "await_review",
      assetId: "asset-1",
      projectId: null,
      state: "queued",
      attempts: 0,
      maxAttempts: 4,
      notBefore: null,
      lastError: null,
      createdAt: "2026-09-28T20:00:00.000Z",
      updatedAt: "2026-09-28T20:00:00.000Z",
    });

    const worker = new MediaWorker({
      store,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      now: () => "2026-09-28T20:01:00.000Z",
      handlers: {
        classify: async () => undefined,
        analyze: async () => undefined,
        draft: async () => undefined,
        diveMReview: async () => undefined,
        prepareEdit: async () => undefined,
        measure: async () => undefined,
        learn: async () => undefined,
      },
    });

    const [result] = await worker.runOnce();
    expect(result.state).toBe("waiting_approval");
  });

  it("retries bounded failures with exponential backoff", async () => {
    const store = new JobStore();
    store.jobs.push({
      id: "analyze",
      type: "analyze",
      assetId: "asset-1",
      projectId: null,
      state: "queued",
      attempts: 0,
      maxAttempts: 4,
      notBefore: null,
      lastError: null,
      createdAt: "2026-09-28T20:00:00.000Z",
      updatedAt: "2026-09-28T20:00:00.000Z",
    });

    const worker = new MediaWorker({
      store,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      now: () => "2026-09-28T20:01:00.000Z",
      handlers: {
        classify: async () => undefined,
        analyze: async () => {
          throw new Error("temporary");
        },
        draft: async () => undefined,
        diveMReview: async () => undefined,
        prepareEdit: async () => undefined,
        measure: async () => undefined,
        learn: async () => undefined,
      },
    });

    const [result] = await worker.runOnce();
    expect(result.state).toBe("failed");
    expect(result.attempts).toBe(1);
    expect(result.notBefore).toBe("2026-09-28T20:01:30.000Z");
    expect(retrySeconds(4)).toBe(240);
  });
});
