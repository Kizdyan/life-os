import { describe, expect, it } from "vitest";
import { buildCanonicalMediaPlanV2, type CanonicalMediaPlanV2 } from "./canonical-media-timeline-v2";
import { createContentItemV2, type AssetDescriptorV2, type CanonicalContentItemV2 } from "./content-format-v2";
import {
  createDesktopV1CapabilitySnapshot,
  createExecutionIdentityV2,
  routeMediaExecutionV2,
  validateApprovedMasterV2,
  validateExecutorResultV2,
  type ExecutorCapabilitiesV2,
} from "./media-execution-router-v2";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

function asset(overrides: Partial<AssetDescriptorV2> = {}): AssetDescriptorV2 {
  return {
    mediaAssetId: "asset-1",
    kind: "video",
    contentHash: A,
    bytes: 1_000_000,
    mimeType: "video/mp4",
    width: 1080,
    height: 1920,
    rotationDegrees: 0,
    videoCodec: "h264",
    ...overrides,
  };
}

function item(source = asset(), overrides: Partial<Parameters<typeof createContentItemV2>[0]> = {}): CanonicalContentItemV2 {
  return createContentItemV2({
    contentItemId: "content-1",
    revision: 1,
    revisionHash: B,
    plannedSourceKinds: [source.kind],
    sourceAssets: [source],
    targetPlatforms: ["instagram"],
    approvedIdea: { ideaId: "idea-1", version: 1 },
    shootingSessionId: "shoot-1",
    publicationObjective: "Publish",
    scheduledPublicationTime: null,
    priority: "normal",
    deadline: "2026-10-12T15:00:00.000Z",
    compositionIntent: { preserveSourceComposition: true },
    audioIntent: { normalizeSpeech: true },
    subtitleIntent: { enabled: true, language: "ru" },
    captionCopyId: null,
    publicationStatus: "captured",
    ...overrides,
  });
}

function plan(content = item()): CanonicalMediaPlanV2 {
  return buildCanonicalMediaPlanV2(content, { timelineVersion: 1, timelineHash: C });
}

function executor(overrides: Partial<ExecutorCapabilitiesV2> = {}): ExecutorCapabilitiesV2 {
  return {
    executorId: "desktop-modern",
    executorKind: "desktop",
    supportedPublicationTypes: ["reel", "photo_post", "carousel_post", "story"],
    inputDecodeCodecs: ["h264", "hevc", "image"],
    outputEncodeCodecs: ["h264", "jpeg", "png"],
    maxAssetBytes: 2_000_000_000,
    maxAggregateBytes: 4_000_000_000,
    maxWidth: 4096,
    maxHeight: 4096,
    compositionModes: ["crop", "contain_background", "layout_composite", "subject_reframe"],
    encodeGenerations: 1,
    semanticFeatures: ["subtitles", "audio_normalization", "photo_timeline", "still_image", "slide_layout"],
    availability: "available",
    observedAt: "2026-10-12T12:00:00.000Z",
    heartbeatAt: "2026-10-12T12:00:00.000Z",
    expiresAt: "2026-10-12T12:05:00.000Z",
    expectedCompletionTimeMs: 120_000,
    estimatedCostCents: 0,
    costClass: "owned",
    qualityTier: 3,
    ...overrides,
  };
}

describe("Media Execution Router V2", () => {
  it("defaults to FREE_ONLY and excludes a paid cloud executor", () => {
    const content = item();
    const decision = routeMediaExecutionV2({
      contentItem: content,
      plan: plan(content),
      executors: [
        executor({ executorId: "cloud", executorKind: "cloud", costClass: "paid", estimatedCostCents: 20, qualityTier: 4 }),
        executor({ executorId: "owned" }),
      ],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(decision.status).toBe("selected");
    if (decision.status !== "selected") throw new Error("expected selection");
    expect(decision.executorId).toBe("owned");
    expect(decision.budgetPolicy).toEqual({ mode: "FREE_ONLY" });
  });

  it("excludes stale/unavailable executors and fails over", () => {
    const content = item();
    const decision = routeMediaExecutionV2({
      contentItem: content,
      plan: plan(content),
      executors: [
        executor({ executorId: "offline", availability: "offline" }),
        executor({ executorId: "stale", expiresAt: "2026-10-12T12:00:30.000Z" }),
        executor({ executorId: "iphone", executorKind: "iphone", qualityTier: 2 }),
      ],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(decision.status).toBe("selected");
    if (decision.status !== "selected") throw new Error("expected selection");
    expect(decision.executorId).toBe("iphone");
  });

  it("uses executor ID as a stable final tie-break", () => {
    const content = item();
    const decision = routeMediaExecutionV2({
      contentItem: content,
      plan: plan(content),
      executors: [executor({ executorId: "z-executor" }), executor({ executorId: "a-executor" })],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(decision.status === "selected" && decision.executorId).toBe("a-executor");
  });

  it("rejects Desktop V1 for a square Reel that needs contain-background and one encode", () => {
    const content = item(asset({ width: 400, height: 400 }));
    const decision = routeMediaExecutionV2({
      contentItem: content,
      plan: plan(content),
      executors: [createDesktopV1CapabilitySnapshot({
        observedAt: "2026-10-12T12:00:00.000Z",
        expiresAt: "2026-10-12T12:05:00.000Z",
      })],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(decision.status).toBe("no_eligible_executor");
    if (decision.status !== "no_eligible_executor") throw new Error("expected no executor");
    expect(decision.rejections[0].reasons).toEqual(expect.arrayContaining(["composition_mode_unsupported", "encode_generation_limit_exceeded"]));
  });

  it("returns a typed non-actionable decision when no executor qualifies", () => {
    const content = item();
    const decision = routeMediaExecutionV2({
      contentItem: content,
      plan: plan(content),
      executors: [],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(decision).toEqual({
      status: "no_eligible_executor",
      actionable: false,
      budgetPolicy: { mode: "FREE_ONLY" },
      rejections: [],
    });
  });

  it("creates distinct V2 execution identities for content and timeline revisions", () => {
    const first = plan(item());
    const secondContent = item(asset(), { revision: 2, revisionHash: "d".repeat(64) });
    const second = buildCanonicalMediaPlanV2(secondContent, { timelineVersion: 2, timelineHash: "e".repeat(64) });

    expect(createExecutionIdentityV2(first, "instagram-reel-h264")).not.toBe(
      createExecutionIdentityV2(second, "instagram-reel-h264"),
    );
  });

  it("rejects stale result lineage and approval for another master hash", () => {
    const content = item();
    const mediaPlan = plan(content);
    const identity = createExecutionIdentityV2(mediaPlan, "instagram-reel-h264");
    const result = {
      executionId: identity,
      attempt: 1,
      executorId: "owned",
      lineage: { ...mediaPlan.lineage, timelineHash: "f".repeat(64) },
      resultHash: A,
      qaPolicyVersion: mediaPlan.lineage.qaPolicyVersion,
    };

    expect(() => validateExecutorResultV2(mediaPlan, identity, 1, result)).toThrow(/lineage/i);
    expect(() => validateApprovedMasterV2({
      executionId: identity,
      resultHash: B,
      contentRevisionHash: mediaPlan.lineage.contentRevisionHash,
      timelineHash: mediaPlan.lineage.timelineHash,
      qaPolicyVersion: mediaPlan.lineage.qaPolicyVersion,
      approvedAt: "2026-10-12T12:10:00.000Z",
    }, { ...result, lineage: mediaPlan.lineage })).toThrow(/master hash/i);
  });
});
