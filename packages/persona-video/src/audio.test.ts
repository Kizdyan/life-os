import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VideoMetadata } from "./contracts";
import { analyzeAudio, normalizeAudio } from "./audio";
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

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
