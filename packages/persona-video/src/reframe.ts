import type {
  ProcessRunner,
  ReframeInstruction,
  VerifiedMediaOutput,
  VideoMetadata,
} from "./contracts";
import { validateReframeInstruction } from "./contracts";
import { renderAtomically } from "./render-utils";

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

export async function renderVerticalMaster(input: {
  metadata: VideoMetadata;
  instruction: ReframeInstruction;
  outputPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
}): Promise<VerifiedMediaOutput> {
  validateReframeInstruction(input.instruction);
  const filter = buildReframeFilter(input.metadata, input.instruction);
  return renderAtomically({
    outputPath: input.outputPath,
    ffprobePath: input.ffprobePath,
    runner: input.runner,
    render: async (temporaryPath) => {
      await input.runner.run(
        input.ffmpegPath,
        [
          "-y",
          "-nostdin",
          "-v",
          "error",
          "-i",
          input.metadata.inputPath,
          "-filter_complex",
          `[0:v]${filter}[outv]`,
          "-map",
          "[outv]",
          ...(input.metadata.hasAudio ? ["-map", "0:a:0"] : []),
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          ...(input.metadata.hasAudio ? ["-c:a", "aac", "-b:a", "160k"] : ["-an"]),
          "-movflags",
          "+faststart",
          temporaryPath,
        ],
        { timeoutMs: 300_000 },
      );
    },
  });
}

function buildReframeFilter(
  metadata: VideoMetadata,
  instruction: Exclude<ReframeInstruction, { mode: "FACE_AWARE" }>,
): string {
  if (instruction.mode === "MANUAL_REGION") {
    const width = evenPixels(metadata.width * instruction.width);
    const height = evenPixels(metadata.height * instruction.height);
    const x = evenPixels(metadata.width * instruction.x, 0);
    const y = evenPixels(metadata.height * instruction.y, 0);
    return [
      `crop=${width}:${height}:${x}:${y}`,
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
      "setsar=1",
    ].join(",");
  }
  if (metadata.orientation === "portrait") {
    return [
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
      "setsar=1",
    ].join(",");
  }
  return [
    `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
    "setsar=1",
  ].join(",");
}

function evenPixels(value: number, minimum = 2): number {
  return Math.max(minimum, Math.floor(value / 2) * 2);
}
