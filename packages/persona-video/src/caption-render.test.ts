import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessRunner } from "./contracts";
import { buildSubtitlesFilter, renderCaptionedVideo } from "./caption-render";
import { probeVideo } from "./probe";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

describe("buildSubtitlesFilter", () => {
  it("escapes a Windows Cyrillic path and applies a deterministic lower safe-area style", () => {
    const filter = buildSubtitlesFilter("C:\\Видео Кости\\it's-real\\субтитры.srt", {
      fontName: "Arial",
      fontSize: 44,
      marginV: 180,
    });

    expect(filter).toContain("filename='C\\:/Видео Кости/it\\'s-real/субтитры.srt'");
    expect(filter).toContain("FontName=Arial");
    expect(filter).toContain("FontSize=44");
    expect(filter).toContain("Alignment=2");
    expect(filter).toContain("MarginV=180");
    expect(filter).toContain("Outline=3");
    expect(filter).toContain("Shadow=0");
  });

  it("preserves the exact pixel-safe style embedded in an ASS subtitle file", () => {
    const filter = buildSubtitlesFilter("captions.ass", {}, true);

    expect(filter).toBe("subtitles=filename='captions.ass'");
    expect(filter).not.toContain("force_style");
  });
});

describe("renderCaptionedVideo", () => {
  it("rejects an empty SRT before invoking FFmpeg", async () => {
    const directory = await createFixtureDirectory();
    const srtPath = join(directory, "captions.srt");
    await writeFile(srtPath, "\n", "utf8");
    const runner: ProcessRunner = {
      run: async () => {
        throw new Error("must not run");
      },
    };

    await expect(
      renderCaptionedVideo({
        input: {
          path: join(directory, "normalized.mp4"),
          metadata: metadataFixture(join(directory, "normalized.mp4")),
        },
        srtPath,
        outputPath: join(directory, "captioned-vertical.mp4"),
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        runner,
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSCRIPT" });
  });

  it("burns real Russian captions, retains audio and produces a fully decodable video", async () => {
    const directory = await createFixtureDirectory();
    const mediaDirectory = join(directory, "Видео Кости's");
    await mkdir(mediaDirectory);
    const fixture = await createVideoFixture({
      directory: mediaDirectory,
      fileName: "чистый-master.mp4",
      durationSeconds: 2,
      width: 360,
      height: 640,
    });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const srtPath = join(mediaDirectory, "русские-субтитры.srt");
    await writeFile(
      srtPath,
      "1\n00:00:00,100 --> 00:00:01,800\nНастоящие русские субтитры\n",
      "utf8",
    );
    const runner = new RecordingRunner(fixture.runner);

    const result = await renderCaptionedVideo({
      input: { path: fixture.path, metadata },
      srtPath,
      outputPath: join(mediaDirectory, "captioned-vertical.mp4"),
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner,
      style: { fontName: "Arial", marginV: 120 },
    });

    expect(result.metadata).toMatchObject({ width: 360, height: 640, hasAudio: true });
    expect(result.metadata.durationMs).toBeGreaterThan(1_800);
    expect(await readFile(result.path)).not.toHaveLength(0);
    const renderCall = runner.calls.find((call) => call.args.includes("-vf"));
    expect(renderCall?.args).toContain("copy");
    expect(renderCall?.args[renderCall.args.indexOf("-vf") + 1]).toContain(".caption-render-");
    await expect(
      fixture.runner.run(
        fixture.ffmpegPath,
        ["-v", "error", "-i", result.path, "-f", "null", "-"],
        { timeoutMs: 120_000 },
      ),
    ).resolves.toMatchObject({ exitCode: 0 });
  }, 30_000);
});

class RecordingRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];

  constructor(private readonly delegate: ProcessRunner) {}

  async run(command: string, args: string[], options?: Parameters<ProcessRunner["run"]>[2]) {
    this.calls.push({ command, args: [...args] });
    return this.delegate.run(command, args, options);
  }
}

function metadataFixture(inputPath: string) {
  return {
    inputPath,
    durationMs: 2_000,
    width: 360,
    height: 640,
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
