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
  durationMs: number | null;
  sampleAspectRatio: { numerator: number; denominator: number };
}

export interface ContentItemV2Input {
  contentItemId: string;
  revision: number;
  revisionHash?: string;
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

export interface CanonicalContentItemV2 extends Omit<ContentItemV2Input, "explicitTargetPublicationType" | "revisionHash"> {
  schemaVersion: 2;
  revisionHash: string;
  targetPublicationType: TargetPublicationType;
  targetPublicationTypeSource: "editorial" | "inferred";
}

const HASH_PATTERN = /^[a-f0-9]{64}$/i;

function requiredText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function validateAsset(asset: AssetDescriptorV2): void {
  if (!["video", "photo", "text_slide"].includes(asset.kind)) throw new Error("asset kind is invalid");
  requiredText(asset.mediaAssetId, "mediaAssetId");
  requiredText(asset.mimeType, "mimeType");
  if (!HASH_PATTERN.test(asset.contentHash)) throw new Error("contentHash must be a 64-character hex digest");
  if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) throw new Error("bytes must be a positive integer");
  if (!Number.isSafeInteger(asset.width) || asset.width <= 0) throw new Error("width must be a positive integer");
  if (!Number.isSafeInteger(asset.height) || asset.height <= 0) throw new Error("height must be a positive integer");
  if (![0, 90, 180, 270].includes(asset.rotationDegrees)) throw new Error("rotationDegrees is invalid");
  if (!Number.isSafeInteger(asset.sampleAspectRatio.numerator) || asset.sampleAspectRatio.numerator <= 0
    || !Number.isSafeInteger(asset.sampleAspectRatio.denominator) || asset.sampleAspectRatio.denominator <= 0) {
    throw new Error("sampleAspectRatio must contain positive integers");
  }
  if (asset.kind === "video" && !asset.videoCodec?.trim()) {
    throw new Error("videoCodec is required for video assets");
  }
  if (asset.kind === "video" && (!Number.isSafeInteger(asset.durationMs) || (asset.durationMs ?? 0) <= 0)) {
    throw new Error("durationMs must be a positive integer for video assets");
  }
  if (asset.kind !== "video" && asset.videoCodec !== null) {
    throw new Error("videoCodec must be null for non-video assets");
  }
  if (asset.kind !== "video" && asset.durationMs !== null) throw new Error("durationMs must be null for non-video assets");
  if (asset.kind === "video" && !asset.mimeType.startsWith("video/")) throw new Error("video MIME type is required");
  if (asset.kind !== "video" && !asset.mimeType.startsWith("image/")) throw new Error("image MIME type is required");
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

function createContentItemSnapshotV2(
  input: ContentItemV2Input,
  preservedTypeSource?: CanonicalContentItemV2["targetPublicationTypeSource"],
): CanonicalContentItemV2 {
  requiredText(input.contentItemId, "contentItemId");
  requiredText(input.publicationObjective, "publicationObjective");
  requiredText(input.approvedIdea.ideaId, "approvedIdea.ideaId");
  if (input.explicitTargetPublicationType !== undefined && !["reel", "photo_post", "carousel_post", "story"].includes(input.explicitTargetPublicationType)) throw new Error("targetPublicationType is invalid");
  if (!["low", "normal", "high", "deadline_critical"].includes(input.priority)) throw new Error("priority is invalid");
  if (!["planned", "captured", "editing", "review", "ready", "published", "blocked"].includes(input.publicationStatus)) throw new Error("publicationStatus is invalid");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw new Error("revision must be a positive integer");
  if (!Number.isSafeInteger(input.approvedIdea.version) || input.approvedIdea.version < 1) {
    throw new Error("approvedIdea.version must be a positive integer");
  }
  if (input.revisionHash !== undefined && !HASH_PATTERN.test(input.revisionHash)) throw new Error("revisionHash must be a 64-character hex digest");
  if (input.targetPlatforms.length === 0 || input.targetPlatforms.some((platform) => !platform.trim())) {
    throw new Error("targetPlatforms must contain at least one valid platform");
  }
  input.sourceAssets.forEach(validateAsset);
  if (new Set(input.sourceAssets.map((asset) => asset.mediaAssetId)).size !== input.sourceAssets.length) {
    throw new Error("Duplicate mediaAssetId values are not allowed");
  }
  for (const [name, value] of [["scheduledPublicationTime", input.scheduledPublicationTime], ["deadline", input.deadline]] as const) {
    if (value !== null && !Number.isFinite(Date.parse(value))) throw new Error(`${name} must be a valid timestamp`);
  }

  const sourceKinds = input.sourceAssets.length > 0
    ? input.sourceAssets.map((asset) => asset.kind)
    : input.plannedSourceKinds;
  const targetPublicationType = input.explicitTargetPublicationType
    ?? inferTargetPublicationTypeV2(sourceKinds);

  const expectedRevisionHash = input.revisionHash;
  const canonicalInput = {
    contentItemId: input.contentItemId,
    revision: input.revision,
    plannedSourceKinds: [...input.plannedSourceKinds],
    sourceAssets: input.sourceAssets.map((asset) => ({ ...asset, sampleAspectRatio: { ...asset.sampleAspectRatio } })),
    targetPlatforms: [...input.targetPlatforms],
    approvedIdea: { ...input.approvedIdea },
    shootingSessionId: input.shootingSessionId,
    publicationObjective: input.publicationObjective,
    scheduledPublicationTime: input.scheduledPublicationTime,
    priority: input.priority,
    deadline: input.deadline,
    compositionIntent: { ...input.compositionIntent },
    audioIntent: { ...input.audioIntent },
    subtitleIntent: { ...input.subtitleIntent },
    captionCopyId: input.captionCopyId,
    publicationStatus: input.publicationStatus,
  };
  const targetPublicationTypeSource = preservedTypeSource ?? (input.explicitTargetPublicationType ? "editorial" : "inferred");
  const revisionHash = canonicalHashV2({ ...canonicalInput, targetPublicationType, targetPublicationTypeSource });
  if (expectedRevisionHash && expectedRevisionHash !== revisionHash) throw new Error("revisionHash does not match canonical content");
  return deepFreezeV2({
    ...canonicalInput,
    schemaVersion: 2 as const,
    revisionHash,
    plannedSourceKinds: [...input.plannedSourceKinds],
    sourceAssets: input.sourceAssets.map((asset) => ({ ...asset, sampleAspectRatio: { ...asset.sampleAspectRatio } })),
    targetPlatforms: [...input.targetPlatforms],
    approvedIdea: { ...input.approvedIdea },
    compositionIntent: { ...input.compositionIntent },
    audioIntent: { ...input.audioIntent },
    subtitleIntent: { ...input.subtitleIntent },
    targetPublicationType,
    targetPublicationTypeSource,
  });
}

export function createContentItemV2(input: ContentItemV2Input): CanonicalContentItemV2 {
  return createContentItemSnapshotV2(input);
}

export function reviseContentItemWithCapturedAssets(
  previous: CanonicalContentItemV2,
  update: { revision: number; revisionHash?: string; sourceAssets: AssetDescriptorV2[] },
): CanonicalContentItemV2 {
  if (update.revision <= previous.revision) throw new Error("A new content revision must increase revision");
  update.sourceAssets.forEach(validateAsset);
  const nextInput: ContentItemV2Input = {
    contentItemId: previous.contentItemId,
    revision: update.revision,
    revisionHash: update.revisionHash,
    explicitTargetPublicationType: previous.targetPublicationType,
    plannedSourceKinds: [...previous.plannedSourceKinds],
    sourceAssets: update.sourceAssets,
    targetPlatforms: [...previous.targetPlatforms],
    approvedIdea: { ...previous.approvedIdea },
    shootingSessionId: previous.shootingSessionId,
    publicationObjective: previous.publicationObjective,
    scheduledPublicationTime: previous.scheduledPublicationTime,
    priority: previous.priority,
    deadline: previous.deadline,
    compositionIntent: { ...previous.compositionIntent },
    audioIntent: { ...previous.audioIntent },
    subtitleIntent: { ...previous.subtitleIntent },
    captionCopyId: previous.captionCopyId,
    publicationStatus: previous.publicationStatus,
  };
  return createContentItemSnapshotV2(nextInput, previous.targetPublicationTypeSource);
}
import { canonicalHashV2, deepFreezeV2 } from "./canonical-hash-v2";

