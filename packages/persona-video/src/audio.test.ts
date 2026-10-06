import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessResult, ProcessRunner, VideoMetadata } from "./contracts";
import { analyzeAudio, FfmpegLoudnessNormalizer, normalizeAudio } from "./audio";
import { probeVideo } from "./probe";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("analyzeAudio", () => {
  it("returns an explicit no-audio state without inventing measurements", async () => {
    const metadata: VideoMetadata = {
      inputPath: "video-only.mp4",
      durationMs: 1000,
      width: 640,
      height: 360,
      orientation: "landscape",
      fps: 30,
      videoCodec: "h264",
      bitrate: null,
      hasAudio: false,
      audioCodec: null,
      fileSizeBytes: 10,
      creationTime: null,
      rotationDegrees: 0,
    };

    await expect(
      analyzeAudio({ metadata, ffmpegPath: "unused", runner: { run: async () => {
        throw new Error("must not run");
      } } }),
    ).resolves.toEqual({
      status: "no_audio",
      meanVolumeDb: null,
      maxVolumeDb: null,
      integratedLoudnessLufs: null,
      truePeakDb: null,
      tooQuiet: false,
      clippingRisk: false,
    });
  });

  it("detects quiet audio from a real fixture", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, quietAudio: true, durationSeconds: 2 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    const result = await analyzeAudio({
      metadata,
      ffmpegPath: fixture.ffmpegPath,
      runner: fixture.runner,
    });

    expect(result.status).toBe("available");
    expect(result.meanVolumeDb).toBeLessThan(-35);
    expect(result.integratedLoudnessLufs).not.toBeNull();
    expect(result.tooQuiet).toBe(true);
  }, 30_000);

  it("flags a near-zero peak as a clipping risk", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, audioVolume: 12, durationSeconds: 2 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    const result = await analyzeAudio({
      metadata,
      ffmpegPath: fixture.ffmpegPath,
      runner: fixture.runner,
    });

    expect(result.maxVolumeDb).toBeGreaterThanOrEqual(-0.5);
    expect(result.clippingRisk).toBe(true);
  }, 30_000);
});

describe("normalizeAudio", () => {
  it("creates a normalized copy while preserving the source bytes", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, quietAudio: true, durationSeconds: 2 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const hashBefore = await sha256(fixture.path);

    const result = await normalizeAudio({
      metadata,
      outputPath: join(directory, "normalized.mp4"),
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
      targetLufs: -16,
    });

    expect(result.metadata.hasAudio).toBe(true);
    expect(await sha256(fixture.path)).toBe(hashBefore);
  }, 30_000);
});

describe("FfmpegLoudnessNormalizer", () => {
  it("uses measured pass-one values, renders a new file and verifies loudness again", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, quietAudio: true, durationSeconds: 2 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const runner = new RecordingRunner(fixture.runner);
    const outputPath = join(directory, "normalized-rough-cut.mp4");
    const normalizer = new FfmpegLoudnessNormalizer();

    const result = await normalizer.normalize({
      metadata,
      outputPath,
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner,
    });

    expect(result.output.path).toBe(outputPath);
    expect(result.before.integratedLoudnessLufs).toBeLessThan(-20);
    expect(result.after.integratedLoudnessLufs).toBeGreaterThan(-17);
    expect(result.after.integratedLoudnessLufs).toBeLessThan(-15);
    expect(result.after.truePeakDb).toBeLessThanOrEqual(-1.3);
    expect(result.target).toEqual({
      integratedLoudnessLufs: -16,
      truePeakDb: -1.5,
      loudnessRangeLu: 11,
    });
    expect(result.providerUsage).toMatchObject({
      providerUsed: "ffmpeg-loudnorm-local",
      quotaDependency: false,
      localProcessing: true,
      externalCostRequired: false,
    });
    const renderCall = runner.calls.find((call) =>
      call.args.some((argument) => argument.includes("measured_I=")),
    );
    const filter = renderCall?.args[renderCall.args.indexOf("-af") + 1] ?? "";
    expect(filter).toContain(`measured_I=${result.firstPass.inputIntegratedLoudnessLufs}`);
    expect(filter).toContain(`measured_LRA=${result.firstPass.inputLoudnessRangeLu}`);
    expect(filter).toContain(`measured_TP=${result.firstPass.inputTruePeakDb}`);
    expect(filter).toContain(`measured_thresh=${result.firstPass.inputThresholdLufs}`);
    expect(filter).toContain(`offset=${result.firstPass.targetOffsetDb}`);
    expect(filter).toContain("linear=true");
    expect(await sha256(fixture.path)).not.toBe(await sha256(outputPath));
  }, 30_000);

  it("rejects no-audio input without invoking a process", async () => {
    const runner: ProcessRunner = { run: async () => { throw new Error("must not run"); } };
    await expect(
      new FfmpegLoudnessNormalizer().normalize({
        metadata: metadataFixture(false),
        outputPath: "normalized.mp4",
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        runner,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT" });
  });

  it("rejects malformed pass-one output", async () => {
    const runner = new SimulatedLoudnessRunner("not-json", loudnormJson(-16, -1.6));
    await expect(normalizeWithRunner(runner)).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
  });

  it("rejects an undecodable rendered output", async () => {
    const runner = new SimulatedLoudnessRunner(
      loudnormJson(-29, -8),
      loudnormJson(-16, -1.6),
      false,
    );
    await expect(normalizeWithRunner(runner)).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
  });

  it("rejects normalized output above the configured true-peak safety bound", async () => {
    const runner = new SimulatedLoudnessRunner(
      loudnormJson(-29, -8),
      loudnormJson(-16, -1.0),
    );
    await expect(normalizeWithRunner(runner)).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
  });
});

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

class RecordingRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];

  constructor(private readonly delegate: ProcessRunner) {}

  async run(command: string, args: string[], options?: Parameters<ProcessRunner["run"]>[2]) {
    this.calls.push({ command, args: [...args] });
    return this.delegate.run(command, args, options);
  }
}

class SimulatedLoudnessRunner implements ProcessRunner {
  private ffmpegCalls = 0;

  constructor(
    private readonly firstPass: string,
    private readonly verificationPass: string,
    private readonly decodable = true,
  ) {}

  async run(command: string, args: string[]): Promise<ProcessResult> {
    if (command === "ffprobe") {
      return {
        exitCode: 0,
        stdout: this.decodable
          ? JSON.stringify({
              format: { duration: "2", size: "100" },
              streams: [
                { codec_type: "video", codec_name: "h264", width: 640, height: 360, avg_frame_rate: "30/1" },
                { codec_type: "audio", codec_name: "aac" },
              ],
            })
          : "not-json",
        stderr: "",
      };
    }
    this.ffmpegCalls += 1;
    if (this.ffmpegCalls === 1) {
      return { exitCode: 0, stdout: "", stderr: this.firstPass };
    }
    if (this.ffmpegCalls === 2) {
      await writeFile(args.at(-1)!, "rendered output");
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: this.verificationPass };
  }
}

async function normalizeWithRunner(runner: ProcessRunner) {
  const directory = await createFixtureDirectory();
  const inputPath = join(directory, "input.mp4");
  await writeFile(inputPath, "source");
  return new FfmpegLoudnessNormalizer().normalize({
    metadata: { ...metadataFixture(true), inputPath },
    outputPath: join(directory, "normalized-rough-cut.mp4"),
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    runner,
  });
}

function metadataFixture(hasAudio: boolean): VideoMetadata {
  return {
    inputPath: "input.mp4",
    durationMs: 2_000,
    width: 640,
    height: 360,
    orientation: "landscape",
    fps: 30,
    videoCodec: "h264",
    bitrate: null,
    hasAudio,
    audioCodec: hasAudio ? "aac" : null,
    fileSizeBytes: 100,
    creationTime: null,
    rotationDegrees: 0,
  };
}

function loudnormJson(integrated: number, truePeak: number): string {
  return JSON.stringify({
    input_i: String(integrated),
    input_tp: String(truePeak),
    input_lra: "1.2",
    input_thresh: "-39.5",
    target_offset: "0.2",
  });
}
