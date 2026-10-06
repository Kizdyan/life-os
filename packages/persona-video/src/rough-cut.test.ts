import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EditDecisionList } from "./contracts";
import { probeVideo } from "./probe";
import { renderRoughCut } from "./rough-cut";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("renderRoughCut", () => {
  it("renders a shorter playable file with audio and preserves the input", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, durationSeconds: 4 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const inputHashBefore = await sha256(fixture.path);
    const outputPath = join(directory, "rough-cut.mp4");

    const result = await renderRoughCut({
      metadata,
      editDecisionList: edl(metadata.durationMs, [
        [500, 1500],
        [2500, 3500],
      ]),
      outputPath,
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    expect(result.path).toBe(outputPath);
    expect(result.metadata.durationMs).toBeGreaterThan(1800);
    expect(result.metadata.durationMs).toBeLessThan(2200);
    expect(result.metadata.hasAudio).toBe(true);
    expect(await sha256(fixture.path)).toBe(inputHashBefore);
  }, 30_000);

  it("renders video-only inputs without inventing an audio stream", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, audio: false, durationSeconds: 2 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    const result = await renderRoughCut({
      metadata,
      editDecisionList: edl(metadata.durationMs, [[200, 1600]]),
      outputPath: join(directory, "video-only-rough.mp4"),
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });

    expect(result.metadata.hasAudio).toBe(false);
    expect(result.metadata.durationMs).toBeGreaterThan(1200);
  }, 30_000);

  it("does not replace an existing artifact when rendering cannot start", async () => {
    const directory = await createFixtureDirectory();
    const fixture = await createVideoFixture({ directory, durationSeconds: 1 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const outputPath = join(directory, "existing.mp4");
    await writeFile(outputPath, "sentinel");

    await expect(
      renderRoughCut({
        metadata,
        editDecisionList: edl(metadata.durationMs, []),
        outputPath,
        ffmpegPath: fixture.ffmpegPath,
        ffprobePath: fixture.ffprobePath,
        runner: fixture.runner,
      }),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(await readFile(outputPath, "utf8")).toBe("sentinel");
  }, 30_000);
});

function edl(durationMs: number, keeps: Array<[number, number]>): EditDecisionList {
  return {
    version: 1,
    inputDurationMs: durationMs,
    decisions: keeps.map(([sourceStartMs, sourceEndMs]) => ({
      sourceStartMs,
      sourceEndMs,
      action: "KEEP",
      reason: "fixture_keep",
      confidence: 1,
      signalSource: "OBJECTIVE",
    })),
  };
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
