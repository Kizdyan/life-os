import { describe, expect, it, vi } from "vitest";
import type { ProcessedVideoResult } from "../../persona-video/src/contracts";
import {
  processPersonaShootingResult,
  type PersistedShootingBriefRef,
  type PersonaIdeaRef,
  type PersonaShootingResultRef,
  type PersonaVideoProcessingRecord,
} from "./persona-video-bridge";

const idea: PersonaIdeaRef = {
  id: "idea-1",
  projectId: "project-1",
  channel: "instagram",
  goal: "Показать рабочий процесс",
};

const brief: PersistedShootingBriefRef = {
  id: "brief-1",
  ideaId: idea.id,
  projectId: idea.projectId,
  revision: 3,
  persistedAt: "2026-10-06T12:00:00.000Z",
};

const shootingResult: PersonaShootingResultRef = {
  id: "shoot-1",
  shootingBriefId: brief.id,
  localInputPath: "C:\\captures\\take 1.mp4",
  asset: {
    id: "asset-1",
    provider: "local",
    providerId: null,
    providerPath: "/Inbox/take 1.mp4",
    contentHash: "source-hash",
    mimeType: "video/mp4",
    source: "own_raw",
    section: "inbox",
    status: "ingested",
    projectId: idea.projectId,
    createdAt: null,
    importedAt: "2026-10-06T12:01:00.000Z",
    provenance: {
      originalProviderPath: "/Inbox/take 1.mp4",
      originalProviderId: null,
      destructiveMoveVerified: false,
    },
  },
};

describe("processPersonaShootingResult", () => {
  it("processes a correlated shooting result, persists the technical record and returns a Content Factory handoff", async () => {
    const processed = processedResult();
    const processor = vi.fn(async () => processed);
    const saved: PersonaVideoProcessingRecord[] = [];

    const result = await processPersonaShootingResult({
      idea,
      shootingBrief: brief,
      shootingResult,
      outputRoot: "C:\\renders\\persona-video",
      processVideo: processor,
      processingStore: { save: async (record) => void saved.push(record) },
      now: () => "2026-10-06T12:02:00.000Z",
    });

    expect(processor).toHaveBeenCalledWith({
      inputPath: shootingResult.localInputPath,
      outputRoot: "C:\\renders\\persona-video",
    });
    expect(saved).toEqual([
      expect.objectContaining({
        ideaId: idea.id,
        shootingBriefId: brief.id,
        shootingBriefRevision: 3,
        shootingResultId: shootingResult.id,
        sourceAssetId: shootingResult.asset.id,
        runId: processed.runId,
        reportPath: processed.reportPath,
        status: "processed",
      }),
    ]);
    expect(result.contentFactoryHandoff).toMatchObject({
      projectId: idea.projectId,
      assetIds: [shootingResult.asset.id],
      channel: "instagram",
      goal: idea.goal,
      styleMemoryNotes: [],
      lifeOsContext: {
        personaVideo: {
          runId: processed.runId,
          reportPath: processed.reportPath,
          platformOutputs: [
            { presetId: "instagram-reels", path: "C:\\runs\\instagram-reels.mp4" },
          ],
        },
      },
    });
    expect(result.processedVideo).toBe(processed);
  });

  it("rejects uncorrelated or non-persisted inputs before invoking the engine", async () => {
    const processor = vi.fn(async () => processedResult());
    const save = vi.fn();

    await expect(
      processPersonaShootingResult({
        idea,
        shootingBrief: { ...brief, persistedAt: "" },
        shootingResult,
        outputRoot: "runs",
        processVideo: processor,
        processingStore: { save },
      }),
    ).rejects.toThrow("persisted shooting brief");

    await expect(
      processPersonaShootingResult({
        idea,
        shootingBrief: brief,
        shootingResult: { ...shootingResult, shootingBriefId: "different-brief" },
        outputRoot: "runs",
        processVideo: processor,
        processingStore: { save },
      }),
    ).rejects.toThrow("Shooting result does not belong");
    expect(processor).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

function processedResult(): ProcessedVideoResult {
  return {
    runId: "run-1",
    runPath: "C:\\runs\\run-1",
    inputPath: shootingResult.localInputPath,
    inputSha256: "source-hash",
    reportPath: "C:\\runs\\run-1\\report.json",
    platformOutputs: [
      {
        presetId: "instagram-reels",
        path: "C:\\runs\\instagram-reels.mp4",
        metadata: {} as ProcessedVideoResult["metadata"],
      },
    ],
  } as ProcessedVideoResult;
}
