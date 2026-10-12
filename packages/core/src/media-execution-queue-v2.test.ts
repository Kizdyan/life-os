import { describe, expect, it } from "vitest";
import type { MediaPlanLineageV2 } from "./canonical-media-timeline-v2";
import { claimMediaExecutionJobV2, createMediaExecutionJobV2 } from "./media-execution-job-v2";
import { createInMemoryMediaExecutionQueueV2 } from "./media-execution-queue-v2";

const lineage: MediaPlanLineageV2 = {
  contentItemId: "content-1", contentRevision: 1, contentRevisionHash: "a".repeat(64), targetPublicationType: "reel",
  approvedIdeaId: "idea-1", approvedIdeaVersion: 1, sourceAssets: [{ mediaAssetId: "asset-1", contentHash: "b".repeat(64) }],
  timelineVersion: 1, timelineHash: "c".repeat(64), qaPolicyVersion: "media-v2.1",
};

function queued() {
  return createMediaExecutionJobV2({
    jobId: "job-1", executionId: "execution-1", lineage, createdAt: "2026-10-12T12:00:00.000Z",
    deadline: { escalationAt: "2026-10-13T06:00:00.000Z", readyRequiredAt: "2026-10-13T11:00:00.000Z", publishAt: "2026-10-13T12:00:00.000Z" },
    fallbackPolicy: { maxAttempts: 3, allowPaidFallback: false, approvedFallbackAssetIds: [] },
  });
}

describe("Media Execution V2 durable queue semantics", () => {
  it("atomically accepts only one executor claim from the same job version", async () => {
    const initial = queued();
    const queue = createInMemoryMediaExecutionQueueV2([initial]);
    const desktop = claimMediaExecutionJobV2(initial, { executorId: "desktop", executorKind: "desktop", leaseId: "desktop-lease", now: "2026-10-12T12:01:00.000Z", leaseDurationMs: 60_000 });
    const cloud = claimMediaExecutionJobV2(initial, { executorId: "cloud", executorKind: "cloud", leaseId: "cloud-lease", now: "2026-10-12T12:01:00.000Z", leaseDurationMs: 60_000 });

    const results = await Promise.all([
      queue.compareAndSwap(initial.jobId, initial.version, desktop),
      queue.compareAndSwap(initial.jobId, initial.version, cloud),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await queue.read(initial.jobId))?.version).toBe(initial.version + 1);
    expect(["desktop", "cloud"]).toContain((await queue.read(initial.jobId))?.attempts[0].executorId);
  });

  it("prevents duplicate logical enqueue and returns detached immutable snapshots", async () => {
    const initial = queued();
    const queue = createInMemoryMediaExecutionQueueV2();
    await expect(queue.enqueue(initial)).resolves.toBe(true);
    await expect(queue.enqueue(initial)).resolves.toBe(false);
    const restored = await queue.read(initial.jobId);
    expect(restored).toEqual(initial);
    expect(restored).not.toBe(initial);
    expect(Object.isFrozen(restored)).toBe(true);
  });

  it("rejects stale compare-and-swap updates after a newer transition wins", async () => {
    const initial = queued();
    const queue = createInMemoryMediaExecutionQueueV2([initial]);
    const winner = claimMediaExecutionJobV2(initial, { executorId: "desktop", executorKind: "desktop", leaseId: "lease-1", now: "2026-10-12T12:01:00.000Z", leaseDurationMs: 60_000 });
    expect(await queue.compareAndSwap(initial.jobId, initial.version, winner)).toBe(true);

    const stale = claimMediaExecutionJobV2(initial, { executorId: "cloud", executorKind: "cloud", leaseId: "lease-2", now: "2026-10-12T12:01:01.000Z", leaseDurationMs: 60_000 });
    expect(await queue.compareAndSwap(initial.jobId, initial.version, stale)).toBe(false);
    expect((await queue.read(initial.jobId))?.attempts[0].executorId).toBe("desktop");
  });
});
