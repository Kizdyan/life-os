import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeVideo } from "./probe";
import { renderVerticalMaster } from "./reframe";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("renderVerticalMaster", () => {
  it("preserves a vertical composition inside a verified 9:16 master", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({
      directory,
      width: 360,
      height: 640,
      durationSeconds: 2,
    });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    const result = await renderVerticalMaster({
      metadata,
      instruction: { mode: "CENTER" },
      outputPath: join(directory, "vertical.mp4"),
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    expect(result.metadata).toMatchObject({ width: 1080, height: 1920, hasAudio: true });
  }, 30_000);

  it("center-crops a horizontal source and preserves video-only state", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, audio: false, durationSeconds: 2 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    const result = await renderVerticalMaster({
      metadata,
      instruction: { mode: "CENTER" },
      outputPath: join(directory, "horizontal-center.mp4"),
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    expect(result.metadata).toMatchObject({ width: 1080, height: 1920, hasAudio: false });
  }, 30_000);

  it("renders a validated manual region and rejects unsupported regions", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, durationSeconds: 1 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    const result = await renderVerticalMaster({
      metadata,
      instruction: { mode: "MANUAL_REGION", x: 0.25, y: 0, width: 0.5, height: 1 },
      outputPath: join(directory, "manual.mp4"),
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    expect(result.metadata).toMatchObject({ width: 1080, height: 1920 });

    await expect(
      renderVerticalMaster({
        metadata,
        instruction: { mode: "MANUAL_REGION", x: 0.8, y: 0, width: 0.5, height: 1 },
        outputPath: join(directory, "invalid.mp4"),
        ffmpegPath: fixture.ffmpegPath,
        ffprobePath: fixture.ffprobePath,
        runner: fixture.runner,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT" });

    await expect(
      renderVerticalMaster({
        metadata,
        instruction: { mode: "FACE_AWARE" },
        outputPath: join(directory, "face.mp4"),
        ffmpegPath: fixture.ffmpegPath,
        ffprobePath: fixture.ffprobePath,
        runner: fixture.runner,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
  }, 30_000);
});
