import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VideoPipelineError, validateReframeInstruction } from "./contracts";
import { NodeProcessRunner, resolveMediaTools } from "./process-adapter";

describe("NodeProcessRunner", () => {
  it("passes spaces and shell metacharacters as literal arguments", async () => {
    const runner = new NodeProcessRunner();
    const result = await runner.run(process.execPath, [
      "-e",
      "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
      "path with spaces.mp4",
      "$(not-a-command)",
      "a&b",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      "path with spaces.mp4",
      "$(not-a-command)",
      "a&b",
    ]);
  });
});

describe("resolveMediaTools", () => {
  it("prefers explicit paths over environment and static fallbacks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "persona-video-tools-"));
    const explicitFfmpeg = join(directory, "explicit ffmpeg.exe");
    const explicitFfprobe = join(directory, "explicit ffprobe.exe");
    await Promise.all([
      writeFile(explicitFfmpeg, "fixture"),
      writeFile(explicitFfprobe, "fixture"),
    ]);

    const result = await resolveMediaTools({
      ffmpegPath: explicitFfmpeg,
      ffprobePath: explicitFfprobe,
      env: {
        FFMPEG_PATH: "ignored-env-ffmpeg",
        FFPROBE_PATH: "ignored-env-ffprobe",
      },
      staticPaths: {
        ffmpegPath: "ignored-static-ffmpeg",
        ffprobePath: "ignored-static-ffprobe",
      },
    });

    expect(result).toEqual({
      ffmpegPath: explicitFfmpeg,
      ffprobePath: explicitFfprobe,
      source: "explicit",
    });
  });

  it("reports a machine-readable error when neither tool is available", async () => {
    await expect(
      resolveMediaTools({
        env: {},
        pathCandidates: {
          ffmpeg: "definitely-missing-persona-ffmpeg",
          ffprobe: "definitely-missing-persona-ffprobe",
        },
        staticPaths: { ffmpegPath: null, ffprobePath: null },
      }),
    ).rejects.toMatchObject({
      code: "TOOL_NOT_FOUND",
    } satisfies Partial<VideoPipelineError>);
  });
});

describe("reframe capability", () => {
  it("rejects FACE_AWARE until a real tracker is configured", () => {
    expect(() => validateReframeInstruction({ mode: "FACE_AWARE" })).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_CAPABILITY" }),
    );
  });
});
