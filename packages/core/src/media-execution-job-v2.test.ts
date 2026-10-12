import { describe, expect, it } from "vitest";
import {
  claimMediaExecutionJobV2,
  createMediaExecutionJobV2,
  expireExecutionLeaseV2,
  heartbeatExecutionAttemptV2,
  promoteValidatedMasterV2,
  recoverMediaExecutionJobV2,
  retryMediaExecutionJobV2,
  startExecutionAttemptV2,
  submitRenderedAssetV2,
  type MediaExecutionJobV2,
} from "./media-execution-job-v2";
import type { MediaPlanLineageV2 } from "./canonical-media-timeline-v2";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const lineage: MediaPlanLineageV2 = {
  contentItemId: "content-1",
  contentRevision: 2,
  contentRevisionHash: HASH_A,
  targetPublicationType: "reel",
  approvedIdeaId: "idea-1",
  approvedIdeaVersion: 3,
  sourceAssets: [{ mediaAssetId: "asset-1", contentHash: HASH_B }],
  timelineVersion: 1,
  timelineHash: HASH_B,
  qaPolicyVersion: "media-v2.1",
};

function job(): MediaExecutionJobV2 {
  return createMediaExecutionJobV2({
    jobId: "media-job-1",
    lineage,
    outputProfile: { codec: "h264", platformSafeAreaProfile: "short-video-v1" },
    createdAt: "2026-10-12T12:00:00.000Z",
    deadline: {
      publishAt: "2026-10-13T12:00:00.000Z",
      escalationAt: "2026-10-13T06:00:00.000Z",
      readyRequiredAt: "2026-10-13T11:00:00.000Z",
    },
    fallbackPolicy: {
      maxAttempts: 3,
      allowPaidFallback: false,
      approvedFallbackAssetIds: [],
    },
  });
}

function claim(current = job(), attemptNow = "2026-10-12T12:01:00.000Z") {
  return claimMediaExecutionJobV2(current, {
    executorId: "desktop-1",
    executorKind: "desktop",
    leaseId: "lease-1",
    now: attemptNow,
    leaseDurationMs: 60_000,
  });
}

describe("MediaExecutionJob V2 durable lease state machine", () => {
  it("keeps one logical job identity while attempts increase monotonically", () => {
    const first = claim();
    const expired = expireExecutionLeaseV2(first, "2026-10-12T12:02:01.000Z", "heartbeat_lost");
    const queued = retryMediaExecutionJobV2(expired, "2026-10-12T12:02:02.000Z");
    const second = claimMediaExecutionJobV2(queued, {
      executorId: "alternate-1",
      executorKind: "cloud",
      leaseId: "lease-2",
      now: "2026-10-12T12:02:03.000Z",
      leaseDurationMs: 60_000,
    });

    expect(second.jobId).toBe("media-job-1");
    expect(second.executionId).toBe(job().executionId);
    expect(second.attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
    expect(second.currentAttemptNumber).toBe(2);
  });

  it("allows one active lease and extends only the matching owner heartbeat", () => {
    const claimed = claim();
    expect(() => claimMediaExecutionJobV2(claimed, {
      executorId: "alternate-1",
      executorKind: "cloud",
      leaseId: "lease-2",
      now: "2026-10-12T12:01:10.000Z",
      leaseDurationMs: 60_000,
    })).toThrow(/active lease/i);

    expect(() => heartbeatExecutionAttemptV2(claimed, {
      attemptNumber: 1,
      leaseId: "wrong-lease",
      now: "2026-10-12T12:01:20.000Z",
      leaseDurationMs: 60_000,
    })).toThrow(/ownership/i);

    const renewed = heartbeatExecutionAttemptV2(claimed, {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:20.000Z",
      leaseDurationMs: 60_000,
    });
    expect(renewed.attempts[0].lease.expiresAt).toBe("2026-10-12T12:02:20.000Z");
  });

  it("expires a missing heartbeat into a recoverable state without changing identity", () => {
    const claimed = claim();
    expect(() => expireExecutionLeaseV2(claimed, "2026-10-12T12:01:59.000Z", "heartbeat_lost")).toThrow(/not expired/i);
    const expired = expireExecutionLeaseV2(claimed, "2026-10-12T12:02:01.000Z", "heartbeat_lost");

    expect(expired.state).toBe("RETRYABLE_FAILED");
    expect(expired.jobId).toBe(claimed.jobId);
    expect(expired.attempts[0]).toMatchObject({ status: "FAILED", failureCode: "heartbeat_lost" });
  });

  it("fences a stale attempt result after failover", () => {
    const first = startExecutionAttemptV2(claim(), {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:01.000Z",
    });
    const expired = expireExecutionLeaseV2(first, "2026-10-12T12:02:01.000Z", "heartbeat_lost");
    const queued = retryMediaExecutionJobV2(expired, "2026-10-12T12:02:02.000Z");
    const second = claimMediaExecutionJobV2(queued, {
      executorId: "alternate-1",
      executorKind: "cloud",
      leaseId: "lease-2",
      now: "2026-10-12T12:02:03.000Z",
      leaseDurationMs: 60_000,
    });

    expect(() => submitRenderedAssetV2(second, {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:02:04.000Z",
      asset: {
        renderedAssetId: "result-stale",
        resultHash: HASH_A,
        bytes: 10_000,
        codec: "h264",
        width: 1080,
        height: 1920,
        durationMs: 20_000,
        fullDecodePassed: true, encodeGenerations: 1,
        lineage,
      },
    })).toThrow(/stale attempt/i);
  });

  it("promotes one validated master and makes identical completion idempotent", () => {
    const processing = startExecutionAttemptV2(claim(), {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:01.000Z",
    });
    const validating = submitRenderedAssetV2(processing, {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:20.000Z",
      asset: {
        renderedAssetId: "result-1",
        resultHash: HASH_A,
        bytes: 10_000,
        codec: "h264",
        width: 1080,
        height: 1920,
        durationMs: 20_000,
        fullDecodePassed: true, encodeGenerations: 1,
        lineage,
      },
    });
    const ready = promoteValidatedMasterV2(validating, {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:21.000Z",
      quality: { status: "QUALITY_PASS", reasons: [], checkedAt: "2026-10-12T12:01:21.000Z" },
    });
    const duplicate = promoteValidatedMasterV2(ready, {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:22.000Z",
      quality: { status: "QUALITY_PASS", reasons: [], checkedAt: "2026-10-12T12:01:21.000Z" },
    });

    expect(duplicate).toEqual(ready);
    expect(ready.state).toBe("READY");
    expect(ready.readyMaster?.resultHash).toBe(HASH_A);
    expect(() => promoteValidatedMasterV2(ready, {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:23.000Z",
      quality: { status: "OUTPUT_INVALID", reasons: ["corrupt"], checkedAt: "2026-10-12T12:01:23.000Z" },
    })).toThrow(/conflicting completion/i);
  });

  it("recovers an expired serialized snapshot after orchestrator restart", () => {
    const snapshot = JSON.parse(JSON.stringify(startExecutionAttemptV2(claim(), {
      attemptNumber: 1,
      leaseId: "lease-1",
      now: "2026-10-12T12:01:01.000Z",
    })));

    const recovered = recoverMediaExecutionJobV2(snapshot, "2026-10-12T12:02:01.000Z");
    expect(recovered.state).toBe("RETRYABLE_FAILED");
    expect(recovered.attempts[0].failureCode).toBe("lease_expired_after_restart");
    expect(recovered.executionId).toBe(job().executionId);
  });

  it("rejects promotion when the lease expires during validation", () => {
    const claimed = claimMediaExecutionJobV2(job(), { executorId: "desktop-1", executorKind: "desktop", leaseId: "lease-short", now: "2026-10-12T12:01:00.000Z", leaseDurationMs: 1_000 });
    const processing = startExecutionAttemptV2(claimed, { attemptNumber: 1, leaseId: "lease-short", now: "2026-10-12T12:01:00.100Z" });
    const validating = submitRenderedAssetV2(processing, { attemptNumber: 1, leaseId: "lease-short", now: "2026-10-12T12:01:00.900Z", asset: {
      renderedAssetId: "result-1", resultHash: HASH_A, bytes: 10_000, codec: "h264", width: 1080, height: 1920,
      durationMs: 20_000, fullDecodePassed: true, encodeGenerations: 1, lineage,
    } });

    expect(() => promoteValidatedMasterV2(validating, { attemptNumber: 1, leaseId: "lease-short", now: "2026-10-12T12:01:01.100Z", quality: {
      status: "QUALITY_PASS", reasons: [], checkedAt: "2026-10-12T12:01:01.050Z",
    } })).toThrow(/lease expired/i);
  });

  it("rejects non-causal QA timestamps", () => {
    const processing = startExecutionAttemptV2(claim(), { attemptNumber: 1, leaseId: "lease-1", now: "2026-10-12T12:01:01.000Z" });
    const validating = submitRenderedAssetV2(processing, { attemptNumber: 1, leaseId: "lease-1", now: "2026-10-12T12:01:20.000Z", asset: {
      renderedAssetId: "result-1", resultHash: HASH_A, bytes: 10_000, codec: "h264", width: 1080, height: 1920,
      durationMs: 20_000, fullDecodePassed: true, encodeGenerations: 1, lineage,
    } });
    expect(() => promoteValidatedMasterV2(validating, { attemptNumber: 1, leaseId: "lease-1", now: "2026-10-12T12:01:21.000Z", quality: {
      status: "QUALITY_PASS", reasons: [], checkedAt: "2026-10-12T12:01:10.000Z",
    } })).toThrow(/quality timestamp/i);
  });

  it("fails closed when a restored READY snapshot violates master invariants", () => {
    const forged = { ...job(), state: "READY", readyMaster: null };
    expect(() => recoverMediaExecutionJobV2(forged, "2026-10-12T12:01:00.000Z")).toThrow(/snapshot|invariant/i);
  });

  it("makes final-attempt lease expiry terminal in one transition", () => {
    const oneAttempt = createMediaExecutionJobV2({
      jobId: "media-job-final", lineage, outputProfile: { codec: "h264", platformSafeAreaProfile: "short-video-v1" }, createdAt: "2026-10-12T12:00:00.000Z",
      deadline: { publishAt: "2026-10-13T12:00:00.000Z", escalationAt: "2026-10-13T06:00:00.000Z", readyRequiredAt: "2026-10-13T11:00:00.000Z" },
      fallbackPolicy: { maxAttempts: 1, allowPaidFallback: false, approvedFallbackAssetIds: [] },
    });
    const claimed = claimMediaExecutionJobV2(oneAttempt, { executorId: "desktop-1", executorKind: "desktop", leaseId: "lease-final", now: "2026-10-12T12:01:00.000Z", leaseDurationMs: 1_000 });
    const expired = expireExecutionLeaseV2(claimed, "2026-10-12T12:01:01.000Z", "heartbeat_lost");
    expect(expired.state).toBe("FAILED");
    expect(expired.currentAttemptNumber).toBeNull();
  });

  it("never extends a heartbeat lease beyond the hard ready deadline", () => {
    const nearDeadline = claimMediaExecutionJobV2(job(), {
      executorId: "desktop-1", executorKind: "desktop", leaseId: "lease-deadline",
      now: "2026-10-13T10:59:00.000Z", leaseDurationMs: 300_000,
    });
    const renewed = heartbeatExecutionAttemptV2(nearDeadline, {
      attemptNumber: 1, leaseId: "lease-deadline", now: "2026-10-13T10:59:30.000Z", leaseDurationMs: 300_000,
    });
    expect(renewed.attempts[0].lease.expiresAt).toBe("2026-10-13T11:00:00.000Z");
  });
});
