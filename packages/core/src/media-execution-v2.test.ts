import { describe, expect, it } from "vitest";
import type { AssetDescriptorV2, ContentItemV2Input, TargetPublicationType } from "./content-format-v2";
import { prepareMediaExecutionV2 } from "./media-execution-v2";
import type { ExecutorCapabilitiesV2 } from "./media-execution-router-v2";

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
    durationMs: kind === "video" ? 30_000 : null,
    sampleAspectRatio: { numerator: 1, denominator: 1 },
    ...overrides,
  };
}

function content(sourceAssets: AssetDescriptorV2[], explicitTargetPublicationType?: TargetPublicationType): ContentItemV2Input {
  return {
    contentItemId: "content-vertical-slice",
    revision: 1,
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
    semanticFeatures: ["video_timeline", "subtitles", "audio_normalization", "photo_timeline", "still_image", "slide_layout"],
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
      outputProfile: "canonical-v2",
      executors: [capableExecutor()],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(result.status).toBe("SELECTED_PENDING_CLAIM");
    expect(result.contentItem.targetPublicationType).toBe(type);
    expect(result.plan.kind).toBe(planKind);
    expect(result.plan.lineage.targetPublicationType).toBe(type);
    if (result.status !== "SELECTED_PENDING_CLAIM") throw new Error("expected selected result");
    expect(result.claimRequest.lineage.targetPublicationType).toBe(type);
    expect(result.claimRequest.executorId).toBe("owned-format-aware");
  });

  it("keeps a square Reel composition safe and routes only to a compatible executor", () => {
    const result = prepareMediaExecutionV2({
      contentItem: content([asset("video", "asset-1", { width: 400, height: 400 })]),
      timelineVersion: 1,
      outputProfile: "instagram-reel-h264",
      executors: [capableExecutor()],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(result.status).toBe("SELECTED_PENDING_CLAIM");
    expect(result.plan.kind).toBe("video_timeline");
    if (result.plan.kind !== "video_timeline") throw new Error("expected video plan");
    expect(result.plan.composition.mode).toBe("contain_background");
    expect(result.plan.preflight.measuredDiscard.area).toBe(0);
  });

  it("returns REVISE_COMPOSITION for unverified destructive crop", () => {
    const result = prepareMediaExecutionV2({
      contentItem: content([asset("video", "asset-1", { width: 400, height: 400 })]),
      timelineVersion: 1,
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
      outputProfile: "canonical-v2",
      executors: [],
      now: "2026-10-12T12:01:00.000Z",
    });

    expect(result.status).toBe("NO_EXECUTOR");
    expect(result.actionable).toBe(false);
    expect(result.contentItem.targetPublicationType).toBe("reel");
    expect(result.plan.lineage.timelineHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
