import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessedVideoResult } from "./contracts";
import { writeV0V1Comparison } from "./comparison";
import { createFixtureDirectory } from "../test/fixture";

describe("writeV0V1Comparison", () => {
  it("writes duration, cuts, captions, providers, loudness, geometry and input identity", async () => {
    const directory = await createFixtureDirectory();
    const outputPath = join(directory, "v0-v1-comparison.json");

    const comparison = await writeV0V1Comparison(
      resultFixture({ version: "v0", durationMs: 33_700, captioned: false, loudness: -29 }),
      resultFixture({ version: "v1", durationMs: 32_191, captioned: true, loudness: -16 }),
      outputPath,
    );

    expect(comparison).toMatchObject({
      inputSha256: "same-input-hash",
      inputUnchanged: true,
      duration: { v0Ms: 33_700, v1Ms: 32_191, deltaMs: -1_509 },
      removedRanges: {
        v0: [{ startMs: 31_891, endMs: 33_684, reason: "trailing_silence" }],
        v1: [{ startMs: 32_191, endMs: 33_700, reason: "micro_content_cleanup" }],
      },
      captions: {
        v0: "BLOCKED",
        v1: "DONE",
        providerUsed: "whisper-cpp-local",
      },
      loudness: { v0Lufs: -29, v1BeforeLufs: -29, v1AfterLufs: -16 },
      geometry: { v0: "1080x1920", v1: "1080x1920" },
    });
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(comparison);
  });

  it("rejects comparison across different source files", async () => {
    const directory = await createFixtureDirectory();
    const v0 = resultFixture({ version: "v0", durationMs: 1_000, captioned: false, loudness: -29 });
    const v1 = { ...resultFixture({ version: "v1", durationMs: 1_000, captioned: true, loudness: -16 }), inputSha256: "different" };

    await expect(
      writeV0V1Comparison(v0, v1, join(directory, "comparison.json")),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });
});

function resultFixture(input: {
  version: "v0" | "v1";
  durationMs: number;
  captioned: boolean;
  loudness: number;
}): ProcessedVideoResult {
  const v1 = input.version === "v1";
  return {
    inputSha256: "same-input-hash",
    roughCut: { path: `${input.version}-rough.mp4`, metadata: metadata(input.durationMs) },
    verticalMaster: { path: `${input.version}-vertical.mp4`, metadata: metadata(input.durationMs) },
    editDecisionList: {
      version: 1,
      inputDurationMs: 33_700,
      decisions: [
        {
          sourceStartMs: v1 ? 32_191 : 31_891,
          sourceEndMs: v1 ? 33_700 : 33_684,
          action: "CUT",
          reason: v1 ? "micro_content_cleanup" : "trailing_silence",
          confidence: 0.98,
          signalSource: "OBJECTIVE",
        },
      ],
    },
    transcript: input.captioned
      ? {
          language: "ru",
          provider: "whisper-cpp-local",
          confidence: 0.8,
          limitations: [],
          segments: [{ startMs: 0, endMs: 500, text: "Тест", confidence: 0.8 }],
        }
      : null,
    captionedMaster: input.captioned
      ? { path: "captioned.mp4", metadata: metadata(input.durationMs) }
      : null,
    transcriptProviderUsage: {
      providerUsed: input.captioned ? "whisper-cpp-local" : null,
      fallbackOccurred: false,
      fallbackReason: null,
      quotaDependency: false,
      localProcessing: input.captioned,
      externalCostRequired: false,
      attempts: [],
    },
    audio: {
      status: "available",
      meanVolumeDb: null,
      maxVolumeDb: null,
      integratedLoudnessLufs: input.loudness,
      truePeakDb: -2,
      tooQuiet: false,
      clippingRisk: false,
    },
    ...(v1
      ? {
          audioNormalization: {
            before: { integratedLoudnessLufs: -29 },
            after: { integratedLoudnessLufs: -16 },
          },
        }
      : {}),
  } as unknown as ProcessedVideoResult;
}

function metadata(durationMs: number) {
  return {
    inputPath: "video.mp4",
    durationMs,
    width: 1080,
    height: 1920,
    orientation: "portrait" as const,
    fps: 30,
    videoCodec: "h264",
    bitrate: null,
    hasAudio: true,
    audioCodec: "aac",
    fileSizeBytes: 100,
    creationTime: null,
    rotationDegrees: 0,
  };
}
