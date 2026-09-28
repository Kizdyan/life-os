import { describe, expect, it } from "vitest";
import type {
  MediaAsset,
  MediaStorageProvider,
} from "./media-brain";
import type { MediaAssetStore } from "./media-ingestion";
import type { MediaJob, MediaJobStore } from "./media-jobs";
import { MediaBrainOrchestrator } from "./media-orchestrator";
import { PERSONAL_HIGH_AUTONOMY_MEDIA } from "./media-brain";

class AssetStore implements MediaAssetStore {
  byKey = new Map<string, MediaAsset>();
  async findByIngestKey(key: string): Promise<MediaAsset | null> {
    return this.byKey.get(key) ?? null;
  }
  async save(asset: MediaAsset, ingestKey: string): Promise<void> {
    this.byKey.set(ingestKey, asset);
  }
}

class JobStore implements MediaJobStore {
  jobs = new Map<string, MediaJob>();
  async enqueue(job: MediaJob): Promise<void> {
    this.jobs.set(job.id, job);
  }
  async get(jobId: string): Promise<MediaJob | null> {
    return this.jobs.get(jobId) ?? null;
  }
  async listRunnable(): Promise<MediaJob[]> {
    return [...this.jobs.values()];
  }
  async save(job: MediaJob): Promise<void> {
    this.jobs.set(job.id, job);
  }
}

describe("MediaBrainOrchestrator", () => {
  it("bootstraps exactly the root plus three visible folders", async () => {
    const created: string[] = [];
    const provider: MediaStorageProvider = {
      id: "yandex",
      list: async () => [],
      stat: async () => null,
      createFolder: async (path) => {
        created.push(path);
      },
      upload: async () => undefined,
      move: async () => undefined,
      copy: async () => undefined,
      archive: async () => undefined,
    };

    const orchestrator = new MediaBrainOrchestrator({
      provider,
      assetStore: new AssetStore(),
      jobStore: new JobStore(),
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      rootPath: "/Media",
      now: () => "2026-09-29T10:00:00.000Z",
      createAssetId: () => "asset-1",
      createJobId: () => "job-1",
    });

    await orchestrator.bootstrap();

    expect(created).toEqual([
      "/Media",
      "/Media/Inbox",
      "/Media/References",
      "/Media/Projects",
    ]);
  });

  it("enqueues the autonomous chain only once per new Inbox asset", async () => {
    const provider: MediaStorageProvider = {
      id: "yandex",
      list: async (path) =>
        path.endsWith("/Inbox")
          ? [
              {
                id: "remote-1",
                path: "/Media/Inbox/video.mov",
                name: "video.mov",
                mimeType: "video/quicktime",
                size: 1000,
                modifiedAt: "2026-09-29T09:00:00.000Z",
                contentHash: "sha-video",
              },
            ]
          : [],
      stat: async () => null,
      createFolder: async () => undefined,
      upload: async () => undefined,
      move: async () => undefined,
      copy: async () => undefined,
      archive: async () => undefined,
    };

    const assetStore = new AssetStore();
    const jobStore = new JobStore();
    let assetCounter = 0;
    let jobCounter = 0;

    const orchestrator = new MediaBrainOrchestrator({
      provider,
      assetStore,
      jobStore,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      rootPath: "/Media",
      now: () => "2026-09-29T10:00:00.000Z",
      createAssetId: () => `asset-${++assetCounter}`,
      createJobId: () => `job-${++jobCounter}`,
    });

    const first = await orchestrator.tick();
    const second = await orchestrator.tick();

    expect(first.importedAssetIds).toEqual(["asset-1"]);
    expect(first.importedReferenceIds).toHaveLength(0);
    expect(first.enqueuedJobIds).toHaveLength(6);
    expect(second.importedAssetIds).toHaveLength(0);
    expect(second.importedReferenceIds).toHaveLength(0);
    expect(second.enqueuedJobIds).toHaveLength(0);
    expect(jobStore.jobs.size).toBe(6);

    const chain = [...jobStore.jobs.values()];
    expect(chain.map((job) => job.type)).toEqual([
      "classify",
      "analyze",
      "draft",
      "divem_review",
      "prepare_edit",
      "await_review",
    ]);
    expect(chain[0].dependsOnJobId).toBeNull();
    expect(chain[5].dependsOnJobId).toBe(chain[4].id);
  });

  it("analyzes intentional references without creating content drafts", async () => {
    const provider: MediaStorageProvider = {
      id: "yandex",
      list: async (path) =>
        path.endsWith("/References")
          ? [
              {
                id: "reference-remote",
                path: "/Media/References/edit-style.mp4",
                name: "edit-style.mp4",
                mimeType: "video/mp4",
                size: 2000,
                modifiedAt: "2026-09-29T09:30:00.000Z",
                contentHash: "ref-hash",
              },
            ]
          : [],
      stat: async () => null,
      createFolder: async () => undefined,
      upload: async () => undefined,
      move: async () => undefined,
      copy: async () => undefined,
      archive: async () => undefined,
    };

    const assetStore = new AssetStore();
    const jobStore = new JobStore();
    let assetCounter = 0;
    let jobCounter = 0;
    const orchestrator = new MediaBrainOrchestrator({
      provider,
      assetStore,
      jobStore,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      rootPath: "/Media",
      now: () => "2026-09-29T10:00:00.000Z",
      createAssetId: () => `asset-${++assetCounter}`,
      createJobId: () => `job-${++jobCounter}`,
    });

    const result = await orchestrator.tick();

    expect(result.importedReferenceIds).toEqual(["asset-1"]);
    expect(result.importedAssetIds).toHaveLength(0);
    expect([...jobStore.jobs.values()].map((job) => job.type)).toEqual([
      "classify",
      "analyze",
      "learn",
    ]);
    expect([...assetStore.byKey.values()][0]).toMatchObject({
      section: "references",
      source: "reference",
    });
  });
});
