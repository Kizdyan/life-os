import type { ExportPreset, PipelineStage, ReframeInstruction } from "./contracts";
import type { VideoProcessingRequest } from "./pipeline";
import type { TranscriptProvider } from "./transcription";

export interface PersonaShootingResultVideoRequest {
  ideaId: string;
  shootingResultId: string;
  assetId: string;
  localInputPath: string;
  outputRoot: string;
  transcriptProvider?: TranscriptProvider | null;
  reframeInstruction?: ReframeInstruction;
  exportPresets?: ExportPreset[];
  onProgress?: (stage: PipelineStage) => void;
}

/**
 * Maps the future Persona boundary to the isolated engine contract. Persona owns
 * correlation identifiers; the video engine receives only processing inputs.
 */
export function toVideoProcessingRequest(
  input: PersonaShootingResultVideoRequest,
): VideoProcessingRequest {
  const request: VideoProcessingRequest = {
    inputPath: input.localInputPath,
    outputRoot: input.outputRoot,
  };
  if (input.transcriptProvider !== undefined) {
    request.transcriptProvider = input.transcriptProvider;
  }
  if (input.reframeInstruction !== undefined) {
    request.reframeInstruction = input.reframeInstruction;
  }
  if (input.exportPresets !== undefined) {
    request.exportPresets = input.exportPresets;
  }
  if (input.onProgress !== undefined) {
    request.onProgress = input.onProgress;
  }
  return request;
}
