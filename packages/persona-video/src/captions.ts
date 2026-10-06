import type { EditDecisionList, Transcript, TranscriptSegment } from "./contracts";
import { VideoPipelineError } from "./contracts";

export function validateTranscript(transcript: Transcript): Transcript {
  const segments = [...transcript.segments].sort((left, right) => left.startMs - right.startMs);
  let previousEnd = 0;
  for (const [index, segment] of segments.entries()) {
    if (
      !Number.isFinite(segment.startMs) ||
      !Number.isFinite(segment.endMs) ||
      segment.startMs < 0 ||
      segment.endMs <= segment.startMs ||
      segment.text.trim() === ""
    ) {
      throw new VideoPipelineError("INVALID_TRANSCRIPT", "Transcript segment is invalid", {
        index,
        segment,
      });
    }
    if (index > 0 && segment.startMs < previousEnd) {
      throw new VideoPipelineError("INVALID_TRANSCRIPT", "Transcript segments overlap", {
        index,
        previousEnd,
        startMs: segment.startMs,
      });
    }
    previousEnd = segment.endMs;
  }
  return {
    language: transcript.language,
    provider: transcript.provider,
    segments: segments.map(normalizeSegment),
  };
}

export function captionsToSrt(transcript: Transcript): string {
  const validated = validateTranscript(transcript);
  return validated.segments
    .map(
      (segment, index) =>
        `${index + 1}\n${formatSrtTime(segment.startMs)} --> ${formatSrtTime(
          segment.endMs,
        )}\n${segment.text}\n`,
    )
    .join("\n");
}

export function retimeTranscriptToEdl(
  transcript: Transcript,
  editDecisionList: EditDecisionList,
): Transcript {
  const validated = validateTranscript(transcript);
  const keepRanges = editDecisionList.decisions
    .filter((decision) => decision.action === "KEEP")
    .sort((left, right) => left.sourceStartMs - right.sourceStartMs);
  const segments: TranscriptSegment[] = [];
  let outputCursorMs = 0;

  for (const keep of keepRanges) {
    for (const segment of validated.segments) {
      const sourceStartMs = Math.max(segment.startMs, keep.sourceStartMs);
      const sourceEndMs = Math.min(segment.endMs, keep.sourceEndMs);
      if (sourceEndMs <= sourceStartMs) continue;
      segments.push({
        startMs: outputCursorMs + sourceStartMs - keep.sourceStartMs,
        endMs: outputCursorMs + sourceEndMs - keep.sourceStartMs,
        text: segment.text,
      });
    }
    outputCursorMs += keep.sourceEndMs - keep.sourceStartMs;
  }

  return {
    language: validated.language,
    provider: validated.provider,
    segments,
  };
}

function normalizeSegment(segment: TranscriptSegment): TranscriptSegment {
  return {
    startMs: Math.round(segment.startMs),
    endMs: Math.round(segment.endMs),
    text: segment.text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n"),
  };
}

function formatSrtTime(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
