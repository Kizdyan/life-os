import { describe, expect, it } from "vitest";
import { buildCanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import { createContentItemV2, type CanonicalContentItemV2 } from "./content-format-v2";
import {
  claimMediaExecutionJobV2,
  createMediaExecutionJobV2,
  startExecutionAttemptV2,
  submitRenderedAssetV2,
  type MediaExecutionJobV2,
} from "./media-execution-job-v2";
import { createDeterministicAlternateExecutorV2, type MediaExecutorV2 } from "./media-executor-v2";
import { orchestrateMediaExecutionV2 } from "./media-execution-orchestrator-v2";
import type { ExecutorCapabilitiesV2 } from "./media-execution-router-v2";

const SOURCE_HASH = "a".repeat(64);

function fixture(deadline = "2026-10-13T11:00:00.000Z") {
  const contentItem = createContentItemV2({
    contentItemId: "content-1", revision: 1, plannedSourceKinds: ["video"],
    sourceAssets: [{ mediaAssetId: "asset-1", kind: "video", contentHash: SOURCE_HASH, bytes: 2_000_000,
      mimeType: "video/mp4", width: 1080, height: 1920, rotationDegrees: 0, videoCodec: "h264",
      durationMs: 20_000, sampleAspectRatio: { numerator: 1, denominator: 1 } }],
    targetPlatforms: ["instagram"], approvedIdea: { ideaId: "idea-1", version: 1 }, shootingSessionId: "shoot-1",
    publicationObjective: "Publish", scheduledPublicationTime: "2026-10-13T12:00:00.000Z", priority: "normal", deadline,
    compositionIntent: { preserveSourceComposition: true }, audioIntent: { normalizeSpeech: true },
    subtitleIntent: { enabled: true, language: "ru" }, captionCopyId: null, publicationStatus: "captured",
  });
  const plan = buildCanonicalMediaPlanV2(contentItem, { timelineVersion: 1 });
  const job = createMediaExecutionJobV2({
    jobId: "media-job-1", executionId: "execution-1", lineage: plan.lineage, createdAt: "2026-10-12T12:00:00.000Z",
    deadline: { escalationAt: "2026-10-13T06:00:00.000Z", readyRequiredAt: "2026-10-13T11:00:00.000Z", publishAt: "2026-10-13T12:00:00.000Z" },
    fallbackPolicy: { maxAttempts: 3, allowPaidFallback: true, approvedFallbackAssetIds: [] },
  });
  return { contentItem, plan, job };
}

function capabilities(executorId: string, overrides: Partial<ExecutorCapabilitiesV2> = {}): ExecutorCapabilitiesV2 {
  return {
    executorId, executorKind: "desktop", supportedPublicationTypes: ["reel"], inputDecodeCodecs: ["h264"],
    outputEncodeCodecs: ["h264"], maxAssetBytes: 3_000_000_000, maxAggregateBytes: 3_000_000_000,
    maxWidth: 4096, maxHeight: 4096, compositionModes: ["crop", "contain_background"], encodeGenerations: 1,
    semanticFeatures: ["video_timeline", "subtitles", "audio_normalization"], availability: "available",
    observedAt: "2026-10-12T12:00:30.000Z", heartbeatAt: "2026-10-12T12:00:30.000Z",
    expiresAt: "2026-10-13T12:00:00.000Z", expectedCompletionTimeMs: 30_000, estimatedCostCents: 0,
    costClass: "owned", qualityTier: 3, ...overrides,
  };
}

function executor(executorId: string, overrides: Partial<ExecutorCapabilitiesV2> = {}, corruption?: "decode" | "codec" | "lineage"): MediaExecutorV2 {
  return createDeterministicAlternateExecutorV2({ capabilities: capabilities(executorId, overrides), resultHash: "f".repeat(64), corruption });
}

function deterministicClock(start = Date.parse("2026-10-12T12:01:00.000Z")) {
  let current = start;
  return () => new Date(current++ * 1).toISOString();
}

async function run(input: { job?: MediaExecutionJobV2; contentItem?: CanonicalContentItemV2; executors: MediaExecutorV2[]; now?: () => string; paidBudgetCents?: number }) {
  const base = fixture();
  return orchestrateMediaExecutionV2({
    job: input.job ?? base.job,
    contentItem: input.contentItem ?? base.contentItem,
    plan: base.plan,
    executors: input.executors,
    now: input.now ?? deterministicClock(),
    leaseDurationMs: 60_000,
    leaseId: (attempt, executorId) => `lease-${attempt}-${executorId}`,
    paidBudgetCents: input.paidBudgetCents,
  });
}

describe("Media Execution Router V2 autonomous orchestration", () => {
  it("routes around an unavailable Desktop at job creation", async () => {
    const result = await run({ executors: [
      executor("desktop", { availability: "offline" }),
      executor("alternate", { executorKind: "cloud", costClass: "free_tier" }),
    ] });

    expect(result.status).toBe("READY");
    expect(result.job.readyMaster?.executorId).toBe("alternate");
    expect(result.job.attempts).toHaveLength(1);
  });

  it.each(["iphone", "cloud"] as const)("routes around an unavailable %s executor", async (kind) => {
    const result = await run({ executors: [
      executor(`${kind}-offline`, { executorKind: kind, availability: "offline" }),
      executor("owned-ready"),
    ] });
    expect(result.status).toBe("READY");
    expect(result.job.readyMaster?.executorId).toBe("owned-ready");
  });

  it("fails over when the selected Desktop rejects its claim", async () => {
    const desktop = executor("desktop");
    desktop.claim = async () => ({ accepted: false });
    const result = await run({ executors: [desktop, executor("alternate", { executorKind: "cloud", costClass: "free_tier" })] });

    expect(result.status).toBe("READY");
    expect(result.job.attempts.map((attempt) => attempt.executorId)).toEqual(["desktop", "alternate"]);
    expect(result.job.attempts[0]).toMatchObject({ status: "FAILED", failureCode: "claim_rejected" });
  });

  it("rejects invalid output and falls over once to another executor", async () => {
    const result = await run({ executors: [
      executor("bad", {}, "decode"),
      executor("good", { executorKind: "cloud", costClass: "free_tier", qualityTier: 2 }),
    ] });

    expect(result.status).toBe("READY");
    expect(result.job.attempts[0].failureCode).toBe("output_invalid");
    expect(result.job.readyMaster?.executorId).toBe("good");
  });

  it("recovers an expired in-flight lease after restart and uses a newer attempt", async () => {
    const base = fixture();
    const claimed = claimMediaExecutionJobV2(base.job, { executorId: "desktop", executorKind: "desktop", leaseId: "old-lease", now: "2026-10-12T12:01:00.000Z", leaseDurationMs: 60_000 });
    const processing = startExecutionAttemptV2(claimed, { attemptNumber: 1, leaseId: "old-lease", now: "2026-10-12T12:01:01.000Z" });
    const now = deterministicClock(Date.parse("2026-10-12T12:02:01.000Z"));
    const result = await run({ job: JSON.parse(JSON.stringify(processing)), executors: [executor("alternate", { executorKind: "cloud", costClass: "free_tier" })], now });

    expect(result.status).toBe("READY");
    expect(result.job.attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
    expect(result.job.attempts[0].failureCode).toBe("lease_expired_after_restart");
  });

  it("fences a late stale result after a newer attempt owns the job", async () => {
    const base = fixture();
    const staleExecutor = executor("desktop");
    const claimed = claimMediaExecutionJobV2(base.job, { executorId: "desktop", executorKind: "desktop", leaseId: "old-lease", now: "2026-10-12T12:01:00.000Z", leaseDurationMs: 60_000 });
    const processing = startExecutionAttemptV2(claimed, { attemptNumber: 1, leaseId: "old-lease", now: "2026-10-12T12:01:01.000Z" });
    await staleExecutor.claim({ jobId: base.job.jobId, executionId: base.job.executionId, attemptNumber: 1, leaseId: "old-lease", contentItem: base.contentItem, plan: base.plan });
    const staleResult = await staleExecutor.execute({ jobId: base.job.jobId, executionId: base.job.executionId, attemptNumber: 1, leaseId: "old-lease", contentItem: base.contentItem, plan: base.plan });
    const result = await run({ job: JSON.parse(JSON.stringify(processing)), executors: [executor("alternate", { executorKind: "cloud", costClass: "free_tier" })], now: deterministicClock(Date.parse("2026-10-12T12:02:01.000Z")) });

    expect(() => submitRenderedAssetV2(result.job, { attemptNumber: 1, leaseId: "old-lease", now: "2026-10-12T12:03:00.000Z", asset: staleResult.asset })).toThrow(/stale attempt/i);
    expect(result.job.readyMaster?.executorId).toBe("alternate");
  });

  it("keeps FREE_ONLY before escalation and allows bounded paid fallback after escalation", async () => {
    const before = await run({ executors: [
      executor("paid", { executorKind: "cloud", costClass: "paid", estimatedCostCents: 10, qualityTier: 5 }),
      executor("owned"),
    ], paidBudgetCents: 20 });
    expect(before.job.readyMaster?.executorId).toBe("owned");

    const afterClock = deterministicClock(Date.parse("2026-10-13T06:30:00.000Z"));
    const after = await run({ executors: [
      executor("desktop", { availability: "offline", observedAt: "2026-10-13T06:29:00.000Z", heartbeatAt: "2026-10-13T06:29:00.000Z", expiresAt: "2026-10-13T12:00:00.000Z" }),
      executor("paid", { executorKind: "cloud", costClass: "paid", estimatedCostCents: 10, observedAt: "2026-10-13T06:29:00.000Z", heartbeatAt: "2026-10-13T06:29:00.000Z", expiresAt: "2026-10-13T12:00:00.000Z" }),
    ], now: afterClock, paidBudgetCents: 20 });
    expect(after.status).toBe("READY");
    expect(after.job.readyMaster?.executorId).toBe("paid");
  });

  it("returns a typed no-executor result without inventing an output", async () => {
    const result = await run({ executors: [executor("offline", { availability: "offline" })] });
    expect(result.status).toBe("NO_EXECUTOR");
    expect(result.job.state).toBe("QUEUED");
    expect(result.job.readyMaster).toBeNull();
  });

  it("bounds repeated failures and never loops beyond maxAttempts", async () => {
    const first = executor("first"); first.claim = async () => ({ accepted: false });
    const second = executor("second", { qualityTier: 2 }); second.claim = async () => ({ accepted: false });
    const third = executor("third", { qualityTier: 1 }); third.claim = async () => ({ accepted: false });
    const result = await run({ executors: [first, second, third] });

    expect(result.status).toBe("ATTEMPTS_EXHAUSTED");
    expect(result.job.state).toBe("FAILED");
    expect(result.job.attempts).toHaveLength(3);
  });
});
