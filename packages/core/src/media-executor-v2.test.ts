import { describe, expect, it } from "vitest";
import { buildCanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import { createContentItemV2, type AssetDescriptorV2 } from "./content-format-v2";
import {
  createDesktopV1ExecutorAdapterV2,
  createDeterministicAlternateExecutorV2,
  type ExecutorWorkRequestV2,
} from "./media-executor-v2";
import type { ExecutorCapabilitiesV2 } from "./media-execution-router-v2";

const SOURCE_HASH = "a".repeat(64);
const RESULT_HASH = "f".repeat(64);

function source(overrides: Partial<AssetDescriptorV2> = {}): AssetDescriptorV2 {
  return {
    mediaAssetId: "asset-1", kind: "video", contentHash: SOURCE_HASH, bytes: 2_000_000,
    mimeType: "video/mp4", width: 1080, height: 1920, rotationDegrees: 0, videoCodec: "h264",
    durationMs: 20_000, sampleAspectRatio: { numerator: 1, denominator: 1 }, ...overrides,
  };
}

function work(asset = source()): ExecutorWorkRequestV2 {
  const contentItem = createContentItemV2({
    contentItemId: "content-1", revision: 1, plannedSourceKinds: [asset.kind], sourceAssets: [asset],
    targetPlatforms: ["instagram"], approvedIdea: { ideaId: "idea-1", version: 1 }, shootingSessionId: "shoot-1",
    publicationObjective: "Publish", scheduledPublicationTime: null, priority: "normal", deadline: "2026-10-13T12:00:00.000Z",
    compositionIntent: { preserveSourceComposition: true }, audioIntent: { normalizeSpeech: true },
    subtitleIntent: { enabled: true, language: "ru" }, captionCopyId: null, publicationStatus: "captured",
  });
  const plan = buildCanonicalMediaPlanV2(contentItem, { timelineVersion: 1 });
  return { jobId: "job-1", executionId: "execution-1", attemptNumber: 1, leaseId: "lease-1", contentItem, plan };
}

function alternateCapabilities(): ExecutorCapabilitiesV2 {
  return {
    executorId: "alternate-1", executorKind: "cloud", supportedPublicationTypes: ["reel"],
    inputDecodeCodecs: ["h264"], outputEncodeCodecs: ["h264"], maxAssetBytes: 3_000_000_000,
    maxAggregateBytes: 3_000_000_000, maxWidth: 4096, maxHeight: 4096,
    compositionModes: ["crop", "contain_background"], encodeGenerations: 1,
    semanticFeatures: ["video_timeline", "subtitles", "audio_normalization"], availability: "available",
    observedAt: "2026-10-12T12:00:00.000Z", heartbeatAt: "2026-10-12T12:00:00.000Z",
    expiresAt: "2026-10-12T12:10:00.000Z", expectedCompletionTimeMs: 30_000,
    estimatedCostCents: 0, costClass: "free_tier", qualityTier: 3,
  };
}

describe("MediaExecutor V2 contract", () => {
  it("supports the complete claim, execute, heartbeat, validate, cancel, release and fail lifecycle", async () => {
    const executor = createDeterministicAlternateExecutorV2({ capabilities: alternateCapabilities(), resultHash: RESULT_HASH });
    const request = work();

    expect(executor.canExecute(request, "2026-10-12T12:01:00.000Z").eligible).toBe(true);
    expect(executor.estimate(request)).toEqual({ durationMs: 30_000, costCents: 0 });
    await expect(executor.claim(request)).resolves.toEqual({ accepted: true });
    await expect(executor.heartbeat(request)).resolves.toEqual({ accepted: true });
    const result = await executor.execute(request);
    expect(result.asset.lineage).toEqual(request.plan.lineage);
    expect(executor.validate(request, result, "2026-10-12T12:02:00.000Z")).toEqual({ status: "QUALITY_PASS", reasons: [], checkedAt: "2026-10-12T12:02:00.000Z" });
    await expect(executor.release(request)).resolves.toEqual({ accepted: true });
    await expect(executor.cancel(request)).resolves.toEqual({ accepted: true });
    await expect(executor.fail(request, "render_failed")).resolves.toEqual({ accepted: true });
  });

  it("keeps frozen Desktop V1 behind a narrow adapter and rejects unsafe square Reel work", () => {
    const adapter = createDesktopV1ExecutorAdapterV2({
      observedAt: "2026-10-12T12:00:00.000Z", expiresAt: "2026-10-12T12:10:00.000Z",
      transport: {
        claim: async () => ({ accepted: true }), heartbeat: async () => ({ accepted: true }),
        execute: async () => { throw new Error("not invoked"); }, cancel: async () => ({ accepted: true }),
        release: async () => ({ accepted: true }), fail: async () => ({ accepted: true }),
      },
    });

    const decision = adapter.canExecute(work(source({ width: 400, height: 400 })), "2026-10-12T12:01:00.000Z");
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toEqual(expect.arrayContaining(["composition_mode_unsupported", "encode_generation_limit_exceeded"]));
  });

  it("returns lineage-bound deterministic output evidence", async () => {
    const executor = createDeterministicAlternateExecutorV2({ capabilities: alternateCapabilities(), resultHash: RESULT_HASH });
    const request = work();
    await executor.claim(request);
    const result = await executor.execute(request);

    expect(result).toMatchObject({ executorId: "alternate-1", attemptNumber: 1, leaseId: "lease-1" });
    expect(result.asset).toMatchObject({ resultHash: RESULT_HASH, codec: "h264", width: 1080, height: 1920, fullDecodePassed: true });
    expect(result.asset.lineage.timelineHash).toBe(request.plan.lineage.timelineHash);
  });

  it("fails objective validation for corrupt, wrong-codec or wrong-lineage output", async () => {
    const request = work();
    for (const corruption of ["decode", "codec", "lineage"] as const) {
      const executor = createDeterministicAlternateExecutorV2({ capabilities: alternateCapabilities(), resultHash: RESULT_HASH, corruption });
      await executor.claim(request);
      const result = await executor.execute(request);
      const quality = executor.validate(request, result, "2026-10-12T12:02:00.000Z");
      expect(quality.status).toBe("OUTPUT_INVALID");
      expect(quality.reasons.length).toBeGreaterThan(0);
    }
  });

  it("binds result ownership, duration and generation evidence to the selected executor and plan", async () => {
    const request = work();
    const executor = createDeterministicAlternateExecutorV2({ capabilities: alternateCapabilities(), resultHash: RESULT_HASH });
    await executor.claim(request);
    const result = await executor.execute(request);
    expect(executor.validate(request, { ...result, executorId: "different" }, "2026-10-12T12:02:00.000Z").reasons).toContain("execution_ownership_mismatch");
    expect(executor.validate(request, { ...result, asset: { ...result.asset, durationMs: result.asset.durationMs + 2_000 } }, "2026-10-12T12:02:00.000Z").reasons).toContain("output_duration_mismatch");
    expect(executor.validate(request, { ...result, asset: { ...result.asset, encodeGenerations: 2 } }, "2026-10-12T12:02:00.000Z").reasons).toContain("encode_generation_limit_exceeded");
  });
});
