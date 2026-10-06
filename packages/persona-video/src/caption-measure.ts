import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaptionTextMeasurer } from "./caption-layout";
import type { ProcessRunner } from "./contracts";
import { VideoPipelineError } from "./contracts";

export class FfmpegCaptionTextMeasurer implements CaptionTextMeasurer {
  private readonly cache = new Map<string, number>();

  constructor(private readonly options: {
    ffmpegPath: string;
    runner: ProcessRunner;
    workDirectory: string;
    fontFilePath: string;
    fontSizePx: number;
  }) {}

  async measureWidthPx(text: string): Promise<number> {
    const cached = this.cache.get(text);
    if (cached !== undefined) return cached;
    const fileName = `.caption-measure-${randomUUID().slice(0, 8)}.txt`;
    const textPath = join(this.options.workDirectory, fileName);
    await writeFile(textPath, text, "utf8");
    try {
      const fontPath = escapeFilterPath(this.options.fontFilePath);
      const filter = [
        `drawtext=fontfile='${fontPath}'`,
        `textfile='${fileName}'`,
        `fontsize=${this.options.fontSizePx}`,
        "x=print(text_w)",
        "y=0",
      ].join(":");
      const result = await this.options.runner.run(
        this.options.ffmpegPath,
        [
          "-hide_banner",
          "-f",
          "lavfi",
          "-i",
          "color=c=black:s=1080x1920:d=0.04",
          "-vf",
          filter,
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ],
        { cwd: this.options.workDirectory, timeoutMs: 30_000 },
      );
      const values = [...result.stderr.matchAll(/^\s*(\d+(?:\.\d+)?)\s*$/gmu)];
      const width = Number(values.at(-1)?.[1]);
      if (!Number.isFinite(width) || width <= 0) {
        throw new VideoPipelineError("INVALID_OUTPUT", "FFmpeg did not report caption width", {
          text,
        });
      }
      this.cache.set(text, width);
      return width;
    } finally {
      await rm(textPath, { force: true });
    }
  }
}

function escapeFilterPath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/:/gu, "\\:").replace(/'/gu, "\\'");
}
