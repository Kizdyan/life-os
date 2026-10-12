import { describe, expect, it } from "vitest";
import type { AssetDescriptorV2, ContentItemV2Input, TargetPublicationType } from "./content-format-v2";
import { prepareMediaExecutionV2 } from "./media-execution-v2";
import type { ExecutorCapabilitiesV2 } from "./media-execution-router-v2";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

function asset(kind: AssetDescriptorV2["kind"], id: string, overrides: Partial<AssetDescriptorV2> = {}): AssetDescriptorV2 {
  return {
    mediaAssetId: id,
    kind,
    contentHash: (id.charCodeAt(id.length - 1) % 10).toString().repeat(64),
    bytes: 800_000,
    mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
    width: 1080,
    height: 1920,
    rotationDegrees: 0,
    videoCodec: kind === "video" ? "h264" : null,
    ...overrides,
  };
}

function content(sourceAssets: AssetDescriptorV2[], explicitTargetPublicationType?: TargetPublicationType): ContentItemV2Input {
  return {
    contentItemId: "content-vertical-slice",
    revision: 1,
    revisionHash: A,
    explicitTargetPublicationType,
    plannedSourceKinds: sourceAssets.map((entry) => entry.kind),
    sourceAssets,
    targetPlatforms: ["instagram", "vk"],
    approvedIdea: { ideaId: "idea-approved", version: 2 },
    shootingSessionId: "shooting-1",
    publicationObjective: "Prove V2 format-aware execution",
    scheduledPublicationTime: null,
    priority: "normal",
    deadline: "2026-10-13T12:00:00.000Z",
    compositionIntent: { preserveSourceComposition: true },
    audioIntent: { normalizeSpeech: true },
    subtitleIntent: { enabled: true, language: "ru" },
    captionCopyId: "copy-1",
    publicationStatus: "captured",
  };
}

function capableExecutor(): ExecutorCapabilitiesV2 {
  return {
    executorId: "owned-format-aware",
    executorKind: "desktop",
    supportedPublicationTypes: ["reel", "photo_post", "carousel_post", "story"],
    inputDecodeCodecs: ["h264", "image"],
    outputEncodeCodecs: ["h264", "jpeg", "png"],
    maxAssetBytes: 2_000_000_000,
    maxAggregateBytes: 4_000_000_000,
    maxWidth: 4096,
    maxHeight: 4096,
    compositionModes: ["crop", "contain_background", "layout_composite"],
    encodeGenerations: 1,
    semanticFeatures: ["subtitles", "audio_normalization", "photo_timeline", "still_image", "slide_layout"],
    availability: "available",
    observedAt: "2026-10-12T12:00:00.000Z",
    heartbeatAt: "2026-10-12T12:00:00.000Z",
    expiresAt: "2026-10-12T12:10:00.000Z",
    expectedCompletionTimeMs: 60_000,
    estimatedCostCents: 0,
    costClass: "owned",
    qualityTier: 3,
  };
}

describe("Media Execution V2 first vertical slice", () => {
  it.each([
    [content([asset("video", "asset-1")]), "reel", "video_timeline"],
    [content([asset("photo", "asset-2")]), "photo_post", "photo_plan"],
    [content([asset("photo", "asset-2"), asset("photo", "asset-3")]), "carousel_post", "carousel_plan"],
    [content([asset("text_slide", "asset-4")]), "carousel_post", "carousel_plan"],
    [content([asset("photo", "asset-2"), asset("photo", "asset-3")], "reel"), "reel", "video_timeline"],
  ] as const)("prepares the required format inference example", (contentItem, type, planKind) => {
    const result = prepareMediaExecutionV2({
      contentItem,
      timelineVersion: 1,
      timelineHash: B,
      outputProfile: "canonical-v2",
      executors: [capableExecutor()],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(result.status).toBe("READY_FOR_EXECUTION");
    expect(result.contentItem.targetPublicationType).toBe(type);
    expect(result.plan.kind).toBe(planKind);
    expect(result.plan.lineage.targetPublicationType).toBe(type);
    if (result.status !== "READY_FOR_EXECUTION") throw new Error("expected ready result");
    expect(result.executionRequest.lineage.targetPublicationType).toBe(type);
    expect(result.executionRequest.executorId).toBe("owned-format-aware");
  });

  it("keeps a square Reel composition safe and routes only to a compatible executor", () => {
    const result = prepareMediaExecutionV2({
      contentItem: content([asset("video", "asset-1", { width: 400, height: 400 })]),
      timelineVersion: 1,
      timelineHash: B,
      outputProfile: "instagram-reel-h264",
      executors: [capableExecutor()],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(result.status).toBe("READY_FOR_EXECUTION");
    expect(result.plan.kind).toBe("video_timeline");
    if (result.plan.kind !== "video_timeline") throw new Error("expected video plan");
    expect(result.plan.composition.mode).toBe("contain_background");
    expect(result.plan.preflight.measuredDiscard.area).toBe(0);
  });

  it("returns REVISE_COMPOSITION for unverified destructive crop", () => {
    const result = prepareMediaExecutionV2({
      contentItem: content([asset("video", "asset-1", { width: 400, height: 400 })]),
      timelineVersion: 1,
      timelineHash: B,
      outputProfile: "instagram-reel-h264",
      compositionDecision: { mode: "crop" },
      executors: [capableExecutor()],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(result.status).toBe("REVISE_COMPOSITION");
    expect(result.actionable).toBe(false);
    expect(result.plan.preflight.cropGate).toBe("CROP_REVIEW_REQUIRED");
  });

  it("returns NO_EXECUTOR without degrading the approved plan", () => {
    const result = prepareMediaExecutionV2({
      contentItem: content([asset("video", "asset-1")]),
      timelineVersion: 1,
      timelineHash: C,
      outputProfile: "canonical-v2",
      executors: [],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(result.status).toBe("NO_EXECUTOR");
    expect(result.actionable).toBe(false);
    expect(result.contentItem.targetPublicationType).toBe("reel");
    expect(result.plan.lineage.timelineHash).toBe(C);
  });
});
