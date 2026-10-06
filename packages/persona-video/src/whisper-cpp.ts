import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateTranscript } from "./captions";
import type {
  CapabilityProviderDescriptor,
  ProcessRunner,
  Transcript,
  TranscriptSegment,
} from "./contracts";
import { VideoPipelineError } from "./contracts";
import { hashFileSha256 } from "./file-hash";
import type {
  ProviderAvailability,
  TranscriptProvider,
  TranscriptProviderInput,
  TranscriptProviderResult,
} from "./transcription";

export interface WhisperCppTranscriptProviderOptions {
  executablePath: string;
  modelPath: string;
  language?: string;
  threads?: number;
  runner?: ProcessRunner;
}

export class WhisperCppTranscriptProvider implements TranscriptProvider {
  readonly descriptor: CapabilityProviderDescriptor = {
    id: "whisper-cpp-local",
    execution: "LOCAL",
    capabilities: ["TRANSCRIPTION", "CAPTION_TIMING"],
    quotaDependency: false,
    externalCostRequired: false,
  };

  private readonly language: string;
  private readonly threads: number;

  constructor(private readonly options: WhisperCppTranscriptProviderOptions) {
    this.language = options.language ?? "ru";
    this.threads = options.threads ?? 4;
    if (!Number.isInteger(this.threads) || this.threads < 1) {
      throw new VideoPipelineError("UNSUPPORTED_INPUT", "Whisper thread count must be positive", {
        threads: this.threads,
      });
    }
  }

  async availability(): Promise<ProviderAvailability> {
    try {
      await access(this.options.executablePath);
    } catch {
      return {
        available: false,
        code: "UNAVAILABLE",
        reason: `Whisper.cpp executable is unavailable: ${this.options.executablePath}`,
      };
    }
    try {
      await access(this.options.modelPath);
    } catch {
      return {
        available: false,
        code: "UNAVAILABLE",
        reason: `Whisper.cpp model is unavailable: ${this.options.modelPath}`,
      };
    }
    return { available: true };
  }

  async transcribe(input: TranscriptProviderInput): Promise<TranscriptProviderResult> {
    const runner = this.options.runner ?? input.runner;
    const language = input.language === "auto" ? this.language : input.language;
    await mkdir(input.artifactDirectory, { recursive: true });
    const outputBase = join(input.artifactDirectory, "whisper-result");
    const outputPath = `${outputBase}.json`;
    const args = [
      "-m",
      this.options.modelPath,
      "-f",
      input.audioPath,
      "-l",
      language,
      "-t",
      String(this.threads),
      "-ojf",
      "-of",
      outputBase,
      "-np",
    ];
    const processResult = await runner.run(this.options.executablePath, args);
    if (processResult.exitCode !== 0) {
      throw new VideoPipelineError("PROCESS_FAILED", "Whisper.cpp transcription failed", {
        exitCode: processResult.exitCode,
        stderr: processResult.stderr,
      });
    }

    let rawOutput: unknown;
    try {
      rawOutput = JSON.parse(await readFile(outputPath, "utf8"));
    } catch (error) {
      throw invalidTranscript("Whisper.cpp did not produce valid JSON", error);
    }
    const transcript = validateTranscript(mapWhisperTranscript(rawOutput, language));
    if (transcript.segments.length === 0) {
      throw invalidTranscript("Whisper.cpp returned an empty transcript");
    }

    return {
      transcript,
      diagnosticArtifacts: [outputPath],
      providerDetails: {
        executablePath: this.options.executablePath,
        modelPath: this.options.modelPath,
        language,
        threads: this.threads,
        modelSha256: await hashFileSha256(this.options.modelPath),
      },
    };
  }
}

function mapWhisperTranscript(raw: unknown, configuredLanguage: string): Transcript {
  if (!isRecord(raw) || !Array.isArray(raw.transcription)) {
    throw invalidTranscript("Whisper.cpp JSON has no transcription array");
  }
  const language =
    isRecord(raw.result) && typeof raw.result.language === "string"
      ? raw.result.language
      : configuredLanguage;
  const segments = raw.transcription.map(mapSegment);
  const knownConfidences = segments
    .map((segment) => segment.confidence)
    .filter((value): value is number => value !== null);
  return {
    language,
    provider: "whisper-cpp-local",
    confidence:
      knownConfidences.length === 0
        ? null
        : round(knownConfidences.reduce((sum, value) => sum + value, 0) / knownConfidences.length),
    limitations: [
      "Confidence is derived from mean Whisper token probabilities",
      "Speaker diarization is not available",
    ],
    segments,
  };
}

function mapSegment(value: unknown, index: number): TranscriptSegment {
  if (!isRecord(value) || !isRecord(value.offsets)) {
    throw invalidTranscript("Whisper.cpp segment is malformed", { index });
  }
  const startMs = value.offsets.from;
  const endMs = value.offsets.to;
  const text = value.text;
  if (typeof startMs !== "number" || typeof endMs !== "number" || typeof text !== "string") {
    throw invalidTranscript("Whisper.cpp segment fields are malformed", { index });
  }
  const probabilities = Array.isArray(value.tokens)
    ? value.tokens
        .map((token) => (isRecord(token) ? token.p : undefined))
        .filter((probability): probability is number =>
          typeof probability === "number" && Number.isFinite(probability),
        )
    : [];
  return {
    startMs,
    endMs,
    text,
    confidence:
      probabilities.length === 0
        ? null
        : round(probabilities.reduce((sum, probability) => sum + probability, 0) / probabilities.length),
  };
}

function invalidTranscript(message: string, details: unknown = {}): VideoPipelineError {
  return new VideoPipelineError("INVALID_TRANSCRIPT", message, {
    details: details instanceof Error ? details.message : details,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
