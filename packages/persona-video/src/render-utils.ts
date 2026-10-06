import { randomUUID } from "node:crypto";
import { access, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { ProcessRunner, VerifiedMediaOutput } from "./contracts";
import { VideoPipelineError } from "./contracts";
import { probeVideo } from "./probe";

export async function renderAtomically(input: {
  outputPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
  render: (temporaryPath: string) => Promise<void>;
}): Promise<VerifiedMediaOutput> {
  if (await pathExists(input.outputPath)) {
    throw new VideoPipelineError("FILESYSTEM_ERROR", "Output path already exists", {
      outputPath: input.outputPath,
    });
  }
  const extension = extname(input.outputPath) || ".mp4";
  const stem = basename(input.outputPath, extname(input.outputPath));
  const temporaryPath = join(
    dirname(input.outputPath),
    `.${stem}.partial-${randomUUID()}${extension}`,
  );
  try {
    await input.render(temporaryPath);
    const metadata = await probeVideo({
      inputPath: temporaryPath,
      ffprobePath: input.ffprobePath,
      runner: input.runner,
    });
    if (metadata.durationMs <= 0 || metadata.width <= 0 || metadata.height <= 0) {
      throw new VideoPipelineError("INVALID_OUTPUT", "Rendered media is not playable", {
        temporaryPath,
      });
    }
    await rename(temporaryPath, input.outputPath);
    return {
      path: input.outputPath,
      metadata: { ...metadata, inputPath: input.outputPath },
    };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
