import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeProcessRunner, resolveMediaTools } from "../src/process-adapter";

export async function createFixtureDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "persona-video-fixture-"));
}

export async function createVideoFixture(input: {
  directory: string;
  fileName?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  audio?: boolean;
  quietAudio?: boolean;
  audioVolume?: number;
  leadingSilenceSeconds?: number;
}): Promise<{ path: string; ffmpegPath: string; ffprobePath: string; runner: NodeProcessRunner }> {
  const tools = await resolveMediaTools();
  const runner = new NodeProcessRunner();
  const path = join(input.directory, input.fileName ?? "fixture.mp4");
  const duration = input.durationSeconds ?? 4;
  const width = input.width ?? 640;
  const height = input.height ?? 360;
  const audio = input.audio ?? true;
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${width}x${height}:rate=30:duration=${duration}`,
  ];
  if (audio) {
    const audioFilters = [
      ...(input.leadingSilenceSeconds
        ? [`adelay=${Math.round(input.leadingSilenceSeconds * 1000)}:all=1`]
        : []),
      ...(input.quietAudio || input.audioVolume !== undefined
        ? [`volume=${input.audioVolume ?? 0.01}`]
        : []),
    ];
    args.push(
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${duration}`,
      ...(audioFilters.length > 0 ? ["-af", audioFilters.join(",")] : []),
    );
  }
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    ...(audio ? ["-c:a", "aac", "-shortest"] : ["-an"]),
    path,
  );
  await runner.run(tools.ffmpegPath, args, { timeoutMs: 120_000 });
  return { path, ...tools, runner };
}
