import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { processVideo } from "./pipeline";
import { probeVideo } from "./probe";
import { DeterministicTranscriptProvider } from "./transcription";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("persona video pipeline real E2E", () => {
  it("turns real input into verified vertical and platform outputs without mutating source", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({
      directory,
      fileName: "real-input.mp4",
      durationSeconds: 3,
      width: 640,
      height: 360,
      audio: true,
      leadingSilenceSeconds: 0.8,
    });
    const beforeHash = sha256(await readFile(fixture.path));
    const result = await processVideo({
      inputPath: fixture.path,
      outputRoot: join(directory, "runs"),
      transcriptProvider: new DeterministicTranscriptProvider({
        language: "ru",
        provider: "e2e-fixture",
        confidence: 1,
        limitations: [],
        segments: [
          {
            startMs: 1_200,
            endMs: 2_500,
            text: "Реальный проход конвейера",
            confidence: 1,
          },
        ],
      }),
      transcriptRequired: true,
    });

    expect(result.qa.status).not.toBe("FAIL");
    expect(result.platformOutputs.map((output) => output.presetId)).toEqual([
      "instagram-reels",
      "youtube-shorts",
      "vk-clips",
    ]);
    expect(sha256(await readFile(fixture.path))).toBe(beforeHash);
    expect(result.inputSha256).toBe(beforeHash);

    expect(result.transcriptProviderUsage).toMatchObject({
      providerUsed: "e2e-fixture",
      quotaDependency: false,
      localProcessing: true,
      externalCostRequired: false,
    });
    expect(result.audioNormalization).toMatchObject({
      before: { status: "available" },
      after: { status: "available", clippingRisk: false },
    });
    expect(result.platformOutputSource).toBe("captioned-vertical");
    const outputs = [
      result.roughCut,
      result.normalizedRoughCut,
      result.cleanMaster,
      result.captionedMaster!,
      ...result.platformOutputs,
    ];
    for (const output of outputs) {
      const metadata = await probeVideo({
        inputPath: output.path,
        ffprobePath: fixture.ffprobePath,
        runner: fixture.runner,
      });
      expect(metadata.durationMs).toBeGreaterThan(2_000);
      expect(metadata.durationMs).toBeLessThan(3_500);
      expect(metadata.hasAudio).toBe(true);
      if (basename(output.path) !== "rough-cut.mp4") {
        if (basename(output.path) !== "normalized-rough-cut.mp4") {
          expect([metadata.width, metadata.height]).toEqual([1080, 1920]);
        }
      }
      await expect(
        fixture.runner.run(
          fixture.ffmpegPath,
          ["-v", "error", "-i", output.path, "-f", "null", "-"],
          { timeoutMs: 120_000 },
        ),
      ).resolves.toMatchObject({ exitCode: 0 });
    }

    const captions = await readFile(result.captionsPath, "utf8");
    const leadingCut = result.editDecisionList.decisions.find(
      (decision) => decision.action === "CUT" && decision.sourceStartMs === 0,
    );
    expect(leadingCut?.sourceEndMs).toBeGreaterThan(500);
    const expectedStart = 1_200 - (leadingCut?.sourceEndMs ?? 0);
    expect(captions).toContain(formatSrtTime(expectedStart));
    expect(captions).not.toContain("00:00:01,200 -->");
    expect(captions).toContain("Реальный проход конвейера");

    const metadataArtifact = JSON.parse(
      await readFile(join(result.runPath, "metadata.json"), "utf8"),
    );
    const edlArtifact = JSON.parse(
      await readFile(join(result.runPath, "edit-decision.json"), "utf8"),
    );
    const report = JSON.parse(await readFile(result.reportPath, "utf8"));
    expect(metadataArtifact).toMatchObject({ width: 640, height: 360, hasAudio: true });
    expect(edlArtifact).toMatchObject({ version: 1, inputDurationMs: expect.any(Number) });
    expect(report).toMatchObject({
      status: "COMPLETED",
      inputSha256: beforeHash,
      platformOutputSource: "captioned-vertical",
      transcriptProviderUsage: {
        quotaDependency: false,
        externalCostRequired: false,
      },
      platformOutputs: expect.arrayContaining([
        expect.objectContaining({ presetId: "instagram-reels" }),
        expect.objectContaining({ presetId: "youtube-shorts" }),
        expect.objectContaining({ presetId: "vk-clips" }),
      ]),
    });
  }, 120_000);
});

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function formatSrtTime(milliseconds: number): string {
  const value = Math.floor(milliseconds);
  return `00:00:${String(Math.floor(value / 1000)).padStart(2, "0")},${String(value % 1000).padStart(3, "0")}`;
}
