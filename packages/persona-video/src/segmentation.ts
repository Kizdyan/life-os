import type { ProcessRunner, Transcript, VideoSegment } from "./contracts";

export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface SilenceDetectionPolicy {
  noiseDb: number;
  minimumSilenceMs: number;
}

export interface SegmentationPolicy {
  minimumMeaningfulContentMs: number;
}

export async function detectSilence(input: {
  inputPath: string;
  durationMs: number;
  ffmpegPath: string;
  runner: ProcessRunner;
  policy?: Partial<SilenceDetectionPolicy>;
}): Promise<TimeRange[]> {
  const policy = {
    noiseDb: -35,
    minimumSilenceMs: 250,
    ...input.policy,
  };
  const result = await input.runner.run(input.ffmpegPath, [
    "-nostdin",
    "-v",
    "info",
    "-i",
    input.inputPath,
    "-af",
    `silencedetect=noise=${policy.noiseDb}dB:d=${policy.minimumSilenceMs / 1000}`,
    "-f",
    "null",
    "-",
  ]);
  return parseSilenceDetect(result.stderr, input.durationMs);
}

export function parseSilenceDetect(stderr: string, durationMs: number): TimeRange[] {
  const events = [...stderr.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)];
  const ranges: TimeRange[] = [];
  let openStart: number | null = null;
  for (const event of events) {
    const milliseconds = Math.round(Number(event[2]) * 1000);
    if (event[1] === "start") {
      openStart = milliseconds;
    } else if (openStart !== null) {
      ranges.push({ startMs: openStart, endMs: milliseconds });
      openStart = null;
    }
  }
  if (openStart !== null) ranges.push({ startMs: openStart, endMs: durationMs });
  return normalizeSilenceIntervals(ranges, durationMs);
}

export function normalizeSilenceIntervals(
  intervals: TimeRange[],
  durationMs: number,
  adjacencyToleranceMs = 1,
): TimeRange[] {
  const valid = intervals
    .map(({ startMs, endMs }) => ({
      startMs: Math.max(0, Math.min(durationMs, Math.round(startMs))),
      endMs: Math.max(0, Math.min(durationMs, Math.round(endMs))),
    }))
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((left, right) => left.startMs - right.startMs);

  const merged: TimeRange[] = [];
  for (const interval of valid) {
    const previous = merged.at(-1);
    if (previous && interval.startMs <= previous.endMs + adjacencyToleranceMs) {
      previous.endMs = Math.max(previous.endMs, interval.endMs);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

export function buildObjectiveSegments(
  durationMs: number,
  silenceIntervals: TimeRange[],
  transcript: Transcript | null = null,
  policy: Partial<SegmentationPolicy> = {},
): VideoSegment[] {
  const resolvedPolicy: SegmentationPolicy = {
    minimumMeaningfulContentMs: 200,
    ...policy,
  };
  const transcriptSegments = transcript?.segments ?? [];
  const protectedSilence = normalizeSilenceIntervals(silenceIntervals, durationMs).filter(
    (silence) =>
      !transcriptSegments.some(
        (speech) => speech.startMs < silence.endMs && speech.endMs > silence.startMs,
      ),
  );
  const segments: VideoSegment[] = [];
  let cursor = 0;
  for (const silence of protectedSilence) {
    if (silence.startMs > cursor) segments.push(segment(cursor, silence.startMs, "content"));
    segments.push(segment(silence.startMs, silence.endMs, "silence"));
    cursor = silence.endMs;
  }
  if (cursor < durationMs) segments.push(segment(cursor, durationMs, "content"));
  if (segments.length === 0 && durationMs > 0) {
    segments.push(segment(0, durationMs, "content"));
  }
  return cleanupMicroContent(segments, transcriptSegments, resolvedPolicy);
}

function cleanupMicroContent(
  segments: VideoSegment[],
  transcriptSegments: Transcript["segments"],
  policy: SegmentationPolicy,
): VideoSegment[] {
  const classified = segments.map((current): VideoSegment => {
    if (
      current.kind !== "content" ||
      current.sourceEndMs - current.sourceStartMs >= policy.minimumMeaningfulContentMs
    ) {
      return current;
    }
    const overlapsSpeech = transcriptSegments.some(
      (speech) =>
        speech.startMs < current.sourceEndMs && speech.endMs > current.sourceStartMs,
    );
    if (overlapsSpeech) {
      return { ...current, objectiveReason: "transcript_protected_content" };
    }
    return {
      ...current,
      kind: "silence",
      confidence: 0.98,
      objectiveReason: "micro_content_cleanup",
    };
  });

  const normalized: VideoSegment[] = [];
  for (const current of classified) {
    const previous = normalized.at(-1);
    if (previous && previous.kind === current.kind && previous.sourceEndMs === current.sourceStartMs) {
      previous.sourceEndMs = current.sourceEndMs;
      previous.confidence = Math.min(previous.confidence, current.confidence);
      if (
        previous.objectiveReason === "micro_content_cleanup" ||
        current.objectiveReason === "micro_content_cleanup"
      ) {
        previous.objectiveReason = "micro_content_cleanup";
      }
      continue;
    }
    normalized.push({ ...current });
  }
  return normalized;
}

function segment(
  sourceStartMs: number,
  sourceEndMs: number,
  kind: VideoSegment["kind"],
): VideoSegment {
  return {
    sourceStartMs,
    sourceEndMs,
    kind,
    signalSource: "OBJECTIVE",
    confidence: kind === "silence" ? 0.98 : 1,
  };
}
