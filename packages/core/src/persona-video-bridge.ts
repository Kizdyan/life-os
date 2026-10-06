import type { ProcessedVideoResult } from "../../persona-video/src/contracts";
import { toVideoProcessingRequest } from "../../persona-video/src/persona-adapter";
import type { VideoProcessingRequest } from "../../persona-video/src/pipeline";
import type { ContentFactory } from "./media-pipeline";
import type { MediaAsset } from "./media-brain";

export interface PersonaIdeaRef {
  id: string;
  projectId: string;
  channel: "instagram" | "youtube" | "other";
  goal: string;
}

export interface PersistedShootingBriefRef {
  id: string;
  ideaId: string;
  projectId: string;
  revision: number;
  persistedAt: string;
}

export interface PersonaShootingResultRef {
  id: string;
  shootingBriefId: string;
  asset: MediaAsset;
  localInputPath: string;
}

export interface PersonaVideoProcessingRecord {
  status: "processed";
  ideaId: string;
  shootingBriefId: string;
  shootingBriefRevision: number;
  shootingResultId: string;
  sourceAssetId: string;
  runId: string;
  runPath: string;
  reportPath: string;
  inputSha256: string;
  platformOutputs: Array<{ presetId: string; path: string }>;
  processedAt: string;
}

export interface PersonaVideoProcessingStore {
  save(record: PersonaVideoProcessingRecord): Promise<void>;
}

export type ContentFactoryVideoHandoff = Parameters<ContentFactory["createDraft"]>[0];

export async function processPersonaShootingResult(input: {
  idea: PersonaIdeaRef;
  shootingBrief: PersistedShootingBriefRef;
  shootingResult: PersonaShootingResultRef;
  outputRoot: string;
  processVideo: (request: VideoProcessingRequest) => Promise<ProcessedVideoResult>;
  processingStore: PersonaVideoProcessingStore;
  now?: () => string;
}): Promise<{
  processedVideo: ProcessedVideoResult;
  processingRecord: PersonaVideoProcessingRecord;
  contentFactoryHandoff: ContentFactoryVideoHandoff;
}> {
  validateBoundary(input.idea, input.shootingBrief, input.shootingResult);
  const request = toVideoProcessingRequest({
    ideaId: input.idea.id,
    shootingResultId: input.shootingResult.id,
    assetId: input.shootingResult.asset.id,
    localInputPath: input.shootingResult.localInputPath,
    outputRoot: input.outputRoot,
  });
  const processedVideo = await input.processVideo(request);
  const processingRecord: PersonaVideoProcessingRecord = {
    status: "processed",
    ideaId: input.idea.id,
    shootingBriefId: input.shootingBrief.id,
    shootingBriefRevision: input.shootingBrief.revision,
    shootingResultId: input.shootingResult.id,
    sourceAssetId: input.shootingResult.asset.id,
    runId: processedVideo.runId,
    runPath: processedVideo.runPath,
    reportPath: processedVideo.reportPath,
    inputSha256: processedVideo.inputSha256,
    platformOutputs: processedVideo.platformOutputs.map(({ presetId, path }) => ({
      presetId,
      path,
    })),
    processedAt: (input.now ?? (() => new Date().toISOString()))(),
  };
  await input.processingStore.save(processingRecord);

  return {
    processedVideo,
    processingRecord,
    contentFactoryHandoff: {
      projectId: input.idea.projectId,
      assetIds: [input.shootingResult.asset.id],
      channel: input.idea.channel,
      goal: input.idea.goal,
      styleMemoryNotes: [],
      lifeOsContext: {
        personaVideo: {
          ideaId: input.idea.id,
          shootingBriefId: input.shootingBrief.id,
          shootingResultId: input.shootingResult.id,
          sourceAssetId: input.shootingResult.asset.id,
          runId: processedVideo.runId,
          reportPath: processedVideo.reportPath,
          platformOutputs: processingRecord.platformOutputs,
        },
      },
    },
  };
}

function validateBoundary(
  idea: PersonaIdeaRef,
  brief: PersistedShootingBriefRef,
  result: PersonaShootingResultRef,
): void {
  if (!brief.persistedAt.trim() || !Number.isInteger(brief.revision) || brief.revision < 1) {
    throw new Error("Video processing requires a persisted shooting brief revision");
  }
  if (brief.ideaId !== idea.id || brief.projectId !== idea.projectId) {
    throw new Error("Shooting brief does not belong to the Persona idea");
  }
  if (result.shootingBriefId !== brief.id) {
    throw new Error("Shooting result does not belong to the persisted shooting brief");
  }
  if (result.asset.projectId && result.asset.projectId !== idea.projectId) {
    throw new Error("Media asset does not belong to the Persona project");
  }
  if (result.asset.source !== "own_raw") {
    throw new Error("Shooting result must reference an own_raw media asset");
  }
  if (result.asset.mimeType && !result.asset.mimeType.startsWith("video/")) {
    throw new Error("Shooting result media asset must be a video");
  }
}
