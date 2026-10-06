import type {
  AudioAnalysis,
  AudioNormalizationTarget,
  CapabilityProviderDescriptor,
  LoudnessMeasurement,
  ProcessRunner,
  VerifiedMediaOutput,
  VideoMetadata,
} from "./contracts";
import { VideoPipelineError } from "./contracts";
import { renderAtomically } from "./render-utils";
import type { ProviderUsageReport } from "./transcription";

export interface AudioNormalizationInput {
  metadata: VideoMetadata;
  outputPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
  targetLufs?: number;
  truePeakDb?: number;
  loudnessRangeLu?: number;
  truePeakToleranceDb?: number;
}

export interface AudioNormalizationResult {
  output: VerifiedMediaOutput;
  before: AudioAnalysis;
  after: AudioAnalysis;
  firstPass: LoudnessMeasurement;
  target: AudioNormalizationTarget;
  providerUsage: ProviderUsageReport;
}

export interface AudioNormalizationProvider {
  readonly descriptor: CapabilityProviderDescriptor;
  normalize(input: AudioNormalizationInput): Promise<AudioNormalizationResult>;
}

export async function analyzeAudio(input: {
  metadata: VideoMetadata;
  ffmpegPath: string;
  runner: ProcessRunner;
  quietThresholdDb?: number;
  clippingThresholdDb?: number;
}): Promise<AudioAnalysis> {
  if (!input.metadata.hasAudio) return noAudioAnalysis();

  const result = await input.runner.run(input.ffmpegPath, [
    "-nostdin",
    "-v",
    "info",
    "-i",
    input.metadata.inputPath,
    "-map",
    "0:a:0",
    "-af",
    "volumedetect,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const meanVolumeDb = parseDb(result.stderr, /mean_volume:\s*(-?[\d.]+)\s*dB/i);
  const maxVolumeDb = parseDb(result.stderr, /max_volume:\s*(-?[\d.]+)\s*dB/i);
  const loudness = parseLoudnorm(result.stderr);
  const quietThresholdDb = input.quietThresholdDb ?? -35;
  const clippingThresholdDb = input.clippingThresholdDb ?? -0.5;

  return {
    status: "available",
    meanVolumeDb,
    maxVolumeDb,
    integratedLoudnessLufs: loudness.integrated,
    truePeakDb: loudness.truePeak,
    tooQuiet:
      (meanVolumeDb !== null && meanVolumeDb < quietThresholdDb) ||
      (loudness.integrated !== null && loudness.integrated < quietThresholdDb),
    clippingRisk:
      (maxVolumeDb !== null && maxVolumeDb >= clippingThresholdDb) ||
      (loudness.truePeak !== null && loudness.truePeak >= clippingThresholdDb),
  };
}

export async function normalizeAudio(input: AudioNormalizationInput): Promise<VerifiedMediaOutput> {
  return (await new FfmpegLoudnessNormalizer().normalize(input)).output;
}

export class FfmpegLoudnessNormalizer implements AudioNormalizationProvider {
  readonly descriptor: CapabilityProviderDescriptor = {
    id: "ffmpeg-loudnorm-local",
    execution: "LOCAL",
    capabilities: ["LOUDNESS_NORMALIZATION"],
    quotaDependency: false,
    externalCostRequired: false,
  };

  async normalize(input: AudioNormalizationInput): Promise<AudioNormalizationResult> {
    if (!input.metadata.hasAudio) {
      throw new VideoPipelineError("UNSUPPORTED_INPUT", "Audio normalization requires audio");
    }
    const target: AudioNormalizationTarget = {
      integratedLoudnessLufs: input.targetLufs ?? -16,
      truePeakDb: input.truePeakDb ?? -1.5,
      loudnessRangeLu: input.loudnessRangeLu ?? 11,
    };
    const processingTarget: AudioNormalizationTarget = {
      ...target,
      truePeakDb: target.truePeakDb - 0.5,
    };
    const firstPass = await measureLoudness({
      path: input.metadata.inputPath,
      ffmpegPath: input.ffmpegPath,
      runner: input.runner,
      target: processingTarget,
      phase: "first pass",
    });
    const before = analysisFromLoudness(firstPass);

    let output: VerifiedMediaOutput;
    try {
      output = await renderAtomically({
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
              "-map",
              "0:v:0",
              "-map",
              "0:a:0",
              "-c:v",
              "copy",
              "-af",
              secondPassFilter(processingTarget, firstPass),
              "-c:a",
              "aac",
              "-b:a",
              "160k",
              "-movflags",
              "+faststart",
              temporaryPath,
            ],
            { timeoutMs: 300_000 },
          );
        },
      });
    } catch (error) {
      if (error instanceof VideoPipelineError && error.code === "UNREADABLE_INPUT") {
        throw new VideoPipelineError("INVALID_OUTPUT", "Normalized output is not decodable", {
          cause: error.message,
        });
      }
      throw error;
    }

    const verification = await measureLoudness({
      path: output.path,
      ffmpegPath: input.ffmpegPath,
      runner: input.runner,
      target,
      phase: "verification pass",
    });
    const after = analysisFromLoudness(verification);
    const peakTolerance = input.truePeakToleranceDb ?? 0.25;
    if (after.truePeakDb === null || after.truePeakDb > target.truePeakDb + peakTolerance) {
      throw new VideoPipelineError(
        "INVALID_OUTPUT",
        "Normalized output exceeds the true-peak safety bound",
        {
          measuredTruePeakDb: after.truePeakDb,
          targetTruePeakDb: target.truePeakDb,
          toleranceDb: peakTolerance,
        },
      );
    }

    return {
      output,
      before,
      after,
      firstPass,
      target,
      providerUsage: {
        providerUsed: this.descriptor.id,
        fallbackOccurred: false,
        fallbackReason: null,
        quotaDependency: false,
        localProcessing: true,
        externalCostRequired: false,
        attempts: [
          { providerId: this.descriptor.id, status: "USED", code: null, reason: null },
        ],
      },
    };
  }
}

function noAudioAnalysis(): AudioAnalysis {
  return {
    status: "no_audio",
    meanVolumeDb: null,
    maxVolumeDb: null,
    integratedLoudnessLufs: null,
    truePeakDb: null,
    tooQuiet: false,
    clippingRisk: false,
  };
}

function parseDb(stderr: string, expression: RegExp): number | null {
  const match = stderr.match(expression);
  if (!match) return null;
  return finiteOrNull(match[1]);
}

function parseLoudnorm(stderr: string): { integrated: number | null; truePeak: number | null } {
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) return { integrated: null, truePeak: null };
  try {
    const data = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      integrated: finiteOrNull(data.input_i),
      truePeak: finiteOrNull(data.input_tp),
    };
  } catch {
    return { integrated: null, truePeak: null };
  }
}

function finiteOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function measureLoudness(input: {
  path: string;
  ffmpegPath: string;
  runner: ProcessRunner;
  target: AudioNormalizationTarget;
  phase: string;
}): Promise<LoudnessMeasurement> {
  const result = await input.runner.run(
    input.ffmpegPath,
    [
      "-nostdin",
      "-v",
      "info",
      "-i",
      input.path,
      "-map",
      "0:a:0",
      "-af",
      `loudnorm=I=${input.target.integratedLoudnessLufs}:TP=${input.target.truePeakDb}:LRA=${input.target.loudnessRangeLu}:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: 300_000 },
  );
  const measurement = parseCompleteLoudness(result.stderr);
  if (!measurement) {
    throw new VideoPipelineError("INVALID_OUTPUT", `FFmpeg ${input.phase} has invalid loudness JSON`);
  }
  return measurement;
}

function parseCompleteLoudness(stderr: string): LoudnessMeasurement | null {
  const matches = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/gs) ?? [];
  for (const raw of matches.reverse()) {
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      const fields = [
        finiteOrNull(value.input_i),
        finiteOrNull(value.input_tp),
        finiteOrNull(value.input_lra),
        finiteOrNull(value.input_thresh),
        finiteOrNull(value.target_offset),
      ];
      if (fields.some((field) => field === null)) continue;
      return {
        inputIntegratedLoudnessLufs: fields[0]!,
        inputTruePeakDb: fields[1]!,
        inputLoudnessRangeLu: fields[2]!,
        inputThresholdLufs: fields[3]!,
        targetOffsetDb: fields[4]!,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function secondPassFilter(
  target: AudioNormalizationTarget,
  measured: LoudnessMeasurement,
): string {
  return [
    `loudnorm=I=${target.integratedLoudnessLufs}`,
    `TP=${target.truePeakDb}`,
    `LRA=${target.loudnessRangeLu}`,
    `measured_I=${measured.inputIntegratedLoudnessLufs}`,
    `measured_LRA=${measured.inputLoudnessRangeLu}`,
    `measured_TP=${measured.inputTruePeakDb}`,
    `measured_thresh=${measured.inputThresholdLufs}`,
    `offset=${measured.targetOffsetDb}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
}

function analysisFromLoudness(measurement: LoudnessMeasurement): AudioAnalysis {
  return {
    status: "available",
    meanVolumeDb: null,
    maxVolumeDb: null,
    integratedLoudnessLufs: measurement.inputIntegratedLoudnessLufs,
    truePeakDb: measurement.inputTruePeakDb,
    tooQuiet: measurement.inputIntegratedLoudnessLufs < -35,
    clippingRisk: measurement.inputTruePeakDb >= -0.5,
  };
}
