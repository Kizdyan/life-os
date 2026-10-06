import { describe, expect, it } from "vitest";
import type { Transcript } from "./contracts";
import { normalizeTranscriptForCaptions } from "./transcript-normalize";

describe("normalizeTranscriptForCaptions", () => {
  it("adds only deterministic casing and punctuation while preserving the raw transcript", () => {
    const raw: Transcript = {
      language: "ru",
      provider: "whisper-cpp-local",
      confidence: 0.82,
      limitations: [],
      segments: [
        {
          startMs: 0,
          endMs: 3000,
          text: "  запись   для dji mini и instagram  ",
          confidence: 0.82,
        },
      ],
    };
    const snapshot = structuredClone(raw);

    const normalized = normalizeTranscriptForCaptions(raw);

    expect(raw).toEqual(snapshot);
    expect(normalized).toMatchObject({
      language: "ru",
      sourceProvider: "whisper-cpp-local",
      reviewRequired: false,
      normalization: {
        mode: "LOCAL_DETERMINISTIC",
        quotaDependency: false,
        externalCostRequired: false,
      },
      segments: [
        {
          sourceText: "  запись   для dji mini и instagram  ",
          text: "Запись для DJI Mini и Instagram.",
          reviewRequired: false,
          corrections: ["WHITESPACE", "CAPITALIZATION", "BRAND_CASING", "TERMINAL_PUNCTUATION"],
        },
      ],
    });
  });

  it("does not guess uncertain words and marks low-confidence text for review", () => {
    const raw: Transcript = {
      language: "ru",
      provider: "whisper-cpp-local",
      confidence: 0.77,
      limitations: [],
      segments: [
        { startMs: 0, endMs: 2000, text: "телефон считается", confidence: 0.77 },
      ],
    };

    const normalized = normalizeTranscriptForCaptions(raw);

    expect(normalized.reviewRequired).toBe(true);
    expect(normalized.segments[0]).toMatchObject({
      sourceText: "телефон считается",
      text: "Телефон считается.",
      reviewRequired: true,
    });
    expect(normalized.segments[0].corrections).not.toContain("WORD_REPLACEMENT");
  });

  it("does not invent sentence boundaries between consecutive Whisper chunks", () => {
    const raw: Transcript = {
      language: "ru",
      provider: "whisper-cpp-local",
      confidence: 0.9,
      limitations: [],
      segments: [
        { startMs: 0, endMs: 1000, text: "первая часть если", confidence: 0.9 },
        { startMs: 1000, endMs: 2000, text: "что это продолжение", confidence: 0.9 },
      ],
    };

    const normalized = normalizeTranscriptForCaptions(raw);

    expect(normalized.segments.map((segment) => segment.text)).toEqual([
      "Первая часть если",
      "что это продолжение.",
    ]);
  });
});
