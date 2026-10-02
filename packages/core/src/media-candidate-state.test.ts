import { describe, expect, it } from "vitest";
import { buildCapCutWorkPackage } from "./capcut-work-package";
import type { KeyValueStore } from "./media-state-store";
import { MediaStateStore } from "./media-state-store";
import type { MediaCandidateRecord } from "./media-candidate-store";

class MemoryKv implements KeyValueStore {
  values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function record(id: string, createdAt: string): MediaCandidateRecord {
  return {
    candidate: {
      id,
      projectId: "project-1",
      assetIds: ["asset-1"],
      title: "Backstage",
      caption: null,
      createdAt,
      workPackage: buildCapCutWorkPackage({
        projectId: "project-1",
        channel: "instagram",
        aspectRatio: "9:16",
        targetDurationMs: 15_000,
        hook: "Репетиция изнутри",
        clips: [
          {
            assetId: "asset-1",
            sourceStartMs: 0,
            sourceEndMs: 1500,
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
    },
    assessment: null,
    observerNotes: [],
    readyForReview: false,
    editorBundlePaths: [],
    externalId: null,
    updatedAt: createdAt,
  };
}

describe("durable Media Brain candidate state", () => {
  it("persists a candidate and resolves the latest candidate for its project", async () => {
    const kv = new MemoryKv();
    const store = new MediaStateStore({
      kv,
      now: () => "2026-10-02T13:00:00.000Z",
    });

    const first = record("candidate-1", "2026-10-02T12:00:00.000Z");
    await store.saveCandidate(first);

    await expect(store.getCandidateRecord("candidate-1")).resolves.toEqual(first);
    await expect(store.getLatestCandidateForProject("project-1")).resolves.toEqual(first);
  });

  it("keeps prior revisions addressable while moving the project pointer forward", async () => {
    const kv = new MemoryKv();
    const store = new MediaStateStore({
      kv,
      now: () => "2026-10-02T13:00:00.000Z",
    });

    const first = record("candidate-1", "2026-10-02T12:00:00.000Z");
    const second = record("candidate-2", "2026-10-02T12:10:00.000Z");
    second.assessment = {
      fit: "strong",
      notes: ["hook improved"],
      weakTransition: null,
      revisionSuggestions: [],
      confidence: 0.9,
      evidenceState: "sufficient",
    };
    second.readyForReview = true;
    second.editorBundlePaths = ["/Projects/project-1/candidate-2/edit-plan.json"];

    await store.saveCandidate(first);
    await store.saveCandidate(second);

    await expect(store.getCandidateRecord("candidate-1")).resolves.toEqual(first);
    await expect(store.getLatestCandidateForProject("project-1")).resolves.toEqual(second);
  });

  it("survives a new MediaStateStore instance over the same durable KV", async () => {
    const kv = new MemoryKv();
    const firstStore = new MediaStateStore({
      kv,
      now: () => "2026-10-02T13:00:00.000Z",
    });
    const value = record("candidate-1", "2026-10-02T12:00:00.000Z");
    await firstStore.saveCandidate(value);

    const restartedStore = new MediaStateStore({
      kv,
      now: () => "2026-10-02T13:05:00.000Z",
    });

    await expect(restartedStore.getLatestCandidateForProject("project-1")).resolves.toEqual(value);
  });

  it("reads old v1 snapshots that predate candidate persistence", async () => {
    const kv = new MemoryKv();
    kv.values.set(
      "lifeos:media-brain:v1",
      JSON.stringify({
        schemaVersion: 1,
        revision: 2,
        assetsByIngestKey: {},
        jobsById: {},
        projectsByKey: {},
        styleObservations: [],
        audienceSignals: [],
        updatedAt: "2026-10-02T12:00:00.000Z",
      }),
    );
    const store = new MediaStateStore({
      kv,
      now: () => "2026-10-02T13:00:00.000Z",
    });

    await expect(store.getCandidateRecord("missing")).resolves.toBeNull();
    await expect(store.getLatestCandidateForProject("project-1")).resolves.toBeNull();
  });
});
