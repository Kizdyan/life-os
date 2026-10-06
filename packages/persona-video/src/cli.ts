import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { processVideo } from "./pipeline";
import { WhisperCppTranscriptProvider } from "./whisper-cpp";

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
    io.out(helpText());
    return 0;
  }
  if (!parsed.inputPath) {
    io.error(helpText());
    return 2;
  }
  const whisperCppPath = parsed.whisperCppPath ?? process.env.WHISPER_CPP_PATH ?? null;
  const whisperModelPath = parsed.whisperModelPath ?? process.env.WHISPER_MODEL_PATH ?? null;
  if ((whisperCppPath === null) !== (whisperModelPath === null)) {
    io.error("Both WHISPER_CPP_PATH and WHISPER_MODEL_PATH (or matching CLI flags) are required");
    return 2;
  }
  try {
    const transcriptCandidates =
      whisperCppPath && whisperModelPath
        ? [
            {
              provider: new WhisperCppTranscriptProvider({
                executablePath: whisperCppPath,
                modelPath: whisperModelPath,
                language: parsed.language,
                threads: parsed.threads,
              }),
              allowed: true,
            },
          ]
        : undefined;
    const result = await processVideo({
      inputPath: parsed.inputPath,
      outputRoot: parsed.outputRoot ?? resolve("output/persona-video"),
      transcriptCandidates,
      transcriptRequired: transcriptCandidates !== undefined,
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
  whisperCppPath: string | null;
  whisperModelPath: string | null;
  language: string;
  threads: number;
} {
  let inputPath: string | null = null;
  let outputRoot: string | null = null;
  let help = false;
  let whisperCppPath: string | null = null;
  let whisperModelPath: string | null = null;
  let language = "ru";
  let threads = 4;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--") {
      continue;
    }
    if (args[index] === "--help" || args[index] === "-h") {
      help = true;
    } else if (args[index] === "--output") {
      outputRoot = args[index + 1] ? resolve(args[index + 1]) : null;
      index += 1;
    } else if (args[index] === "--whisper-cpp") {
      whisperCppPath = args[index + 1] ? resolve(args[index + 1]) : null;
      index += 1;
    } else if (args[index] === "--whisper-model") {
      whisperModelPath = args[index + 1] ? resolve(args[index + 1]) : null;
      index += 1;
    } else if (args[index] === "--language") {
      language = args[index + 1] || "ru";
      index += 1;
    } else if (args[index] === "--threads") {
      threads = Number(args[index + 1]);
      index += 1;
    } else if (!inputPath) {
      inputPath = resolve(args[index]);
    }
  }
  return {
    inputPath,
    outputRoot,
    help,
    whisperCppPath,
    whisperModelPath,
    language,
    threads,
  };
}

function helpText(): string {
  return [
    "Usage: npm run persona:video -- <input-file> [--output <directory>]",
    "  --whisper-cpp <path>    Local whisper-cli executable (or WHISPER_CPP_PATH)",
    "  --whisper-model <path>  Local multilingual model (or WHISPER_MODEL_PATH)",
    "  --language <code>       Transcript language, default ru",
    "  --threads <count>       Local Whisper threads, default 4",
  ].join("\n");
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
