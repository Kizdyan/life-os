import { basename, join } from "node:path";
import type {
  ExportPreset,
  PlatformOutput,
  ProcessRunner,
  VerifiedMediaOutput,
} from "./contracts";
import { VideoPipelineError } from "./contracts";
import { renderAtomically } from "./render-utils";

export const DEFAULT_EXPORT_PRESETS: ExportPreset[] = [
  preset("instagram-reels", "instagram-reels.mp4"),
  preset("youtube-shorts", "youtube-shorts.mp4"),
  preset("vk-clips", "vk-clips.mp4"),
];

export async function renderPlatformVariants(input: {
  master: VerifiedMediaOutput;
  outputDirectory: string;
  presets?: ExportPreset[];
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
}): Promise<PlatformOutput[]> {
  const presets = input.presets ?? DEFAULT_EXPORT_PRESETS;
  const outputs: PlatformOutput[] = [];
  for (const exportPreset of presets) {
    if (!exportPreset.fileName || basename(exportPreset.fileName) !== exportPreset.fileName) {
      throw new VideoPipelineError("FILESYSTEM_ERROR", "Export fileName must be a plain name", {
        fileName: exportPreset.fileName,
      });
    }
    const output = await renderAtomically({
      outputPath: join(input.outputDirectory, exportPreset.fileName),
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
            input.master.path,
            "-map",
            "0:v:0",
            ...(input.master.metadata.hasAudio ? ["-map", "0:a:0"] : []),
            "-c:v",
            exportPreset.videoCodec,
            "-pix_fmt",
            exportPreset.pixelFormat,
            ...(input.master.metadata.hasAudio
              ? ["-c:a", exportPreset.audioCodec, "-b:a", "160k"]
              : ["-an"]),
            ...exportPreset.extraArgs,
            "-movflags",
            "+faststart",
            temporaryPath,
          ],
          { timeoutMs: 300_000 },
        );
      },
    });
    outputs.push({ ...output, presetId: exportPreset.id });
  }
  return outputs;
}

function preset(id: string, fileName: string): ExportPreset {
  return {
    id,
    fileName,
    videoCodec: "libx264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    extraArgs: ["-preset", "veryfast", "-crf", "20"],
  };
}
