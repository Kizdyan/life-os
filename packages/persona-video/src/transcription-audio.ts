import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  ProcessRunner,
  VerifiedAudioArtifact,
  VideoMetadata,
} from "./contracts";
import { VideoPipelineError } from "./contracts";

export async function extractTranscriptionAudio(input: {
  metadata: VideoMetadata;
  outputPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
}): Promise<VerifiedAudioArtifact> {
  if (!input.metadata.hasAudio) {
    throw new VideoPipelineError("UNSUPPORTED_INPUT", "Transcription requires an audio stream");
  }
  const temporaryPath = join(
    dirname(input.outputPath),
    `.${basename(input.outputPath, ".wav")}.partial-${randomUUID()}.wav`,
  );
  try {
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
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        temporaryPath,
      ],
      { timeoutMs: 300_000 },
    );
    const artifact = await probeAudio(temporaryPath, input.ffprobePath, input.runner);
    if (
      artifact.codec !== "pcm_s16le" ||
      artifact.sampleRateHz !== 16_000 ||
      artifact.channels !== 1 ||
      artifact.durationMs <= 0
    ) {
      throw new VideoPipelineError("INVALID_OUTPUT", "Transcription audio is invalid", {
        artifact,
      });
    }
    await rename(temporaryPath, input.outputPath);
    return { ...artifact, path: input.outputPath };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function probeAudio(
  path: string,
  ffprobePath: string,
  runner: ProcessRunner,
): Promise<VerifiedAudioArtifact> {
  const result = await runner.run(ffprobePath, [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    path,
  ]);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw new VideoPipelineError("INVALID_OUTPUT", "Unable to parse transcription audio metadata");
  }
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const audio = streams.find(
    (stream): stream is Record<string, unknown> =>
      typeof stream === "object" && stream !== null && stream.codec_type === "audio",
  );
  const format =
    typeof parsed.format === "object" && parsed.format !== null
      ? (parsed.format as Record<string, unknown>)
      : {};
  if (!audio) {
    throw new VideoPipelineError("INVALID_OUTPUT", "Transcription artifact has no audio stream");
  }
  return {
    path,
    durationMs: Math.round(number(format.duration) * 1000),
    codec: String(audio.codec_name ?? ""),
    sampleRateHz: number(audio.sample_rate),
    channels: number(audio.channels),
  };
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
