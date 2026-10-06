import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { processVideo } from "./pipeline";

export interface CliIo {
  out(message: string): void;
  error(message: string): void;
}

const DEFAULT_IO: CliIo = {
  out: (message) => console.log(message),
  error: (message) => console.error(message),
};

export async function runCli(args: string[], io: CliIo = DEFAULT_IO): Promise<number> {
  const parsed = parseArgs(args);
  if (parsed.help) {
    io.out("Usage: npm run persona:video -- <input-file> [--output <directory>]");
    return 0;
  }
  if (!parsed.inputPath) {
    io.error("Usage: npm run persona:video -- <input-file> [--output <directory>]");
    return 2;
  }
  try {
    const result = await processVideo({
      inputPath: parsed.inputPath,
      outputRoot: parsed.outputRoot ?? resolve("output/persona-video"),
      onProgress: (stage) => io.out(`[persona-video] ${stage}`),
    });
    io.out(result.reportPath);
    return 0;
  } catch (error) {
    const code = isErrorWithCode(error) ? error.code : "PROCESS_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    io.error(`${code}: ${message}`);
    return 1;
  }
}

function parseArgs(args: string[]): {
  inputPath: string | null;
  outputRoot: string | null;
  help: boolean;
} {
  let inputPath: string | null = null;
  let outputRoot: string | null = null;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--") {
      continue;
    }
    if (args[index] === "--help" || args[index] === "-h") {
      help = true;
    } else if (args[index] === "--output") {
      outputRoot = args[index + 1] ? resolve(args[index + 1]) : null;
      index += 1;
    } else if (!inputPath) {
      inputPath = resolve(args[index]);
    }
  }
  return { inputPath, outputRoot, help };
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
