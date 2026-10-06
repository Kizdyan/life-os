import type {
  EditAction,
  EditDecision,
  EditDecisionList,
  VideoSegment,
} from "./contracts";

export interface EdlPolicy {
  maxInternalSilenceMs: number;
  preservedPauseMs: number;
}

const DEFAULT_POLICY: EdlPolicy = {
  maxInternalSilenceMs: 1200,
  preservedPauseMs: 300,
};

export function buildEditDecisionList(
  durationMs: number,
  segments: VideoSegment[],
  policy: Partial<EdlPolicy> = {},
): EditDecisionList {
  const resolvedPolicy = { ...DEFAULT_POLICY, ...policy };
  const decisions: EditDecision[] = [];

  for (const segment of segments) {
    if (segment.kind === "content") {
      pushDecision(decisions, decision(segment, "KEEP", "content_or_natural_pause"));
      continue;
    }
    const leading = segment.sourceStartMs === 0;
    const trailing = segment.sourceEndMs === durationMs;
    if (leading || trailing) {
      pushDecision(
        decisions,
        decision(segment, "CUT", leading ? "leading_silence" : "trailing_silence"),
      );
      continue;
    }
    const duration = segment.sourceEndMs - segment.sourceStartMs;
    if (duration <= resolvedPolicy.maxInternalSilenceMs) {
      pushDecision(decisions, decision(segment, "KEEP", "content_or_natural_pause"));
      continue;
    }
    const keepEnd = Math.min(
      segment.sourceEndMs,
      segment.sourceStartMs + resolvedPolicy.preservedPauseMs,
    );
    if (keepEnd > segment.sourceStartMs) {
      pushDecision(
        decisions,
        decision(
          { ...segment, sourceEndMs: keepEnd },
          "KEEP",
          "content_or_natural_pause",
        ),
      );
    }
    if (keepEnd < segment.sourceEndMs) {
      pushDecision(
        decisions,
        decision(
          { ...segment, sourceStartMs: keepEnd },
          "CUT",
          "excess_internal_silence",
        ),
      );
    }
  }

  return { version: 1, inputDurationMs: durationMs, decisions };
}

function decision(
  segment: VideoSegment,
  action: EditAction,
  reason: string,
): EditDecision {
  return {
    sourceStartMs: segment.sourceStartMs,
    sourceEndMs: segment.sourceEndMs,
    action,
    reason,
    confidence: segment.confidence,
    signalSource: segment.signalSource,
  };
}

function pushDecision(decisions: EditDecision[], next: EditDecision): void {
  const previous = decisions.at(-1);
  if (
    previous &&
    previous.sourceEndMs === next.sourceStartMs &&
    previous.action === next.action &&
    previous.reason === next.reason &&
    previous.signalSource === next.signalSource
  ) {
    previous.sourceEndMs = next.sourceEndMs;
    previous.confidence = Math.min(previous.confidence, next.confidence);
  } else {
    decisions.push(next);
  }
}
