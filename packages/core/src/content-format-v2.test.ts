import { describe, expect, it } from "vitest";
import {
  createContentItemV2,
  reviseContentItemWithCapturedAssets,
  type AssetDescriptorV2,
  type ContentItemV2Input,
} from "./content-format-v2";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function asset(overrides: Partial<AssetDescriptorV2> = {}): AssetDescriptorV2 {
  return {
    mediaAssetId: "asset-1",
    kind: "video",
    contentHash: HASH_A,
    bytes: 1_000_000,
    mimeType: "video/mp4",
    width: 1920,
    height: 1080,
    rotationDegrees: 0,
    videoCodec: "h264",
    durationMs: 30_000,
    sampleAspectRatio: { numerator: 1, denominator: 1 },
    ...overrides,
  };
}

function input(overrides: Partial<ContentItemV2Input> = {}): ContentItemV2Input {
  return {
    contentItemId: "content-1",
    revision: 1,
    plannedSourceKinds: ["video"],
    sourceAssets: [asset()],
    targetPlatforms: ["instagram"],
    approvedIdea: { ideaId: "idea-1", version: 3 },
    shootingSessionId: "shoot-1",
    publicationObjective: "Reach the approved audience",
    scheduledPublicationTime: "2026-10-14T09:00:00.000Z",
    priority: "normal",
    deadline: "2026-10-14T08:00:00.000Z",
    compositionIntent: { preserveSourceComposition: true },
    audioIntent: { normalizeSpeech: true },
    subtitleIntent: { enabled: true, language: "ru" },
    captionCopyId: "copy-1",
    publicationStatus: "planned",
    ...overrides,
  };
}

describe("Content Format Contract V2", () => {
  it.each([
    [[asset()], "reel"],
    [[asset({ kind: "photo", mimeType: "image/jpeg", videoCodec: null, durationMs: null })], "photo_post"],
    [[
      asset({ mediaAssetId: "photo-1", kind: "photo", mimeType: "image/jpeg", videoCodec: null, durationMs: null }),
      asset({ mediaAssetId: "photo-2", kind: "photo", contentHash: HASH_B, mimeType: "image/jpeg", videoCodec: null, durationMs: null }),
    ], "carousel_post"],
    [[asset({ kind: "text_slide", mimeType: "image/png", videoCodec: null, durationMs: null })], "carousel_post"],
  ] as const)("infers publication type from validated assets", (sourceAssets, expected) => {
    const item = createContentItemV2(input({
      plannedSourceKinds: sourceAssets.map((entry) => entry.kind),
      sourceAssets: [...sourceAssets],
    }));

    expect(item.targetPublicationType).toBe(expected);
    expect(item.targetPublicationTypeSource).toBe("inferred");
  });

  it("lets approved editorial intent override photo inference", () => {
    const item = createContentItemV2(input({
      explicitTargetPublicationType: "reel",
      plannedSourceKinds: ["photo", "photo"],
      sourceAssets: [
        asset({ mediaAssetId: "photo-1", kind: "photo", mimeType: "image/jpeg", videoCodec: null, durationMs: null }),
        asset({ mediaAssetId: "photo-2", kind: "photo", contentHash: HASH_B, mimeType: "image/jpeg", videoCodec: null, durationMs: null }),
      ],
    }));

    expect(item.targetPublicationType).toBe("reel");
    expect(item.targetPublicationTypeSource).toBe("editorial");
  });

  it("fails closed when a captured descriptor is incomplete", () => {
    expect(() => createContentItemV2(input({
      sourceAssets: [{ ...asset(), width: 0 }],
    }))).toThrow(/width/i);
  });

  it("fails closed for empty or unknown planned source kinds even with explicit format intent", () => {
    expect(() => createContentItemV2(input({
      explicitTargetPublicationType: "reel",
      plannedSourceKinds: [],
      sourceAssets: [],
    }))).toThrow(/plannedSourceKinds/i);

    expect(() => createContentItemV2(input({
      explicitTargetPublicationType: "reel",
      plannedSourceKinds: ["document" as never],
      sourceAssets: [],
    }))).toThrow(/plannedSourceKinds/i);
  });

  it("preserves publication intent and idea lineage when capture creates a revision", () => {
    const planned = createContentItemV2(input({
      explicitTargetPublicationType: "reel",
      plannedSourceKinds: ["photo", "photo"],
      sourceAssets: [],
    }));

    const captured = reviseContentItemWithCapturedAssets(planned, {
      revision: 2,
      sourceAssets: [
        asset({ mediaAssetId: "photo-1", kind: "photo", mimeType: "image/jpeg", videoCodec: null, durationMs: null }),
        asset({ mediaAssetId: "photo-2", kind: "photo", contentHash: HASH_B, mimeType: "image/jpeg", videoCodec: null, durationMs: null }),
      ],
    });

    expect(captured.targetPublicationType).toBe("reel");
    expect(captured.targetPublicationTypeSource).toBe("editorial");
    expect(captured.approvedIdea).toEqual(planned.approvedIdea);
    expect(captured.revision).toBe(2);
    expect(captured.revisionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(captured.revisionHash).not.toBe(planned.revisionHash);
  });
});
