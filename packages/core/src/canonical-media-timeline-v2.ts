import { canonicalHashV2, deepFreezeV2 } from "./canonical-hash-v2";
import type { AssetDescriptorV2, CanonicalContentItemV2, TargetPublicationType } from "./content-format-v2";

export const MEDIA_QA_POLICY_VERSION = "media-v2.1" as const;
export type CompositionModeV2 = "subject_reframe" | "animated_reframe" | "contain_background" | "crop" | "layout_composite";
export interface CropMeasurementV2 { horizontal: number; vertical: number; area: number }
export interface CompositionEvidenceV2 { producer: string; version: string; confidence: number; subjectClipped: boolean; safeZoneClipped: boolean }
export interface CompositionDecisionV2 {
  mode: CompositionModeV2;
  evidence?: CompositionEvidenceV2;
  cropRegion?: { x: number; y: number; width: number; height: number };
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
export type RequiredMediaOperationV2 = "video_timeline" | "still_image" | "slide_layout" | "subtitles" | "audio_normalization" | "photo_timeline";
interface BaseMediaPlanV2 {
  schemaVersion: 2;
  lineage: MediaPlanLineageV2;
  canvas: { width: number; height: number; displayAspectRatio: string };
  safeZones: Array<{ name: string; x: number; y: number; width: number; height: number }>;
  requiredOperations: RequiredMediaOperationV2[];
  outputProfile: { codec: "h264" | "jpeg" | "png"; platformSafeAreaProfile: string };
  outputIntent: { preserveSourceDetail: boolean; maxEncodeGenerations: 1; allowUpscaleQualityClaim: false };
  preflight: MediaPreflightV2;
}
export interface VideoTimelineV2 extends BaseMediaPlanV2 {
  kind: "video_timeline";
  timebase: "milliseconds";
  targetDurationMs: number;
  clips: Array<{ mediaAssetId: string; sourceKind: "video" | "photo"; inMs: number; outMs: number; speed: number; order: number; composition: CompositionDecisionV2 }>;
  composition: { mode: CompositionModeV2; coordinateSpace: "normalized_after_rotation_and_sar" };
  audio: { normalizeSpeech: boolean; music: "none" | "optional" | "required" };
  subtitles: { enabled: boolean; language: string | null };
}
export interface PhotoPlanV2 extends BaseMediaPlanV2 { kind: "photo_plan"; photo: { mediaAssetId: string; fit: "contain" | "safe_crop" } }
export interface CarouselPlanV2 extends BaseMediaPlanV2 { kind: "carousel_plan"; slides: Array<{ mediaAssetId: string; order: number; fit: "contain" | "safe_crop" }> }
export type CanonicalMediaPlanV2 = VideoTimelineV2 | PhotoPlanV2 | CarouselPlanV2;

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const EMPTY_CROP: CropMeasurementV2 = { horizontal: 0, vertical: 0, area: 0 };

function rotatedSize(source: Pick<AssetDescriptorV2, "width" | "height" | "rotationDegrees"> & Partial<Pick<AssetDescriptorV2, "sampleAspectRatio">>) {
  const sar = source.sampleAspectRatio ? source.sampleAspectRatio.numerator / source.sampleAspectRatio.denominator : 1;
  const displayWidth = source.width * sar;
  return source.rotationDegrees === 90 || source.rotationDegrees === 270 ? { width: source.height, height: displayWidth } : { width: displayWidth, height: source.height };
}

export function measureCoverCropV2(
  source: Pick<AssetDescriptorV2, "width" | "height" | "rotationDegrees"> & Partial<Pick<AssetDescriptorV2, "sampleAspectRatio">>,
  target: { width: number; height: number },
): CropMeasurementV2 {
  const normalized = rotatedSize(source);
  const sourceRatio = normalized.width / normalized.height;
  const targetRatio = target.width / target.height;
  const horizontal = sourceRatio > targetRatio ? 1 - targetRatio / sourceRatio : 0;
  const vertical = sourceRatio < targetRatio ? 1 - sourceRatio / targetRatio : 0;
  const clean = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
  return { horizontal: clean(horizontal), vertical: clean(vertical), area: clean(1 - (1 - horizontal) * (1 - vertical)) };
}

function canvasFor(type: TargetPublicationType): BaseMediaPlanV2["canvas"] {
  return type === "reel" || type === "story" ? { width: 1080, height: 1920, displayAspectRatio: "9:16" } : { width: 1080, height: 1350, displayAspectRatio: "4:5" };
}

function adaptiveCanvasFor(item: CanonicalContentItemV2): BaseMediaPlanV2["canvas"] {
  const standard = canvasFor(item.targetPublicationType);
  let factor = 1;
  for (const source of item.sourceAssets) {
    const display = rotatedSize(source);
    const renderScale = Math.min(standard.width / display.width, standard.height / display.height);
    if (renderScale > 1) factor = Math.min(factor, 1 / renderScale);
  }
  if (factor === 1) return standard;
  const videoShape = item.targetPublicationType === "reel" || item.targetPublicationType === "story";
  const widthUnit = videoShape ? 18 : 8;
  const width = Math.max(widthUnit, Math.floor(standard.width * factor / widthUnit) * widthUnit);
  const height = width * (videoShape ? 16 / 9 : 5 / 4);
  return { width, height, displayAspectRatio: standard.displayAspectRatio };
}

function applyResolutionGate(preflight: MediaPreflightV2, canvas: BaseMediaPlanV2["canvas"], type: TargetPublicationType): MediaPreflightV2 {
  const minimum = type === "reel" || type === "story" ? { width: 360, height: 640 } : { width: 320, height: 400 };
  if (canvas.width >= minimum.width && canvas.height >= minimum.height) return preflight;
  return { ...preflight, actionable: false, qualityGate: "QUALITY_DEGRADED", reasons: [...preflight.reasons, "resolution_below_platform_minimum"] };
}

function lineage(item: CanonicalContentItemV2, timelineVersion: number): MediaPlanLineageV2 {
  if (!Number.isSafeInteger(timelineVersion) || timelineVersion < 1) throw new Error("timelineVersion must be positive");
  return {
    contentItemId: item.contentItemId,
    contentRevision: item.revision,
    contentRevisionHash: item.revisionHash,
    targetPublicationType: item.targetPublicationType,
    approvedIdeaId: item.approvedIdea.ideaId,
    approvedIdeaVersion: item.approvedIdea.version,
    sourceAssets: item.sourceAssets.map(({ mediaAssetId, contentHash }) => ({ mediaAssetId, contentHash })),
    timelineVersion,
    timelineHash: "0".repeat(64),
    qaPolicyVersion: MEDIA_QA_POLICY_VERSION,
  };
}

function validateEvidence(decision: CompositionDecisionV2, reasons: string[]): void {
  const evidence = decision.evidence;
  if (!evidence) return;
  if (!evidence.producer.trim() || !evidence.version.trim() || !Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) reasons.push("composition_evidence_invalid");
  if (evidence.subjectClipped) reasons.push("subject_clipped");
  if (evidence.safeZoneClipped) reasons.push("safe_zone_clipped");
}

function cropPreflight(source: AssetDescriptorV2 | undefined, canvas: BaseMediaPlanV2["canvas"], decision: CompositionDecisionV2): MediaPreflightV2 {
  const reasons: string[] = [];
  validateEvidence(decision, reasons);
  let measuredDiscard = EMPTY_CROP;
  if (source && decision.mode === "crop") {
    const coverCrop = measureCoverCropV2(source, canvas);
    measuredDiscard = decision.cropRegion
      ? { horizontal: 1 - decision.cropRegion.width, vertical: 1 - decision.cropRegion.height, area: 1 - decision.cropRegion.width * decision.cropRegion.height }
      : coverCrop;
    const destructive = measuredDiscard.horizontal > 0.2 || measuredDiscard.vertical > 0.2 || measuredDiscard.area > 0.3;
    if (measuredDiscard.area > 0 && !decision.evidence) reasons.push("subject_evidence_missing");
    if (measuredDiscard.area > 0 && !decision.cropRegion) reasons.push("crop_region_missing");
    if (decision.cropRegion) {
      const { x, y, width, height } = decision.cropRegion;
      if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) reasons.push("crop_region_invalid");
      else {
        const display = rotatedSize(source);
        const roiRatio = width * display.width / (height * display.height);
        const targetRatio = canvas.width / canvas.height;
        if (Math.abs(roiRatio - targetRatio) / targetRatio > 0.01) reasons.push("crop_region_aspect_mismatch");
      }
    }
    if (destructive && (!decision.evidence || decision.evidence.confidence < 0.9)) reasons.push("destructive_crop_unverified");
  }
  const uniqueReasons = [...new Set(reasons)];
  const actionable = uniqueReasons.length === 0;
  return { cropGate: actionable ? "CROP_SAFE" : "CROP_REVIEW_REQUIRED", qualityGate: actionable ? "QUALITY_PASS" : "QUALITY_DEGRADED", actionable, measuredDiscard, reasons: uniqueReasons };
}

function aggregatePreflight(entries: MediaPreflightV2[]): MediaPreflightV2 {
  const reasons = [...new Set(entries.flatMap((entry) => entry.reasons))];
  const actionable = entries.every((entry) => entry.actionable);
  return {
    cropGate: actionable ? "CROP_SAFE" : "CROP_REVIEW_REQUIRED",
    qualityGate: actionable ? "QUALITY_PASS" : "QUALITY_DEGRADED",
    actionable,
    measuredDiscard: {
      horizontal: Math.max(...entries.map((entry) => entry.measuredDiscard.horizontal), 0),
      vertical: Math.max(...entries.map((entry) => entry.measuredDiscard.vertical), 0),
      area: Math.max(...entries.map((entry) => entry.measuredDiscard.area), 0),
    },
    reasons,
  };
}

function planHashPayload(plan: CanonicalMediaPlanV2): unknown { return { ...plan, lineage: { ...plan.lineage, timelineHash: undefined } }; }
function finalizePlan(plan: CanonicalMediaPlanV2, expectedHash?: string): CanonicalMediaPlanV2 {
  const timelineHash = canonicalHashV2(planHashPayload(plan));
  if (expectedHash && (!HASH_PATTERN.test(expectedHash) || expectedHash !== timelineHash)) throw new Error("timelineHash does not match canonical media plan");
  return deepFreezeV2({ ...plan, lineage: { ...plan.lineage, timelineHash } });
}

export function buildCanonicalMediaPlanV2(
  item: CanonicalContentItemV2,
  options: { timelineVersion: number; timelineHash?: string; compositionDecision?: CompositionDecisionV2; compositionDecisions?: Record<string, CompositionDecisionV2> },
): CanonicalMediaPlanV2 {
  if (item.sourceAssets.length === 0) throw new Error("Captured source assets are required to build a media plan");
  const canvas = adaptiveCanvasFor(item);
  const base = {
    schemaVersion: 2 as const,
    lineage: lineage(item, options.timelineVersion),
    canvas,
    safeZones: [{ name: "platform_ui", x: 0.08, y: 0.08, width: 0.84, height: 0.76 }],
    outputIntent: { preserveSourceDetail: true, maxEncodeGenerations: 1 as const, allowUpscaleQualityClaim: false as const },
  };
  if (item.targetPublicationType === "photo_post") {
    if (item.sourceAssets.length !== 1 || item.sourceAssets[0].kind !== "photo") throw new Error("photo_post requires exactly one photo asset");
    return finalizePlan({ ...base, kind: "photo_plan", requiredOperations: ["still_image"], outputProfile: { codec: "jpeg", platformSafeAreaProfile: "feed-4x5-v1" }, photo: { mediaAssetId: item.sourceAssets[0].mediaAssetId, fit: "contain" }, preflight: applyResolutionGate(cropPreflight(undefined, canvas, { mode: "contain_background" }), canvas, item.targetPublicationType) }, options.timelineHash);
  }
  if (item.targetPublicationType === "carousel_post") {
    if (item.sourceAssets.some((asset) => asset.kind === "video")) throw new Error("carousel_post cannot use a video timeline");
    return finalizePlan({ ...base, kind: "carousel_plan", requiredOperations: ["slide_layout"], outputProfile: { codec: "png", platformSafeAreaProfile: "carousel-feed-v1" }, slides: item.sourceAssets.map((asset, order) => ({ mediaAssetId: asset.mediaAssetId, order, fit: "contain" as const })), preflight: applyResolutionGate(cropPreflight(undefined, canvas, { mode: "contain_background" }), canvas, item.targetPublicationType) }, options.timelineHash);
  }
  if (item.sourceAssets.some((asset) => asset.kind === "text_slide")) throw new Error(`${item.targetPublicationType} video timeline cannot contain text_slide assets`);

  const decisions = item.sourceAssets.map((source) => {
    const crop = measureCoverCropV2(source, canvas);
    const safeForAutomaticCrop = crop.area === 0;
    return options.compositionDecisions?.[source.mediaAssetId] ?? options.compositionDecision ?? { mode: safeForAutomaticCrop ? "crop" as const : "contain_background" as const };
  });
  const requiredOperations: RequiredMediaOperationV2[] = ["video_timeline"];
  if (item.subtitleIntent.enabled) requiredOperations.push("subtitles");
  if (item.audioIntent.normalizeSpeech) requiredOperations.push("audio_normalization");
  if (item.sourceAssets.some((asset) => asset.kind === "photo")) requiredOperations.push("photo_timeline");
  const clips = item.sourceAssets.map((source, order) => ({ mediaAssetId: source.mediaAssetId, sourceKind: source.kind as "video" | "photo", inMs: 0, outMs: source.kind === "video" ? source.durationMs! : 3_000, speed: 1, order, composition: decisions[order] }));
  const preflight = aggregatePreflight(item.sourceAssets.map((source, index) => cropPreflight(source, canvas, decisions[index])));
  const totalDurationMs = clips.reduce((sum, clip) => sum + (clip.outMs - clip.inMs) / clip.speed, 0);
  const durationLimitMs = item.targetPublicationType === "story" ? 60_000 : 90_000;
  if (totalDurationMs > durationLimitMs || totalDurationMs < 1_000) {
    preflight.actionable = false;
    preflight.qualityGate = "QUALITY_DEGRADED";
    preflight.reasons.push(totalDurationMs > durationLimitMs ? "duration_exceeds_platform_limit" : "duration_below_platform_minimum");
  }
  const resolutionPreflight = applyResolutionGate(preflight, canvas, item.targetPublicationType);
  const commonMode = decisions.every((decision) => decision.mode === decisions[0].mode) ? decisions[0].mode : "layout_composite";
  return finalizePlan({
    ...base,
    kind: "video_timeline",
    requiredOperations,
    outputProfile: { codec: "h264", platformSafeAreaProfile: item.targetPublicationType === "story" ? "story-v1" : "short-video-v1" },
    timebase: "milliseconds",
    targetDurationMs: totalDurationMs,
    clips,
    composition: { mode: commonMode, coordinateSpace: "normalized_after_rotation_and_sar" },
    audio: { normalizeSpeech: item.audioIntent.normalizeSpeech, music: item.audioIntent.music ?? "optional" },
    subtitles: { ...item.subtitleIntent },
    preflight: resolutionPreflight,
  }, options.timelineHash);
}

export function validateCanonicalMediaPlanV2(item: CanonicalContentItemV2, plan: CanonicalMediaPlanV2): void {
  if (plan.lineage.contentItemId !== item.contentItemId || plan.lineage.contentRevision !== item.revision || plan.lineage.contentRevisionHash !== item.revisionHash) throw new Error("Content lineage drift detected");
  if (plan.lineage.targetPublicationType !== item.targetPublicationType) throw new Error("Publication type drift detected");
  if (plan.lineage.approvedIdeaId !== item.approvedIdea.ideaId || plan.lineage.approvedIdeaVersion !== item.approvedIdea.version) throw new Error("Approved idea lineage drift detected");
  if (plan.lineage.qaPolicyVersion !== MEDIA_QA_POLICY_VERSION) throw new Error("QA policy drift detected");
  const expectedKind = item.targetPublicationType === "reel" || item.targetPublicationType === "story" ? "video_timeline" : item.targetPublicationType === "photo_post" ? "photo_plan" : "carousel_plan";
  if (plan.kind !== expectedKind) throw new Error("Cross-format media plan detected");
  const expectedSources = item.sourceAssets.map(({ mediaAssetId, contentHash }) => ({ mediaAssetId, contentHash }));
  if (JSON.stringify(plan.lineage.sourceAssets) !== JSON.stringify(expectedSources)) throw new Error("Source lineage drift detected");
  const sourceIds = new Set(item.sourceAssets.map((asset) => asset.mediaAssetId));
  const references = plan.kind === "video_timeline" ? plan.clips.map((clip) => clip.mediaAssetId) : plan.kind === "photo_plan" ? [plan.photo.mediaAssetId] : plan.slides.map((slide) => slide.mediaAssetId);
  if (references.length !== sourceIds.size || new Set(references).size !== references.length || references.some((reference) => !sourceIds.has(reference))) throw new Error("Plan source references do not match canonical assets");
  if (plan.kind === "video_timeline") {
    for (const clip of plan.clips) {
      const source = item.sourceAssets.find((asset) => asset.mediaAssetId === clip.mediaAssetId)!;
      const maximum = source.kind === "video" ? source.durationMs! : 3_000;
      if (!Number.isSafeInteger(clip.inMs) || !Number.isSafeInteger(clip.outMs) || clip.inMs < 0 || clip.outMs <= clip.inMs || clip.outMs > maximum || !Number.isFinite(clip.speed) || clip.speed <= 0) throw new Error("Video clip bounds are invalid");
    }
    const recomputed = aggregatePreflight(item.sourceAssets.map((source) => {
      const clip = plan.clips.find((entry) => entry.mediaAssetId === source.mediaAssetId)!;
      return cropPreflight(source, plan.canvas, clip.composition);
    }));
    const validationDurationLimitMs = item.targetPublicationType === "story" ? 60_000 : 90_000;
    if (plan.targetDurationMs > validationDurationLimitMs || plan.targetDurationMs < 1_000) {
      recomputed.actionable = false; recomputed.qualityGate = "QUALITY_DEGRADED";
      recomputed.reasons.push(plan.targetDurationMs > validationDurationLimitMs ? "duration_exceeds_platform_limit" : "duration_below_platform_minimum");
    }
    const resolutionChecked = applyResolutionGate(recomputed, plan.canvas, item.targetPublicationType);
    recomputed.actionable = resolutionChecked.actionable; recomputed.qualityGate = resolutionChecked.qualityGate; recomputed.reasons = resolutionChecked.reasons;
    if (JSON.stringify(recomputed) !== JSON.stringify(plan.preflight)) throw new Error("Plan preflight drift detected");
  }
  if (canonicalHashV2(planHashPayload(plan)) !== plan.lineage.timelineHash) throw new Error("Timeline hash mismatch");
  const rebuilt = buildCanonicalMediaPlanV2(item, {
    timelineVersion: plan.lineage.timelineVersion,
    compositionDecisions: plan.kind === "video_timeline"
      ? Object.fromEntries(plan.clips.map((clip) => [clip.mediaAssetId, clip.composition]))
      : undefined,
  });
  if (rebuilt.lineage.timelineHash !== plan.lineage.timelineHash) throw new Error("Canonical media plan drift detected");
}
