import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DeterministicTranscriptProvider } from "./transcription";
import { processVideo } from "./pipeline";
import { runCli } from "./cli";
import { hashFileSha256 } from "./file-hash";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("processVideo", () => {
  it("creates an isolated run with ordered progress and required artifacts", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, durationSeconds: 2 });
    const outputRoot = join(directory, "runs");
    const progress: string[] = [];
    const transcriptProvider = new DeterministicTranscriptProvider({
      language: "ru",
      provider: "fixture",
      confidence: 1,
      limitations: [],
      segments: [
        { startMs: 100, endMs: 1500, text: "Проверка конвейера", confidence: 1 },
      ],
    });

    const first = await processVideo({
      inputPath: fixture.path,
      outputRoot,
      transcriptProvider,
      transcriptRequired: true,
      exportPresets: [
        {
          id: "instagram-reels",
          fileName: "instagram-reels.mp4",
          videoCodec: "libx264",
          audioCodec: "aac",
          pixelFormat: "yuv420p",
          extraArgs: ["-preset", "veryfast", "-crf", "24"],
        },
        {
          id: "test-platform",
          fileName: "test-platform.mp4",
          videoCodec: "libx264",
          audioCodec: "aac",
          pixelFormat: "yuv420p",
          extraArgs: ["-preset", "veryfast", "-crf", "24"],
        },
      ],
      onProgress: (stage) => progress.push(stage),
    });
    const second = await processVideo({
      inputPath: fixture.path,
      outputRoot,
      transcriptProvider,
      exportPresets: [],
    });

    expect(second.runPath).not.toBe(first.runPath);
    expect(progress).toEqual([
      "PROBING",
      "QA",
      "CAPTIONS",
      "SEGMENTING",
      "EDITING",
      "AUDIO",
      "REFRAMING",
      "EXPORTING",
      "VERIFYING",
      "COMPLETED",
    ]);
    for (const fileName of [
      "metadata.json",
      "qa.json",
      "transcript.json",
      "normalized-transcript.json",
      "segments.json",
      "edit-decision.json",
      "captions.srt",
      "captions.ass",
      "instagram-captions.ass",
      "audio.json",
      "stt-input.wav",
      "rough-cut.mp4",
      "normalized-rough-cut.mp4",
      "vertical-master.mp4",
      "captioned-vertical.mp4",
      "instagram-reels.mp4",
      "test-platform.mp4",
      "report.json",
    ]) {
      await expect(access(join(first.runPath, fileName))).resolves.toBeUndefined();
    }
    expect(first.platformOutputs.map((output) => output.presetId)).toEqual([
      "instagram-reels",
      "test-platform",
    ]);
    expect((await readFile(first.captionsPath, "utf8")).trim()).not.toBe("");
    expect(first.transcriptionAudio?.path).toBe(join(first.runPath, "stt-input.wav"));
    expect(first.transcriptProviderUsage).toMatchObject({
      providerUsed: "fixture",
      fallbackOccurred: false,
      quotaDependency: false,
      localProcessing: true,
      externalCostRequired: false,
    });
    expect(first.audioNormalization).toMatchObject({
      before: { status: "available" },
      after: { status: "available", clippingRisk: false },
      target: { integratedLoudnessLufs: -16, truePeakDb: -1.5 },
      providerUsage: {
        providerUsed: "ffmpeg-loudnorm-local",
        quotaDependency: false,
        localProcessing: true,
        externalCostRequired: false,
      },
    });
    expect(first.normalizedRoughCut.path).toBe(join(first.runPath, "normalized-rough-cut.mp4"));
    expect(first.cleanMaster.path).toBe(join(first.runPath, "vertical-master.mp4"));
    expect(first.captionedMaster?.path).toBe(join(first.runPath, "captioned-vertical.mp4"));
    expect(first.platformOutputSource).toBe("captioned-vertical");
    expect(first.normalizedTranscriptPath).toBe(join(first.runPath, "normalized-transcript.json"));
    expect(first.normalizedTranscript?.normalization).toMatchObject({
      mode: "LOCAL_DETERMINISTIC",
      quotaDependency: false,
      externalCostRequired: false,
    });
    expect(first.captionLayout).toMatchObject({
      maxLines: 2,
      safeWidthPx: 900,
      measuredWith: "FFMPEG_DRAWTEXT",
    });
    expect(first.platformOutputSources).toMatchObject({
      "instagram-reels": "instagram-safe-caption-render",
      "test-platform": "captioned-vertical",
    });
    expect(
      await hashFileSha256(join(first.runPath, "instagram-reels.mp4")),
    ).not.toBe(await hashFileSha256(join(first.runPath, "captioned-vertical.mp4")));
    expect(JSON.parse(await readFile(first.reportPath, "utf8"))).toMatchObject({
      status: "COMPLETED",
      runId: first.runId,
      transcriptProviderUsage: {
        providerUsed: "fixture",
        quotaDependency: false,
        externalCostRequired: false,
      },
      platformOutputSource: "captioned-vertical",
    });
  }, 60_000);

  it("writes a structured failure report after creating the run directory", async () => {
    const directory = await createFixtureDirectory();
    const outputRoot = join(directory, "failed-runs");

    let caught: unknown;
    try {
      await processVideo({ inputPath: join(directory, "missing.mp4"), outputRoot });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      code: "UNREADABLE_INPUT",
      details: { reportPath: expect.stringContaining("report.json") },
    });
    const [runName] = await readdir(outputRoot);
    const report = JSON.parse(await readFile(join(outputRoot, runName, "report.json"), "utf8"));
    expect(report).toMatchObject({
      status: "FAILED",
      error: { code: "UNREADABLE_INPUT" },
    });
  });

  it("classifies an unwritable output root as a filesystem error", async () => {
    const directory = await createFixtureDirectory();
    const outputRoot = join(directory, "not-a-directory");
    await writeFile(outputRoot, "occupied", "utf8");

    await expect(
      processVideo({ inputPath: join(directory, "missing.mp4"), outputRoot }),
    ).rejects.toMatchObject({ code: "FILESYSTEM_ERROR" });
  });
});

describe("runCli", () => {
  it("accepts the package-manager separator and prints help without processing input", async () => {
    const output: string[] = [];
    const errors: string[] = [];

    const code = await runCli(["--", "--help"], {
      out: (message) => output.push(message),
      error: (message) => errors.push(message),
    });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("Usage:");
    expect(output.join("\n")).toContain("--whisper-cpp");
    expect(output.join("\n")).toContain("WHISPER_MODEL_PATH");
    expect(errors).toEqual([]);
  });

  it("returns a non-zero code and a concise error for invalid input", async () => {
    const directory = await createFixtureDirectory();
    const errors: string[] = [];

    const code = await runCli(
      [join(directory, "missing.mp4"), "--output", join(directory, "runs")],
      { out: () => undefined, error: (message) => errors.push(message) },
    );

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("UNREADABLE_INPUT");
  });
});
