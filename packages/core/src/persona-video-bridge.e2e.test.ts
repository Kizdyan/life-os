import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processVideo } from "../../persona-video/src/pipeline";
import { createFixtureDirectory, createVideoFixture } from "../../persona-video/test/fixture";
import {
  processPersonaShootingResult,
  type PersonaVideoProcessingRecord,
} from "./persona-video-bridge";

describe("Persona to Content Factory video bridge real E2E", () => {
  it("processes a real shooting asset, persists provenance and creates the technical handoff", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({
      directory,
      fileName: "persona-shooting-result.mp4",
      durationSeconds: 2,
      audio: true,
    });
    const saved: PersonaVideoProcessingRecord[] = [];

    const result = await processPersonaShootingResult({
      idea: {
        id: "idea-e2e",
        projectId: "project-e2e",
        channel: "instagram",
        goal: "Подготовить технически корректный вертикальный материал",
      },
      shootingBrief: {
        id: "brief-e2e",
        ideaId: "idea-e2e",
        projectId: "project-e2e",
        revision: 1,
        persistedAt: "2026-10-06T12:00:00.000Z",
      },
      shootingResult: {
        id: "shoot-e2e",
        shootingBriefId: "brief-e2e",
        localInputPath: fixture.path,
        asset: {
          id: "asset-e2e",
          provider: "local",
          providerId: null,
          providerPath: fixture.path,
          contentHash: null,
          mimeType: "video/mp4",
          source: "own_raw",
          section: "inbox",
          status: "ingested",
          projectId: "project-e2e",
          createdAt: null,
          importedAt: "2026-10-06T12:01:00.000Z",
          provenance: {
            originalProviderPath: fixture.path,
            originalProviderId: null,
            destructiveMoveVerified: false,
          },
        },
      },
      outputRoot: join(directory, "persona-runs"),
      processVideo,
      processingStore: { save: async (record) => void saved.push(record) },
      now: () => "2026-10-06T12:02:00.000Z",
    });

    expect(result.processedVideo.qa.status).not.toBe("FAIL");
    expect(result.processedVideo.verticalMaster.metadata).toMatchObject({
      width: 1080,
      height: 1920,
      hasAudio: true,
    });
    expect(result.processedVideo.platformOutputs).toHaveLength(3);
    expect(saved).toEqual([result.processingRecord]);
    expect(result.contentFactoryHandoff.lifeOsContext).toMatchObject({
      personaVideo: {
        runId: result.processedVideo.runId,
        sourceAssetId: "asset-e2e",
      },
    });
  }, 120_000);
});
