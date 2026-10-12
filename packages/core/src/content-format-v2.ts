export type TargetPublicationType = "reel" | "photo_post" | "carousel_post" | "story";
export type MediaSourceKindV2 = "video" | "photo" | "text_slide";
export type ContentPriorityV2 = "low" | "normal" | "high" | "deadline_critical";
export type PublicationStatusV2 =
  | "planned"
  | "captured"
  | "editing"
  | "review"
  | "ready"
  | "published"
  | "blocked";

export interface AssetDescriptorV2 {
  mediaAssetId: string;
  kind: MediaSourceKindV2;
  contentHash: string;
  bytes: number;
  mimeType: string;
  width: number;
  height: number;
  rotationDegrees: 0 | 90 | 180 | 270;
  videoCodec: string | null;
}

export interface ContentItemV2Input {
  contentItemId: string;
  revision: number;
  revisionHash: string;
  explicitTargetPublicationType?: TargetPublicationType;
  plannedSourceKinds: MediaSourceKindV2[];
  sourceAssets: AssetDescriptorV2[];
  targetPlatforms: string[];
  approvedIdea: { ideaId: string; version: number };
  shootingSessionId: string | null;
  publicationObjective: string;
  scheduledPublicationTime: string | null;
  priority: ContentPriorityV2;
  deadline: string | null;
  compositionIntent: { preserveSourceComposition: boolean; explicitCropApproved?: boolean };
  audioIntent: { normalizeSpeech: boolean; music?: "none" | "optional" | "required" };
  subtitleIntent: { enabled: boolean; language: string | null };
  captionCopyId: string | null;
  publicationStatus: PublicationStatusV2;
}

export interface CanonicalContentItemV2 extends Omit<ContentItemV2Input, "explicitTargetPublicationType"> {
  schemaVersion: 2;
  targetPublicationType: TargetPublicationType;
  targetPublicationTypeSource: "editorial" | "inferred";
}

const HASH_PATTERN = /^[a-f0-9]{64}$/i;

function requiredText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function validateAsset(asset: AssetDescriptorV2): void {
  requiredText(asset.mediaAssetId, "mediaAssetId");
  requiredText(asset.mimeType, "mimeType");
  if (!HASH_PATTERN.test(asset.contentHash)) throw new Error("contentHash must be a 64-character hex digest");
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) throw new Error("bytes must be a positive integer");
  if (!Number.isFinite(asset.width) || asset.width <= 0) throw new Error("width must be positive");
  if (!Number.isFinite(asset.height) || asset.height <= 0) throw new Error("height must be positive");
  if (asset.kind === "video" && !asset.videoCodec?.trim()) {
    throw new Error("videoCodec is required for video assets");
  }
  if (asset.kind !== "video" && asset.videoCodec !== null) {
    throw new Error("videoCodec must be null for non-video assets");
  }
}

export function inferTargetPublicationTypeV2(
  kinds: readonly MediaSourceKindV2[],
): Exclude<TargetPublicationType, "story"> {
  if (kinds.length === 0) throw new Error("At least one planned or captured source kind is required");
  if (kinds.includes("text_slide")) {
    if (kinds.some((kind) => kind !== "text_slide")) {
      throw new Error("Mixed text-slide and captured media inputs require explicit editorial intent");
    }
    return "carousel_post";
  }
  if (kinds.includes("video")) return "reel";
  return kinds.length === 1 ? "photo_post" : "carousel_post";
}

export function createContentItemV2(input: ContentItemV2Input): CanonicalContentItemV2 {
  requiredText(input.contentItemId, "contentItemId");
  requiredText(input.publicationObjective, "publicationObjective");
  requiredText(input.approvedIdea.ideaId, "approvedIdea.ideaId");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error("revision must be a positive integer");
  if (!Number.isSafeInteger(input.approvedIdea.version) || input.approvedIdea.version < 1) {
    throw new Error("approvedIdea.version must be a positive integer");
  }
  if (!HASH_PATTERN.test(input.revisionHash)) throw new Error("revisionHash must be a 64-character hex digest");
  if (input.targetPlatforms.length === 0 || input.targetPlatforms.some((platform) => !platform.trim())) {
    throw new Error("targetPlatforms must contain at least one valid platform");
  }
  input.sourceAssets.forEach(validateAsset);

  const sourceKinds = input.sourceAssets.length > 0
    ? input.sourceAssets.map((asset) => asset.kind)
    : input.plannedSourceKinds;
  const targetPublicationType = input.explicitTargetPublicationType
    ?? inferTargetPublicationTypeV2(sourceKinds);

  return Object.freeze({
    ...input,
    schemaVersion: 2 as const,
    plannedSourceKinds: Object.freeze([...input.plannedSourceKinds]) as unknown as MediaSourceKindV2[],
    sourceAssets: Object.freeze(input.sourceAssets.map((asset) => Object.freeze({ ...asset }))) as unknown as AssetDescriptorV2[],
    targetPlatforms: Object.freeze([...input.targetPlatforms]) as unknown as string[],
    approvedIdea: Object.freeze({ ...input.approvedIdea }),
    compositionIntent: Object.freeze({ ...input.compositionIntent }),
    audioIntent: Object.freeze({ ...input.audioIntent }),
    subtitleIntent: Object.freeze({ ...input.subtitleIntent }),
    targetPublicationType,
    targetPublicationTypeSource: input.explicitTargetPublicationType ? "editorial" : "inferred",
  });
}

export function reviseContentItemWithCapturedAssets(
  previous: CanonicalContentItemV2,
  update: { revision: number; revisionHash: string; sourceAssets: AssetDescriptorV2[] },
): CanonicalContentItemV2 {
  if (update.revision <= previous.revision) throw new Error("A new content revision must increase revision");
  update.sourceAssets.forEach(validateAsset);
  if (!HASH_PATTERN.test(update.revisionHash)) throw new Error("revisionHash must be a 64-character hex digest");

  return Object.freeze({
    ...previous,
    revision: update.revision,
    revisionHash: update.revisionHash,
    sourceAssets: Object.freeze(update.sourceAssets.map((asset) => Object.freeze({ ...asset }))) as unknown as AssetDescriptorV2[],
  });
}
