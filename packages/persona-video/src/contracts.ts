export type PipelineStage =
  | "PROBING"
  | "QA"
  | "SEGMENTING"
  | "EDITING"
  | "CAPTIONS"
  | "AUDIO"
  | "REFRAMING"
  | "EXPORTING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED";

export type PipelineErrorCode =
  | "TOOL_NOT_FOUND"
  | "UNREADABLE_INPUT"
  | "UNSUPPORTED_INPUT"
  | "TECHNICAL_QA_FAILED"
  | "INVALID_TRANSCRIPT"
  | "PROCESS_FAILED"
  | "INVALID_OUTPUT"
  | "FILESYSTEM_ERROR"
  | "UNSUPPORTED_CAPABILITY";

export class VideoPipelineError extends Error {
  constructor(
    public readonly code: PipelineErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "VideoPipelineError";
  }
}

export interface ProcessRunOptions {
  cwd?: string;
  timeoutMs?: number;
  allowFailure?: boolean;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessResult>;
}

export type ProviderExecution = "LOCAL" | "EXTERNAL";

export type MediaCapability =
  | "TRANSCRIPTION"
  | "CAPTION_TIMING"
  | "LOUDNESS_NORMALIZATION"
  | "AUDIO_ENHANCEMENT";

export interface CapabilityProviderDescriptor {
  id: string;
  execution: ProviderExecution;
  capabilities: readonly MediaCapability[];
  quotaDependency: boolean;
  externalCostRequired: boolean;
}

export interface MediaToolPaths {
  ffmpegPath: string;
  ffprobePath: string;
  source: "explicit" | "environment" | "path" | "dev_dependency";
}

export type VideoOrientation = "portrait" | "landscape" | "square";

export interface VideoMetadata {
  inputPath: string;
  durationMs: number;
  width: number;
  height: number;
  orientation: VideoOrientation;
  fps: number;
  videoCodec: string;
  bitrate: number | null;
  hasAudio: boolean;
  audioCodec: string | null;
  fileSizeBytes: number;
  creationTime: string | null;
  rotationDegrees: number;
}

export type QaSeverity = "PASS" | "WARNING" | "FAIL";

export interface QaFinding {
  code: string;
  severity: QaSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface VideoTechnicalQA {
  status: QaSeverity;
  findings: QaFinding[];
  decodedSuccessfully: boolean;
}

export type SegmentSignalSource = "OBJECTIVE" | "EDITORIAL_AI" | "HUMAN_FEEDBACK";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

export interface Transcript {
  language: string | null;
  provider: string;
  confidence: number | null;
  limitations: string[];
  segments: TranscriptSegment[];
}

export interface VideoSegment {
  sourceStartMs: number;
  sourceEndMs: number;
  kind: "content" | "silence";
  signalSource: SegmentSignalSource;
  confidence: number;
}

export type EditAction = "KEEP" | "CUT" | "OPTIONAL";

export interface EditDecision {
  sourceStartMs: number;
  sourceEndMs: number;
  action: EditAction;
  reason: string;
  confidence: number;
  signalSource: SegmentSignalSource;
}

export interface EditDecisionList {
  version: 1;
  inputDurationMs: number;
  decisions: EditDecision[];
}

export interface AudioAnalysis {
  status: "available" | "no_audio";
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  integratedLoudnessLufs: number | null;
  truePeakDb: number | null;
  tooQuiet: boolean;
  clippingRisk: boolean;
}

export type ReframeInstruction =
  | { mode: "CENTER" }
  | { mode: "MANUAL_REGION"; x: number; y: number; width: number; height: number }
  | { mode: "FACE_AWARE" };

export function validateReframeInstruction(
  instruction: ReframeInstruction,
): asserts instruction is Exclude<ReframeInstruction, { mode: "FACE_AWARE" }> {
  if (instruction.mode === "FACE_AWARE") {
    throw new VideoPipelineError(
      "UNSUPPORTED_CAPABILITY",
      "FACE_AWARE reframing requires a real tracking adapter",
      { mode: instruction.mode },
    );
  }
  if (instruction.mode === "MANUAL_REGION") {
    const values = [instruction.x, instruction.y, instruction.width, instruction.height];
    if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new VideoPipelineError("UNSUPPORTED_INPUT", "Manual region values must be within 0..1");
    }
    if (
      instruction.width <= 0 ||
      instruction.height <= 0 ||
      instruction.x + instruction.width > 1 ||
      instruction.y + instruction.height > 1
    ) {
      throw new VideoPipelineError("UNSUPPORTED_INPUT", "Manual region must fit inside the frame");
    }
  }
}

export interface ExportPreset {
  id: "instagram-reels" | "youtube-shorts" | "vk-clips" | string;
  fileName: string;
  videoCodec: string;
  audioCodec: string;
  pixelFormat: string;
  extraArgs: string[];
}

export interface VerifiedMediaOutput {
  path: string;
  metadata: VideoMetadata;
}

export interface VerifiedAudioArtifact {
  path: string;
  durationMs: number;
  codec: string;
  sampleRateHz: number;
  channels: number;
}

export interface PlatformOutput extends VerifiedMediaOutput {
  presetId: string;
}

export interface ProcessedVideoResult {
  runId: string;
  runPath: string;
  inputPath: string;
  inputSha256: string;
  metadata: VideoMetadata;
  qa: VideoTechnicalQA;
  segments: VideoSegment[];
  editDecisionList: EditDecisionList;
  transcript: Transcript | null;
  captionsPath: string;
  audio: AudioAnalysis;
  roughCut: VerifiedMediaOutput;
  verticalMaster: VerifiedMediaOutput;
  platformOutputs: PlatformOutput[];
  reportPath: string;
  warnings: string[];
  toolVersions: { ffmpeg: string; ffprobe: string };
}
