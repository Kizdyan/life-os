import type {
  AudioAnalysis,
  ProcessRunner,
  VerifiedMediaOutput,
  VideoMetadata,
} from "./contracts";
import { VideoPipelineError } from "./contracts";
import { renderAtomically } from "./render-utils";

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

export async function normalizeAudio(input: {
  metadata: VideoMetadata;
  outputPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
  targetLufs?: number;
  truePeakDb?: number;
}): Promise<VerifiedMediaOutput> {
  if (!input.metadata.hasAudio) {
    throw new VideoPipelineError("UNSUPPORTED_INPUT", "Audio normalization requires audio");
  }
  const targetLufs = input.targetLufs ?? -16;
  const truePeakDb = input.truePeakDb ?? -1.5;
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
          "-map",
          "0:v:0",
          "-map",
          "0:a:0",
          "-c:v",
          "copy",
          "-af",
          `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=11`,
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
