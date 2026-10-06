import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import type {
  MediaToolPaths,
  ProcessResult,
  ProcessRunOptions,
  ProcessRunner,
} from "./contracts";
import { VideoPipelineError } from "./contracts";

export class NodeProcessRunner implements ProcessRunner {
  async run(
    command: string,
    args: string[],
    options: ProcessRunOptions = {},
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = options.timeoutMs
        ? setTimeout(() => {
            child.kill();
            settled = true;
            reject(
              new VideoPipelineError("PROCESS_FAILED", `Process timed out: ${command}`, {
                command,
                timeoutMs: options.timeoutMs,
              }),
            );
          }, options.timeoutMs)
        : null;

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => (stdout += chunk));
      child.stderr.on("data", (chunk: string) => (stderr += chunk));
      child.once("error", (error) => {
        if (timeout) clearTimeout(timeout);
        if (settled) return;
        settled = true;
        reject(
          new VideoPipelineError("PROCESS_FAILED", `Unable to start process: ${command}`, {
            command,
            cause: error.message,
          }),
        );
      });
      child.once("close", (exitCode) => {
        if (timeout) clearTimeout(timeout);
        if (settled) return;
        settled = true;
        const result = { exitCode: exitCode ?? -1, stdout, stderr };
        if (result.exitCode !== 0 && options.allowFailure !== true) {
          reject(
            new VideoPipelineError("PROCESS_FAILED", `Process failed: ${command}`, {
              command,
              args,
              exitCode: result.exitCode,
              stderr,
            }),
          );
          return;
        }
        resolve(result);
      });
    });
  }
}

export interface ResolveMediaToolsOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  env?: Record<string, string | undefined>;
  runner?: ProcessRunner;
  pathCandidates?: { ffmpeg: string; ffprobe: string };
  staticPaths?: { ffmpegPath: string | null; ffprobePath: string | null };
}

export async function resolveMediaTools(
  options: ResolveMediaToolsOptions = {},
): Promise<MediaToolPaths> {
  if (options.ffmpegPath || options.ffprobePath) {
    if (!options.ffmpegPath || !options.ffprobePath) {
      throw new VideoPipelineError(
        "TOOL_NOT_FOUND",
        "Both explicit ffmpegPath and ffprobePath are required",
      );
    }
    await assertFilesExist(options.ffmpegPath, options.ffprobePath);
    return {
      ffmpegPath: options.ffmpegPath,
      ffprobePath: options.ffprobePath,
      source: "explicit",
    };
  }

  const env = options.env ?? process.env;
  if (env.FFMPEG_PATH || env.FFPROBE_PATH) {
    if (!env.FFMPEG_PATH || !env.FFPROBE_PATH) {
      throw new VideoPipelineError(
        "TOOL_NOT_FOUND",
        "Both FFMPEG_PATH and FFPROBE_PATH are required",
      );
    }
    await assertFilesExist(env.FFMPEG_PATH, env.FFPROBE_PATH);
    return {
      ffmpegPath: env.FFMPEG_PATH,
      ffprobePath: env.FFPROBE_PATH,
      source: "environment",
    };
  }

  const candidates = options.pathCandidates ?? { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
  const runner = options.runner ?? new NodeProcessRunner();
  if (
    (await commandWorks(runner, candidates.ffmpeg)) &&
    (await commandWorks(runner, candidates.ffprobe))
  ) {
    return {
      ffmpegPath: candidates.ffmpeg,
      ffprobePath: candidates.ffprobe,
      source: "path",
    };
  }

  const staticPaths = options.staticPaths ?? loadStaticPaths();
  if (staticPaths.ffmpegPath && staticPaths.ffprobePath) {
    await assertFilesExist(staticPaths.ffmpegPath, staticPaths.ffprobePath);
    return {
      ffmpegPath: staticPaths.ffmpegPath,
      ffprobePath: staticPaths.ffprobePath,
      source: "dev_dependency",
    };
  }

  throw new VideoPipelineError(
    "TOOL_NOT_FOUND",
    "FFmpeg and ffprobe were not found via explicit paths, environment, PATH or dev dependencies",
  );
}

async function commandWorks(runner: ProcessRunner, command: string): Promise<boolean> {
  try {
    const result = await runner.run(command, ["-version"], { allowFailure: true });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function assertFilesExist(...paths: string[]): Promise<void> {
  try {
    await Promise.all(paths.map((path) => access(path)));
  } catch {
    throw new VideoPipelineError("TOOL_NOT_FOUND", "Configured media tool path does not exist", {
      paths,
    });
  }
}

function loadStaticPaths(): { ffmpegPath: string | null; ffprobePath: string | null } {
  const require = createRequire(import.meta.url);
  return {
    ffmpegPath: loadStaticPath(require, "ffmpeg-static"),
    ffprobePath: loadStaticPath(require, "ffprobe-static", "path"),
  };
}

function loadStaticPath(
  require: NodeJS.Require,
  packageName: string,
  property?: string,
): string | null {
  try {
    const loaded = require(packageName) as unknown;
    if (typeof loaded === "string") return loaded;
    if (property && isRecord(loaded) && typeof loaded[property] === "string") {
      return loaded[property];
    }
    if (isRecord(loaded) && typeof loaded.default === "string") return loaded.default;
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
