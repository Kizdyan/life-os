import type {
  AssetDescriptorV2,
  CanonicalContentItemV2,
  TargetPublicationType,
} from "./content-format-v2";

export const MEDIA_QA_POLICY_VERSION = "media-v2.1" as const;

export type CompositionModeV2 =
  | "subject_reframe"
  | "animated_reframe"
  | "contain_background"
  | "crop"
  | "layout_composite";

export interface CropMeasurementV2 {
  horizontal: number;
  vertical: number;
  area: number;
}

export interface CompositionEvidenceV2 {
  producer: string;
  version: string;
  confidence: number;
  subjectClipped: boolean;
  safeZoneClipped: boolean;
}

export interface CompositionDecisionV2 {
  mode: CompositionModeV2;
  evidence?: CompositionEvidenceV2;
}

export interface MediaPlanLineageV2 {
  contentItemId: string;
  contentRevision: number;
  contentRevisionHash: string;
  targetPublicationType: TargetPublicationType;
  approvedIdeaId: string;
  approvedIdeaVersion: number;
  sourceAssets: Array<{ mediaAssetId: string; contentHash: string }>;
  timelineVersion: number;
  timelineHash: string;
  qaPolicyVersion: typeof MEDIA_QA_POLICY_VERSION;
}

export interface MediaPreflightV2 {
  cropGate: "CROP_SAFE" | "CROP_REVIEW_REQUIRED";
  qualityGate: "QUALITY_PASS" | "QUALITY_DEGRADED" | "OUTPUT_INVALID";
  actionable: boolean;
  measuredDiscard: CropMeasurementV2;
  reasons: string[];
}

interface BaseMediaPlanV2 {
  schemaVersion: 2;
  lineage: MediaPlanLineageV2;
  canvas: { width: number; height: number; displayAspectRatio: string };
  safeZones: Array<{ name: string; x: number; y: number; width: number; height: number }>;
  outputIntent: { preserveSourceDetail: boolean; maxEncodeGenerations: 1; allowUpscaleQualityClaim: false };
  preflight: MediaPreflightV2;
}

export interface VideoTimelineV2 extends BaseMediaPlanV2 {
  kind: "video_timeline";
  timebase: "milliseconds";
  targetDurationMs: number;
  clips: Array<{
    mediaAssetId: string;
    sourceKind: "video" | "photo";
    inMs: number;
    outMs: number;
    speed: number;
    order: number;
  }>;
  composition: { mode: CompositionModeV2; coordinateSpace: "normalized_after_rotation_and_sar" };
  audio: { normalizeSpeech: boolean; music: "none" | "optional" | "required" };
  subtitles: { enabled: boolean; language: string | null };
}

export interface PhotoPlanV2 extends BaseMediaPlanV2 {
  kind: "photo_plan";
  photo: { mediaAssetId: string; fit: "contain" | "safe_crop" };
}

export interface CarouselPlanV2 extends BaseMediaPlanV2 {
  kind: "carousel_plan";
  slides: Array<{ mediaAssetId: string; order: number; fit: "contain" | "safe_crop" }>;
}

export type CanonicalMediaPlanV2 = VideoTimelineV2 | PhotoPlanV2 | CarouselPlanV2;

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const EMPTY_CROP: CropMeasurementV2 = { horizontal: 0, vertical: 0, area: 0 };

function rotatedSize(source: Pick<AssetDescriptorV2, "width" | "height" | "rotationDegrees">): { width: number; height: number } {
  return source.rotationDegrees === 90 || source.rotationDegrees === 270
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

export function measureCoverCropV2(
  source: Pick<AssetDescriptorV2, "width" | "height" | "rotationDegrees">,
  target: { width: number; height: number },
): CropMeasurementV2 {
  const normalized = rotatedSize(source);
  const sourceRatio = normalized.width / normalized.height;
  const targetRatio = target.width / target.height;
  let horizontal = 0;
  let vertical = 0;
  if (sourceRatio > targetRatio) horizontal = 1 - targetRatio / sourceRatio;
  if (sourceRatio < targetRatio) vertical = 1 - sourceRatio / targetRatio;
  const round = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
  horizontal = round(horizontal);
  vertical = round(vertical);
  return { horizontal, vertical, area: round(1 - (1 - horizontal) * (1 - vertical)) };
}

function canvasFor(type: TargetPublicationType): BaseMediaPlanV2["canvas"] {
  if (type === "reel" || type === "story") return { width: 1080, height: 1920, displayAspectRatio: "9:16" };
  if (type === "photo_post") return { width: 1080, height: 1350, displayAspectRatio: "4:5" };
  return { width: 1080, height: 1350, displayAspectRatio: "4:5" };
}

function lineage(item: CanonicalContentItemV2, timelineVersion: number, timelineHash: string): MediaPlanLineageV2 {
  if (!Number.isSafeInteger(timelineVersion) || timelineVersion < 1) throw new Error("timelineVersion must be positive");
  if (!HASH_PATTERN.test(timelineHash)) throw new Error("timelineHash must be a 64-character hex digest");
  return {
    contentItemId: item.contentItemId,
    contentRevision: item.revision,
    contentRevisionHash: item.revisionHash,
    targetPublicationType: item.targetPublicationType,
    approvedIdeaId: item.approvedIdea.ideaId,
    approvedIdeaVersion: item.approvedIdea.version,
    sourceAssets: item.sourceAssets.map(({ mediaAssetId, contentHash }) => ({ mediaAssetId, contentHash })),
    timelineVersion,
    timelineHash,
    qaPolicyVersion: MEDIA_QA_POLICY_VERSION,
  };
}

function cropPreflight(
  source: AssetDescriptorV2 | undefined,
  canvas: BaseMediaPlanV2["canvas"],
  decision: CompositionDecisionV2,
): MediaPreflightV2 {
  if (!source || decision.mode !== "crop") {
    return { cropGate: "CROP_SAFE", qualityGate: "QUALITY_PASS", actionable: true, measuredDiscard: EMPTY_CROP, reasons: [] };
  }
  const measuredDiscard = measureCoverCropV2(source, canvas);
  const destructive = measuredDiscard.horizontal > 0.2
    || measuredDiscard.vertical > 0.2
    || measuredDiscard.area > 0.3;
  const evidence = decision.evidence;
  const reasons: string[] = [];
  if (evidence?.subjectClipped) reasons.push("subject_clipped");
  if (evidence?.safeZoneClipped) reasons.push("safe_zone_clipped");
  if (measuredDiscard.area > 0 && !evidence) reasons.push("subject_evidence_missing");
  if (destructive && (!evidence || evidence.confidence < 0.9 || !evidence.producer.trim() || !evidence.version.trim())) {
    reasons.push("destructive_crop_unverified");
  }
  const blocked = reasons.length > 0;
  return {
    cropGate: blocked ? "CROP_REVIEW_REQUIRED" : "CROP_SAFE",
    qualityGate: blocked ? "QUALITY_DEGRADED" : "QUALITY_PASS",
    actionable: !blocked,
    measuredDiscard,
    reasons,
  };
}

export function buildCanonicalMediaPlanV2(
  item: CanonicalContentItemV2,
  options: {
    timelineVersion: number;
    timelineHash: string;
    compositionDecision?: CompositionDecisionV2;
  },
): CanonicalMediaPlanV2 {
  if (item.sourceAssets.length === 0) throw new Error("Captured source assets are required to build a media plan");
  const canvas = canvasFor(item.targetPublicationType);
  const base = {
    schemaVersion: 2 as const,
    lineage: lineage(item, options.timelineVersion, options.timelineHash),
    canvas,
    safeZones: [{ name: "platform_ui", x: 0.08, y: 0.08, width: 0.84, height: 0.76 }],
    outputIntent: { preserveSourceDetail: true, maxEncodeGenerations: 1 as const, allowUpscaleQualityClaim: false as const },
  };

  if (item.targetPublicationType === "photo_post") {
    if (item.sourceAssets.length !== 1 || item.sourceAssets[0].kind !== "photo") {
      throw new Error("photo_post requires exactly one photo asset");
    }
    return { ...base, kind: "photo_plan", photo: { mediaAssetId: item.sourceAssets[0].mediaAssetId, fit: "contain" }, preflight: cropPreflight(undefined, canvas, { mode: "contain_background" }) };
  }

  if (item.targetPublicationType === "carousel_post") {
    if (item.sourceAssets.some((asset) => asset.kind === "video")) throw new Error("carousel_post cannot use a video timeline");
    return {
      ...base,
      kind: "carousel_plan",
      slides: item.sourceAssets.map((asset, order) => ({ mediaAssetId: asset.mediaAssetId, order, fit: "contain" as const })),
      preflight: cropPreflight(undefined, canvas, { mode: "contain_background" }),
    };
  }

  if (item.sourceAssets.some((asset) => asset.kind === "text_slide")) {
    throw new Error(`${item.targetPublicationType} video timeline cannot contain text_slide assets`);
  }
  const source = item.sourceAssets[0];
  const inferredCrop = measureCoverCropV2(source, canvas);
  const defaultMode: CompositionModeV2 = inferredCrop.horizontal > 0.2
    || inferredCrop.vertical > 0.2
    || inferredCrop.area > 0.3
    ? "contain_background"
    : "crop";
  const composition = options.compositionDecision ?? { mode: defaultMode };
  const preflight = cropPreflight(source, canvas, composition);
  return {
    ...base,
    kind: "video_timeline",
    timebase: "milliseconds",
    targetDurationMs: item.targetPublicationType === "story" ? 15_000 : 30_000,
    clips: item.sourceAssets.map((asset, order) => ({
      mediaAssetId: asset.mediaAssetId,
      sourceKind: asset.kind as "video" | "photo",
      inMs: 0,
      outMs: asset.kind === "photo" ? 3_000 : 30_000,
      speed: 1,
      order,
    })),
    composition: { mode: composition.mode, coordinateSpace: "normalized_after_rotation_and_sar" },
    audio: { normalizeSpeech: item.audioIntent.normalizeSpeech, music: item.audioIntent.music ?? "optional" },
    subtitles: { ...item.subtitleIntent },
    preflight,
  };
}

export function validateCanonicalMediaPlanV2(item: CanonicalContentItemV2, plan: CanonicalMediaPlanV2): void {
  if (plan.lineage.contentItemId !== item.contentItemId
    || plan.lineage.contentRevision !== item.revision
    || plan.lineage.contentRevisionHash !== item.revisionHash) {
    throw new Error("Content lineage drift detected");
  }
  if (plan.lineage.targetPublicationType !== item.targetPublicationType) {
    throw new Error("Publication type drift detected");
  }
  if (plan.lineage.approvedIdeaId !== item.approvedIdea.ideaId
    || plan.lineage.approvedIdeaVersion !== item.approvedIdea.version) {
    throw new Error("Approved idea lineage drift detected");
  }
  const expectsVideo = item.targetPublicationType === "reel" || item.targetPublicationType === "story";
  const expectedKind = expectsVideo ? "video_timeline" : item.targetPublicationType === "photo_post" ? "photo_plan" : "carousel_plan";
  if (plan.kind !== expectedKind) throw new Error("Cross-format media plan detected");
}
