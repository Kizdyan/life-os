import { describe, expect, it } from "vitest";
import { MediaStateStore, type KeyValueStore } from "./media-state-store";
import type { MediaAsset, MediaProject, StyleMemoryObservation } from "./media-brain";
import type { MediaJob } from "./media-jobs";
import type { AudiencePerformanceSignal } from "./media-analytics";

class MemoryKv implements KeyValueStore {
  values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function asset(): MediaAsset {
  return {
    id: "asset-1",
    provider: "yandex",
    providerId: "remote-1",
    providerPath: "/Media/Inbox/a.mov",
    contentHash: "hash",
    mimeType: "video/quicktime",
    source: "own_raw",
    section: "inbox",
    status: "ingested",
    projectId: null,
    createdAt: null,
    importedAt: "2026-09-29T10:00:00.000Z",
    provenance: {
      originalProviderPath: "/Media/Inbox/a.mov",
      originalProviderId: "remote-1",
      destructiveMoveVerified: false,
    },
  };
}

function job(id: string, state: MediaJob["state"], createdAt: string): MediaJob {
  return {
    id,
    type: "analyze",
    assetId: "asset-1",
    projectId: null,
    state,
    dependsOnJobId: null,
    attempts: 0,
    maxAttempts: 4,
    notBefore: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("MediaStateStore", () => {
  it("persists assets, jobs and projects in one versioned snapshot", async () => {
    const kv = new MemoryKv();
    const store = new MediaStateStore({
      kv,
      now: () => "2026-09-29T12:00:00.000Z",
    });

    await store.save(asset(), "yandex:/Media/Inbox/a.mov:hash");
    await store.enqueue(job("job-1", "queued", "2026-09-29T10:00:00.000Z"));

    const project: MediaProject = {
      id: "project-1",
      title: "Backstage",
      status: "in_project",
      assetIds: ["asset-1"],
      channelTargets: ["instagram"],
      approvalRequired: true,
      createdAt: "2026-09-29T10:00:00.000Z",
      updatedAt: "2026-09-29T10:00:00.000Z",
    };
    await store.save(project, "life-item:rehearsal");

    const snapshot = await store.snapshot();

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.revision).toBe(3);
    expect(snapshot.assetsByIngestKey["yandex:/Media/Inbox/a.mov:hash"].id).toBe("asset-1");
    expect(snapshot.jobsById["job-1"].state).toBe("queued");
    expect(snapshot.projectsByKey["life-item:rehearsal"].id).toBe("project-1");
  });

  it("returns only runnable jobs in deterministic order", async () => {
    const store = new MediaStateStore({
      kv: new MemoryKv(),
      now: () => "2026-09-29T12:00:00.000Z",
    });

    await store.enqueue(job("b", "queued", "2026-09-29T10:00:00.000Z"));
    await store.enqueue(job("a", "failed", "2026-09-29T09:00:00.000Z"));
    await store.enqueue(job("c", "completed", "2026-09-29T08:00:00.000Z"));

    const runnable = await store.listRunnable(
      "2026-09-29T12:00:00.000Z",
      10,
    );

    expect(runnable.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps Style Memory and audience-response analytics separate", async () => {
    const store = new MediaStateStore({
      kv: new MemoryKv(),
      now: () => "2026-09-29T12:00:00.000Z",
    });

    const style: StyleMemoryObservation = {
      assetId: "asset-1",
      dimension: "editing",
      value: "чистые склейки",
      signal: "specific_feedback",
      weight: 0.82,
      createdAt: "2026-09-29T11:00:00.000Z",
    };

    const audience: AudiencePerformanceSignal = {
      candidateId: "candidate-1",
      measuredAt: "2026-09-29T11:30:00.000Z",
      rates: {
        likeRate: 0.1,
        commentRate: 0.02,
        saveRate: 0.05,
        shareRate: 0.03,
        profileVisitRate: 0.04,
        followRate: 0.01,
        inquiryRate: 0.002,
        completionRate: 0.5,
      },
      raw: {
        candidateId: "candidate-1",
        externalId: "post-1",
        channel: "instagram",
        measuredAt: "2026-09-29T11:30:00.000Z",
        impressions: 1000,
        views: 800,
        reach: 900,
        watchTimeSeconds: 4000,
        averageWatchSeconds: 5,
        completionRate: 0.5,
        likes: 90,
        comments: 18,
        saves: 45,
        shares: 27,
        profileVisits: 36,
        follows: 9,
        inquiries: 2,
      },
    };

    await store.append(style);
    await store.append(audience);

    expect(await store.listByDimension("editing")).toEqual([style]);
    expect(await store.listByCandidate("candidate-1")).toEqual([audience]);
  });

  it("rejects duplicate job ids instead of silently overwriting audit history", async () => {
    const store = new MediaStateStore({
      kv: new MemoryKv(),
      now: () => "2026-09-29T12:00:00.000Z",
    });

    const first = job("job-1", "queued", "2026-09-29T10:00:00.000Z");
    await store.enqueue(first);

    await expect(store.enqueue(first)).rejects.toThrow("already exists");
  });

  it("serializes concurrent updates through the store queue", async () => {
    const store = new MediaStateStore({
      kv: new MemoryKv(),
      now: () => "2026-09-29T12:00:00.000Z",
    });

    await Promise.all([
      store.enqueue(job("job-1", "queued", "2026-09-29T10:00:00.000Z")),
      store.enqueue(job("job-2", "queued", "2026-09-29T10:01:00.000Z")),
      store.save(asset(), "asset-key"),
    ]);

    const snapshot = await store.snapshot();
    expect(Object.keys(snapshot.jobsById)).toHaveLength(2);
    expect(Object.keys(snapshot.assetsByIngestKey)).toHaveLength(1);
    expect(snapshot.revision).toBe(3);
  });
});
