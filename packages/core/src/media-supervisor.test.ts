import { describe, expect, it } from "vitest";
import { MediaSupervisor } from "./media-supervisor";
import type { MediaJob } from "./media-jobs";

describe("MediaSupervisor", () => {
  it("bootstraps storage through the orchestrator", async () => {
    let bootstrapCalls = 0;
    const supervisor = new MediaSupervisor({
      orchestrator: {
        bootstrap: async () => {
          bootstrapCalls += 1;
        },
        tick: async () => ({
          importedAssetIds: [],
          importedReferenceIds: [],
          existingAssetIds: [],
          existingReferenceIds: [],
          enqueuedJobIds: [],
        }),
      } as any,
      worker: { runOnce: async () => [] } as any,
    });

    await supervisor.bootstrap();
    expect(bootstrapCalls).toBe(1);
  });

  it("runs ingestion then drains runnable jobs until idle", async () => {
    const calls: string[] = [];
    let pass = 0;
    const fakeJob = (id: string): MediaJob => ({
      id,
      type: "analyze",
      assetId: "asset-1",
      projectId: null,
      state: "completed",
      dependsOnJobId: null,
      attempts: 0,
      maxAttempts: 4,
      notBefore: null,
      lastError: null,
      createdAt: "2026-09-29T10:00:00.000Z",
      updatedAt: "2026-09-29T10:00:00.000Z",
    });

    const supervisor = new MediaSupervisor({
      orchestrator: {
        bootstrap: async () => undefined,
        tick: async () => {
          calls.push("tick");
          return {
            importedAssetIds: ["asset-1"],
            importedReferenceIds: [],
            existingAssetIds: [],
            existingReferenceIds: [],
            enqueuedJobIds: ["job-1", "job-2"],
          };
        },
      } as any,
      worker: {
        runOnce: async () => {
          pass += 1;
          calls.push(`worker-${pass}`);
          if (pass === 1) return [fakeJob("job-1")];
          if (pass === 2) return [fakeJob("job-2")];
          return [];
        },
      } as any,
    });

    const result = await supervisor.runCycle();

    expect(calls).toEqual(["tick", "worker-1", "worker-2", "worker-3"]);
    expect(result.processed.map((job) => job.id)).toEqual(["job-1", "job-2"]);
    expect(result.stoppedBecause).toBe("idle");
  });

  it("is bounded even if work never becomes idle", async () => {
    let counter = 0;
    const supervisor = new MediaSupervisor({
      orchestrator: {
        bootstrap: async () => undefined,
        tick: async () => ({
          importedAssetIds: [],
          importedReferenceIds: [],
          existingAssetIds: [],
          existingReferenceIds: [],
          enqueuedJobIds: [],
        }),
      } as any,
      worker: {
        runOnce: async () => [
          {
            id: `job-${++counter}`,
            type: "analyze",
            assetId: null,
            projectId: null,
            state: "completed",
            dependsOnJobId: null,
            attempts: 0,
            maxAttempts: 4,
            notBefore: null,
            lastError: null,
            createdAt: "2026-09-29T10:00:00.000Z",
            updatedAt: "2026-09-29T10:00:00.000Z",
          } satisfies MediaJob,
        ],
      } as any,
      maxPasses: 3,
    });

    const result = await supervisor.runCycle();

    expect(result.passes).toBe(3);
    expect(result.processed).toHaveLength(3);
    expect(result.stoppedBecause).toBe("max_passes");
  });
});
