import { describe, expect, it } from "vitest";
import {
  PERSONAL_HIGH_AUTONOMY_MEDIA,
  type MediaAsset,
  type MediaStorageEntry,
  type MediaStorageProvider,
} from "./media-brain";
import type { MediaAssetStore } from "./media-ingestion";
import {
  MediaWorker,
  type MediaJob,
  type MediaJobStore,
} from "./media-jobs";
import { MediaBrainOrchestrator } from "./media-orchestrator";
import { applyMediaReview } from "./media-review";
import { buildCapCutWorkPackage } from "./capcut-work-package";
import type { ContentCandidate } from "./media-pipeline";

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

  async listRunnable(now: string, limit: number): Promise<MediaJob[]> {
    return [...this.jobs.values()]
      .filter((job) => job.state === "queued" || job.state === "failed")
      .filter((job) => !job.notBefore || job.notBefore <= now)
      .slice(0, limit);
  }

  async save(job: MediaJob): Promise<void> {
    this.jobs.set(job.id, job);
  }
}

const provider: MediaStorageProvider = {
  id: "yandex",
  list: async (path): Promise<MediaStorageEntry[]> =>
    path.endsWith("/Inbox")
      ? [
          {
            id: "remote-video",
            path: "/Media/Inbox/rehearsal.mov",
            name: "rehearsal.mov",
            mimeType: "video/quicktime",
            size: 10_000,
            modifiedAt: "2026-09-29T09:00:00.000Z",
            contentHash: "hash-video",
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

function candidate(): ContentCandidate {
  return {
    id: "candidate-1",
    projectId: "project-1",
    assetIds: ["asset-1"],
    title: "Backstage",
    caption: null,
    createdAt: "2026-09-29T10:00:00.000Z",
    workPackage: buildCapCutWorkPackage({
      projectId: "project-1",
      channel: "instagram",
      aspectRatio: "9:16",
      targetDurationMs: 20_000,
      hook: "Репетиция изнутри",
      clips: [
        {
          assetId: "asset-1",
          sourceStartMs: 0,
          sourceEndMs: 2500,
          order: 1,
          reason: "hook",
        },
      ],
      captions: [],
      overlays: [],
      audio: [],
      coverBrief: null,
      diveMRevisionNotes: [],
      styleMemoryNotes: [],
    }),
  };
}

describe("personal Media Brain closed loop", () => {
  it("goes from Yandex Inbox to review, approval, publish, measure and learn", async () => {
    const assetStore = new AssetStore();
    const jobStore = new JobStore();
    let assetId = 0;
    let jobId = 0;
    const orchestrator = new MediaBrainOrchestrator({
      provider,
      assetStore,
      jobStore,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      rootPath: "/Media",
      now: () => "2026-09-29T10:00:00.000Z",
      createAssetId: () => `asset-${++assetId}`,
      createJobId: () => `job-${++jobId}`,
    });

    const tick = await orchestrator.tick();
    expect(tick.importedAssetIds).toEqual(["asset-1"]);

    const calls: string[] = [];
    const worker = new MediaWorker({
      store: jobStore,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      now: () => "2026-09-29T10:05:00.000Z",
      handlers: {
        classify: async () => {
          calls.push("classify");
        },
        analyze: async () => {
          calls.push("analyze");
        },
        draft: async () => {
          calls.push("draft");
        },
        diveMReview: async () => {
          calls.push("divem_review");
        },
        prepareEdit: async () => {
          calls.push("prepare_edit");
        },
        publish: async () => {
          calls.push("publish");
        },
        measure: async () => {
          calls.push("measure");
        },
        learn: async () => {
          calls.push("learn");
        },
      },
    });

    await worker.runOnce();

    expect(calls).toEqual([
      "classify",
      "analyze",
      "draft",
      "divem_review",
      "prepare_edit",
    ]);

    const reviewJob = [...jobStore.jobs.values()].find(
      (job) => job.type === "await_review",
    );
    expect(reviewJob?.state).toBe("waiting_approval");

    const review = await applyMediaReview({
      candidate: candidate(),
      reviewJobId: reviewJob!.id,
      decision: "approve",
      feedback: [],
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      jobStore,
      createJobId: () => `job-${++jobId}`,
      now: () => "2026-09-29T10:10:00.000Z",
    });

    expect(review.releasedJobIds).toHaveLength(3);

    await worker.runOnce();

    expect(calls).toEqual([
      "classify",
      "analyze",
      "draft",
      "divem_review",
      "prepare_edit",
      "publish",
      "measure",
      "learn",
    ]);
    expect(
      [...jobStore.jobs.values()]
        .filter((job) => ["publish", "measure", "learn"].includes(job.type))
        .every((job) => job.state === "completed"),
    ).toBe(true);
  });
});
