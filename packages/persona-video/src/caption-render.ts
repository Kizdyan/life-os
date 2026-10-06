import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import type { ProcessRunner, VerifiedMediaOutput } from "./contracts";
import { VideoPipelineError } from "./contracts";
import { renderAtomically } from "./render-utils";

export interface CaptionRenderStyle {
  fontName: string;
  fontSize: number;
  marginV: number;
}

const DEFAULT_STYLE: CaptionRenderStyle = {
  fontName: "Arial",
  fontSize: 44,
  marginV: 180,
};

export function buildSubtitlesFilter(
  srtPath: string,
  style: Partial<CaptionRenderStyle> = {},
  embeddedStyle = false,
): string {
  if (embeddedStyle) return `subtitles=filename='${escapeFilterPath(srtPath)}'`;
  const resolved = { ...DEFAULT_STYLE, ...style };
  if (!Number.isFinite(resolved.fontSize) || resolved.fontSize <= 0) {
    throw new VideoPipelineError("UNSUPPORTED_INPUT", "Caption font size must be positive");
  }
  if (!Number.isFinite(resolved.marginV) || resolved.marginV < 0) {
    throw new VideoPipelineError("UNSUPPORTED_INPUT", "Caption safe-area margin must be non-negative");
  }
  const fontName = escapeStyleValue(resolved.fontName);
  const forceStyle = [
    `FontName=${fontName}`,
    `FontSize=${resolved.fontSize}`,
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BorderStyle=1",
    "Outline=3",
    "Shadow=0",
    "Alignment=2",
    `MarginV=${resolved.marginV}`,
  ].join(",");
  return `subtitles=filename='${escapeFilterPath(srtPath)}':force_style='${forceStyle}'`;
}

export async function renderCaptionedVideo(input: {
  input: VerifiedMediaOutput;
  srtPath: string;
  outputPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
  style?: Partial<CaptionRenderStyle>;
  embeddedStyle?: boolean;
}): Promise<VerifiedMediaOutput> {
  let srt: string;
  try {
    srt = await readFile(input.srtPath, "utf8");
  } catch (error) {
    throw new VideoPipelineError("INVALID_TRANSCRIPT", "Caption SRT cannot be read", {
      srtPath: input.srtPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (srt.trim() === "") {
    throw new VideoPipelineError("INVALID_TRANSCRIPT", "Caption SRT is empty", {
      srtPath: input.srtPath,
    });
  }

  const outputDirectory = dirname(input.outputPath);
  const subtitleExtension = extname(input.srtPath) || ".srt";
  const stagedSrtName = `.caption-render-${randomUUID()}${subtitleExtension}`;
  const stagedSrtPath = `${outputDirectory}/${stagedSrtName}`;
  await writeFile(stagedSrtPath, srt, "utf8");
  try {
    const filter = buildSubtitlesFilter(stagedSrtName, input.style, input.embeddedStyle);
    return await renderAtomically({
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
            input.input.path,
            "-map",
            "0:v:0",
            ...(input.input.metadata.hasAudio ? ["-map", "0:a:0"] : []),
            "-vf",
            filter,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            ...(input.input.metadata.hasAudio ? ["-c:a", "copy"] : ["-an"]),
            "-movflags",
            "+faststart",
            temporaryPath,
          ],
          { cwd: outputDirectory, timeoutMs: 300_000 },
        );
      },
    });
  } finally {
    await rm(stagedSrtPath, { force: true });
  }
}

function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeStyleValue(value: string): string {
  const normalized = value.trim();
  if (normalized === "" || /[,':\\]/.test(normalized)) {
    throw new VideoPipelineError("UNSUPPORTED_INPUT", "Caption font name contains unsafe characters");
  }
  return normalized;
}
