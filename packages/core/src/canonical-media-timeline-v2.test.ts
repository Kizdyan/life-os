import { describe, expect, it } from "vitest";
import { createContentItemV2, type AssetDescriptorV2 } from "./content-format-v2";
import {
  buildCanonicalMediaPlanV2,
  measureCoverCropV2,
  validateCanonicalMediaPlanV2,
} from "./canonical-media-timeline-v2";

const ASSET_HASH = "a".repeat(64);
const REVISION_HASH = "b".repeat(64);
const TIMELINE_HASH = "c".repeat(64);

function descriptor(overrides: Partial<AssetDescriptorV2> = {}): AssetDescriptorV2 {
  return {
    mediaAssetId: "asset-1",
    kind: "video",
    contentHash: ASSET_HASH,
    bytes: 900_000,
    mimeType: "video/mp4",
    width: 1080,
    height: 1920,
    rotationDegrees: 0,
    videoCodec: "h264",
    ...overrides,
  };
}

function itemFor(assets: AssetDescriptorV2[], explicit?: "reel" | "photo_post" | "carousel_post" | "story") {
  return createContentItemV2({
    contentItemId: "content-1",
    revision: 2,
    revisionHash: REVISION_HASH,
    explicitTargetPublicationType: explicit,
    plannedSourceKinds: assets.map((asset) => asset.kind),
    sourceAssets: assets,
    targetPlatforms: ["instagram"],
    approvedIdea: { ideaId: "idea-1", version: 4 },
    shootingSessionId: "shoot-1",
    publicationObjective: "Publish the approved idea",
    scheduledPublicationTime: null,
    priority: "normal",
    deadline: null,
    compositionIntent: { preserveSourceComposition: true },
    audioIntent: { normalizeSpeech: true },
    subtitleIntent: { enabled: true, language: "ru" },
    captionCopyId: "copy-1",
    publicationStatus: "captured",
  });
}

describe("Canonical media plan V2", () => {
  it("uses discriminated plan kinds for video, photo, and carousel work", () => {
    const video = buildCanonicalMediaPlanV2(itemFor([descriptor()]), { timelineVersion: 1, timelineHash: TIMELINE_HASH });
    const photo = buildCanonicalMediaPlanV2(itemFor([
      descriptor({ kind: "photo", mimeType: "image/jpeg", videoCodec: null }),
    ]), { timelineVersion: 1, timelineHash: TIMELINE_HASH });
    const carousel = buildCanonicalMediaPlanV2(itemFor([
      descriptor({ mediaAssetId: "photo-1", kind: "photo", mimeType: "image/jpeg", videoCodec: null }),
      descriptor({ mediaAssetId: "photo-2", kind: "photo", contentHash: "d".repeat(64), mimeType: "image/jpeg", videoCodec: null }),
    ]), { timelineVersion: 1, timelineHash: TIMELINE_HASH });

    expect(video.kind).toBe("video_timeline");
    expect(photo.kind).toBe("photo_plan");
    expect(carousel.kind).toBe("carousel_plan");
  });

  it("selects contain-background for a square Reel rather than destructive center crop", () => {
    const item = itemFor([descriptor({ width: 400, height: 400 })]);
    const plan = buildCanonicalMediaPlanV2(item, { timelineVersion: 1, timelineHash: TIMELINE_HASH });

    expect(plan.kind).toBe("video_timeline");
    if (plan.kind !== "video_timeline") throw new Error("expected video timeline");
    expect(plan.composition.mode).toBe("contain_background");
    expect(plan.preflight.cropGate).toBe("CROP_SAFE");
    expect(plan.preflight.measuredDiscard).toEqual({ horizontal: 0, vertical: 0, area: 0 });
  });

  it("measures the rejected V1 square cover crop as 43.75 percent horizontal discard", () => {
    const measurement = measureCoverCropV2({ width: 400, height: 400, rotationDegrees: 0 }, { width: 1080, height: 1920 });

    expect(measurement.horizontal).toBeCloseTo(0.4375, 6);
    expect(measurement.vertical).toBe(0);
    expect(measurement.area).toBeCloseTo(0.4375, 6);
  });

  it("blocks destructive crop without versioned high-confidence evidence", () => {
    const item = itemFor([descriptor({ width: 400, height: 400 })]);
    const plan = buildCanonicalMediaPlanV2(item, {
      timelineVersion: 1,
      timelineHash: TIMELINE_HASH,
      compositionDecision: { mode: "crop" },
    });

    expect(plan.kind).toBe("video_timeline");
    if (plan.kind !== "video_timeline") throw new Error("expected video timeline");
    expect(plan.preflight.cropGate).toBe("CROP_REVIEW_REQUIRED");
    expect(plan.preflight.actionable).toBe(false);
  });

  it("accepts the crop threshold boundary and normalizes rotated dimensions", () => {
    const boundary = measureCoverCropV2({ width: 675, height: 1000, rotationDegrees: 0 }, { width: 9, height: 16 });
    const rotated = measureCoverCropV2({ width: 1920, height: 1080, rotationDegrees: 90 }, { width: 9, height: 16 });

    expect(boundary.horizontal).toBeCloseTo(1 - (9 / 16) / 0.675, 6);
    expect(boundary.horizontal).toBeLessThanOrEqual(0.2);
    expect(rotated).toEqual({ horizontal: 0, vertical: 0, area: 0 });
  });

  it("rejects clipping evidence even when crop confidence is high", () => {
    const plan = buildCanonicalMediaPlanV2(itemFor([descriptor({ width: 400, height: 400 })]), {
      timelineVersion: 1,
      timelineHash: TIMELINE_HASH,
      compositionDecision: {
        mode: "crop",
        evidence: {
          producer: "subject-detector",
          version: "1.0.0",
          confidence: 0.99,
          subjectClipped: true,
          safeZoneClipped: false,
        },
      },
    });

    expect(plan.kind).toBe("video_timeline");
    if (plan.kind !== "video_timeline") throw new Error("expected video timeline");
    expect(plan.preflight.cropGate).toBe("CROP_REVIEW_REQUIRED");
    expect(plan.preflight.reasons).toContain("subject_clipped");
  });

  it("pins content, idea, source, timeline, and QA lineage and rejects drift", () => {
    const item = itemFor([descriptor()]);
    const plan = buildCanonicalMediaPlanV2(item, { timelineVersion: 3, timelineHash: TIMELINE_HASH });

    expect(plan.lineage).toMatchObject({
      contentItemId: "content-1",
      contentRevision: 2,
      contentRevisionHash: REVISION_HASH,
      targetPublicationType: "reel",
      approvedIdeaId: "idea-1",
      approvedIdeaVersion: 4,
      timelineVersion: 3,
      timelineHash: TIMELINE_HASH,
      qaPolicyVersion: "media-v2.1",
    });
    expect(() => validateCanonicalMediaPlanV2(item, {
      ...plan,
      lineage: { ...plan.lineage, targetPublicationType: "story" },
    })).toThrow(/publication type drift/i);
  });
});
