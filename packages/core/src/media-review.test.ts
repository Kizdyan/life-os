import { describe, expect, it } from "vitest";
import {
  PERSONAL_HIGH_AUTONOMY_MEDIA,
  type StyleMemoryObservation,
} from "./media-brain";
import { buildCapCutWorkPackage } from "./capcut-work-package";
import type { ContentCandidate } from "./media-pipeline";
import type { MediaJob, MediaJobStore } from "./media-jobs";
import { applyMediaReview } from "./media-review";
import type { StyleMemoryStore } from "./style-memory";

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

class MemoryStyleStore implements StyleMemoryStore {
  items: StyleMemoryObservation[] = [];
  async append(observation: StyleMemoryObservation): Promise<void> {
    this.items.push(observation);
  }
  async listByDimension(dimension: StyleMemoryObservation["dimension"]): Promise<StyleMemoryObservation[]> {
    return this.items.filter((item) => item.dimension === dimension);
  }
}

const candidate: ContentCandidate = {
  id: "candidate-1",
  projectId: "project-1",
  assetIds: ["asset-1"],
  title: "Reel",
  caption: null,
  createdAt: "2026-09-29T10:00:00.000Z",
  workPackage: buildCapCutWorkPackage({
    projectId: "project-1",
    channel: "instagram",
    aspectRatio: "9:16",
    targetDurationMs: 25000,
    hook: "Репетиция изнутри",
    clips: [
      {
        assetId: "asset-1",
        sourceStartMs: 0,
        sourceEndMs: 2000,
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

function waitingReviewJob(): MediaJob {
  return {
    id: "review-1",
    type: "await_review",
    assetId: "asset-1",
    projectId: "project-1",
    state: "waiting_approval",
    dependsOnJobId: "edit-1",
    approvalGranted: false,
    attempts: 0,
    maxAttempts: 4,
    notBefore: null,
    lastError: null,
    createdAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
  };
}

describe("media review loop", () => {
  it("approval releases publish -> measure -> learn with explicit approval", async () => {
    const store = new JobStore();
    store.jobs.set("review-1", waitingReviewJob());
    let id = 0;

    const outcome = await applyMediaReview({
      candidate,
      reviewJobId: "review-1",
      decision: "approve",
      feedback: [],
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      jobStore: store,
      createJobId: () => `post-${++id}`,
      now: () => "2026-09-29T11:00:00.000Z",
    });

    expect(store.jobs.get("review-1")?.state).toBe("completed");
    const released = outcome.releasedJobIds.map((jobId) => store.jobs.get(jobId)!);
    expect(released.map((job) => job.type)).toEqual(["publish", "measure", "learn"]);
    expect(released[0].approvalGranted).toBe(true);
    expect(released[0].dependsOnJobId).toBe("review-1");
    expect(released[1].dependsOnJobId).toBe(released[0].id);
  });

  it("revision feeds reusable feedback into Style Memory and creates a new review cycle", async () => {
    const store = new JobStore();
    const styleStore = new MemoryStyleStore();
    store.jobs.set("review-1", waitingReviewJob());
    let id = 0;

    const outcome = await applyMediaReview({
      candidate,
      reviewJobId: "review-1",
      decision: "revise",
      feedback: ["Сделай начало спокойнее и оставляй такой темп дальше."],
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      jobStore: store,
      createJobId: () => `revision-${++id}`,
      now: () => "2026-09-29T11:00:00.000Z",
      styleStore,
      styleInterpreter: {
        interpret: async () => [
          {
            dimension: "pacing",
            value: "спокойное начало без резкого блогерского темпа",
            confidence: 0.95,
            reusable: true,
          },
        ],
      },
    });

    const released = outcome.releasedJobIds.map((jobId) => store.jobs.get(jobId)!);
    expect(released.map((job) => job.type)).toEqual([
      "draft",
      "divem_review",
      "prepare_edit",
      "await_review",
    ]);
    expect(outcome.learned).toHaveLength(1);
    expect(styleStore.items[0]).toMatchObject({
      dimension: "pacing",
      signal: "specific_feedback",
    });
  });

  it("rejection closes the review without publishing", async () => {
    const store = new JobStore();
    store.jobs.set("review-1", waitingReviewJob());

    const outcome = await applyMediaReview({
      candidate,
      reviewJobId: "review-1",
      decision: "reject",
      feedback: [],
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      jobStore: store,
      createJobId: () => "unused",
      now: () => "2026-09-29T11:00:00.000Z",
    });

    expect(outcome.releasedJobIds).toEqual([]);
    expect(store.jobs.get("review-1")?.state).toBe("completed");
    expect([...store.jobs.values()].some((job) => job.type === "publish")).toBe(false);
  });
});
