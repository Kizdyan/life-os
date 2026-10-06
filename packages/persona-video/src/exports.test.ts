import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExportPreset } from "./contracts";
import { renderPlatformVariants } from "./exports";
import { probeVideo } from "./probe";
import { renderVerticalMaster } from "./reframe";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("renderPlatformVariants", () => {
  it("creates named playable outputs from configurable presets", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, durationSeconds: 1 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const master = await renderVerticalMaster({
      metadata,
      instruction: { mode: "CENTER" },
      outputPath: join(directory, "master.mp4"),
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const presets: ExportPreset[] = [
      {
        id: "custom-short",
        fileName: "custom-short.mp4",
        videoCodec: "libx264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        extraArgs: ["-crf", "24"],
      },
    ];

    const outputs = await renderPlatformVariants({
      master,
      outputDirectory: directory,
      presets,
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      presetId: "custom-short",
      path: join(directory, "custom-short.mp4"),
      metadata: { width: 1080, height: 1920, hasAudio: true },
    });
  }, 30_000);
});
