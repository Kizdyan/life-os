import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from "./contracts";
import { hashFileSha256 } from "./file-hash";
import { probeVideo } from "./probe";
import { extractTranscriptionAudio } from "./transcription-audio";
import { createFixtureDirectory, createVideoFixture } from "../test/fixture";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("extractTranscriptionAudio", () => {
  it("retains a verified 16 kHz mono PCM artifact without changing the source", async () => {
    const directory = await createFixtureDirectory();
    directories.push(directory);
    const fixture = await createVideoFixture({ directory, durationSeconds: 1 });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const sourceHash = await hashFileSha256(fixture.path);
    const runner = new RecordingRunner(fixture.runner);
    const outputPath = join(directory, "stt-input.wav");

    const result = await extractTranscriptionAudio({
      metadata,
      outputPath,
      ffmpegPath: fixture.ffmpegPath,
      ffprobePath: fixture.ffprobePath,
      runner,
    });

    expect(result).toMatchObject({
      path: outputPath,
      codec: "pcm_s16le",
      sampleRateHz: 16_000,
      channels: 1,
    });
    expect(result.durationMs).toBeGreaterThan(900);
    expect(await hashFileSha256(fixture.path)).toBe(sourceHash);
    expect(runner.calls.some(({ args }) => includesSequence(args, ["-ac", "1", "-ar", "16000"]))).toBe(true);
    expect(runner.calls.some(({ args }) => includesSequence(args, ["-c:a", "pcm_s16le"]))).toBe(true);
  });

  it("rejects video without audio and leaves the source untouched", async () => {
    const directory = await createFixtureDirectory();
    directories.push(directory);
    const fixture = await createVideoFixture({ directory, durationSeconds: 1, audio: false });
    const metadata = await probeVideo({
      inputPath: fixture.path,
      ffprobePath: fixture.ffprobePath,
      runner: fixture.runner,
    });
    const sourceHash = await hashFileSha256(fixture.path);
    const outputPath = join(directory, "stt-input.wav");

    await expect(
      extractTranscriptionAudio({
        metadata,
        outputPath,
        ffmpegPath: fixture.ffmpegPath,
        ffprobePath: fixture.ffprobePath,
        runner: fixture.runner,
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT" });
    await expect(access(outputPath)).rejects.toThrow();
    expect(await hashFileSha256(fixture.path)).toBe(sourceHash);
  });
});

class RecordingRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: string[] }> = [];

  constructor(private readonly delegate: ProcessRunner) {}

  async run(
    command: string,
    args: string[],
    options?: ProcessRunOptions,
  ): Promise<ProcessResult> {
    this.calls.push({ command, args: [...args] });
    return this.delegate.run(command, args, options);
  }
}

function includesSequence(values: string[], expected: string[]): boolean {
  return values.some((_, index) =>
    expected.every((value, offset) => values[index + offset] === value),
  );
}
