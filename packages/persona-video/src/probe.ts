import { stat } from "node:fs/promises";
import type { ProcessRunner, VideoMetadata } from "./contracts";
import { VideoPipelineError } from "./contracts";

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}

interface ProbeDocument {
  format?: {
    duration?: string;
    bit_rate?: string;
    size?: string;
    tags?: Record<string, string>;
  };
  streams?: ProbeStream[];
}

export function parseProbeJson(
  raw: string,
  inputPath: string,
  fileSizeBytes: number,
): VideoMetadata {
  let document: ProbeDocument;
  try {
    document = JSON.parse(raw) as ProbeDocument;
  } catch (error) {
    throw new VideoPipelineError("UNREADABLE_INPUT", "ffprobe returned invalid JSON", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const streams = Array.isArray(document.streams) ? document.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video) {
    throw new VideoPipelineError("UNSUPPORTED_INPUT", "Input has no video stream");
  }
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const storedWidth = finiteNumber(video.width);
  const storedHeight = finiteNumber(video.height);
  const rotationDegrees = normalizeRotation(readRotation(video));
  const quarterTurn = Math.abs(rotationDegrees) % 180 === 90;
  const width = quarterTurn ? storedHeight : storedWidth;
  const height = quarterTurn ? storedWidth : storedHeight;
  const durationSeconds = numberFromString(document.format?.duration);
  const fps = parseRational(video.avg_frame_rate ?? video.r_frame_rate ?? "0/1");

  return {
    inputPath,
    durationMs: Math.max(0, durationSeconds * 1000),
    width,
    height,
    orientation: width === height ? "square" : width < height ? "portrait" : "landscape",
    fps,
    videoCodec: video.codec_name ?? "unknown",
    bitrate: nullableNumber(document.format?.bit_rate),
    hasAudio: audio !== undefined,
    audioCodec: audio?.codec_name ?? null,
    fileSizeBytes,
    creationTime: document.format?.tags?.creation_time ?? video.tags?.creation_time ?? null,
    rotationDegrees,
  };
}

export async function probeVideo(input: {
  inputPath: string;
  ffprobePath: string;
  runner: ProcessRunner;
}): Promise<VideoMetadata> {
  let fileStats;
  try {
    fileStats = await stat(input.inputPath);
  } catch (error) {
    throw new VideoPipelineError("UNREADABLE_INPUT", "Input file cannot be read", {
      inputPath: input.inputPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fileStats.isFile()) {
    throw new VideoPipelineError("UNREADABLE_INPUT", "Input path is not a file", {
      inputPath: input.inputPath,
    });
  }

  try {
    const result = await input.runner.run(input.ffprobePath, [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      input.inputPath,
    ]);
    return parseProbeJson(result.stdout, input.inputPath, fileStats.size);
  } catch (error) {
    if (
      error instanceof VideoPipelineError &&
      (error.code === "UNREADABLE_INPUT" || error.code === "UNSUPPORTED_INPUT")
    ) {
      throw error;
    }
    throw new VideoPipelineError("UNREADABLE_INPUT", "ffprobe could not read input", {
      inputPath: input.inputPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function readRotation(stream: ProbeStream): number {
  const sideData = stream.side_data_list?.find((entry) => Number.isFinite(entry.rotation));
  if (sideData?.rotation !== undefined) return sideData.rotation;
  return numberFromString(stream.tags?.rotate);
}

function normalizeRotation(value: number): number {
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberFromString(value: string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRational(value: string): number {
  const [numeratorText, denominatorText] = value.split("/");
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? 1);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}
