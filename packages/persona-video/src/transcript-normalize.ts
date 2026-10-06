import type { Transcript, TranscriptSegment } from "./contracts";

export type TranscriptCorrection =
  | "WHITESPACE"
  | "CAPITALIZATION"
  | "BRAND_CASING"
  | "TERMINAL_PUNCTUATION";

export interface NormalizedTranscriptSegment extends TranscriptSegment {
  sourceText: string;
  reviewRequired: boolean;
  corrections: TranscriptCorrection[];
}

export interface NormalizedTranscript {
  language: string | null;
  sourceProvider: string;
  confidence: number | null;
  reviewRequired: boolean;
  normalization: {
    mode: "LOCAL_DETERMINISTIC";
    quotaDependency: false;
    externalCostRequired: false;
  };
  segments: NormalizedTranscriptSegment[];
}

export function normalizeTranscriptForCaptions(
  transcript: Transcript,
  reviewConfidenceThreshold = 0.8,
): NormalizedTranscript {
  const segments = transcript.segments.map((segment) => {
    const corrections: TranscriptCorrection[] = [];
    let text = segment.text.replace(/\s+/g, " ").trim();
    if (text !== segment.text) corrections.push("WHITESPACE");

    const capitalized = text.replace(/(^|[.!?]\s+)([a-zа-яё])/giu, (_match, prefix, letter) =>
      `${prefix}${String(letter).toLocaleUpperCase("ru-RU")}`,
    );
    if (capitalized !== text) corrections.push("CAPITALIZATION");
    text = capitalized;

    const brandCased = text
      .replace(/\bdji\s+mini\b/giu, "DJI Mini")
      .replace(/\binstagram\b/giu, "Instagram");
    if (brandCased !== text) corrections.push("BRAND_CASING");
    text = brandCased;

    if (!/[.!?…]$/u.test(text)) {
      text += ".";
      corrections.push("TERMINAL_PUNCTUATION");
    }
    const reviewRequired = segment.confidence === null || segment.confidence < reviewConfidenceThreshold;
    return {
      ...segment,
      sourceText: segment.text,
      text,
      reviewRequired,
      corrections,
    };
  });

  return {
    language: transcript.language,
    sourceProvider: transcript.provider,
    confidence: transcript.confidence,
    reviewRequired: segments.some((segment) => segment.reviewRequired),
    normalization: {
      mode: "LOCAL_DETERMINISTIC",
      quotaDependency: false,
      externalCostRequired: false,
    },
    segments,
  };
}

export function normalizedTranscriptToCanonical(normalized: NormalizedTranscript): Transcript {
  return {
    language: normalized.language,
    provider: "local-deterministic-normalizer",
    confidence: normalized.confidence,
    limitations: normalized.reviewRequired ? ["Some normalized segments require human review"] : [],
    segments: normalized.segments.map(({ startMs, endMs, text, confidence }) => ({
      startMs,
      endMs,
      text,
      confidence,
    })),
  };
}
