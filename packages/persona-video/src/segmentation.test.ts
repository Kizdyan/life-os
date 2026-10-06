import { describe, expect, it } from "vitest";
import type { Transcript } from "./contracts";
import {
  buildObjectiveSegments,
  normalizeSilenceIntervals,
  parseSilenceDetect,
} from "./segmentation";

describe("parseSilenceDetect", () => {
  it("parses complete and trailing silence intervals", () => {
    const stderr = [
      "[silencedetect] silence_start: 0",
      "[silencedetect] silence_end: 0.6 | silence_duration: 0.6",
      "[silencedetect] silence_start: 9.2",
    ].join("\n");

    expect(parseSilenceDetect(stderr, 10_000)).toEqual([
      { startMs: 0, endMs: 600 },
      { startMs: 9200, endMs: 10_000 },
    ]);
  });
});

describe("normalizeSilenceIntervals", () => {
  it("clamps, sorts and merges overlapping or adjacent ranges", () => {
    expect(
      normalizeSilenceIntervals(
        [
          { startMs: 400, endMs: 900 },
          { startMs: -20, endMs: 450 },
          { startMs: 905, endMs: 1200 },
          { startMs: 1300, endMs: 1300 },
        ],
        1000,
        10,
      ),
    ).toEqual([{ startMs: 0, endMs: 1000 }]);
  });
});

describe("buildObjectiveSegments", () => {
  it("creates alternating objective content and silence segments", () => {
    const result = buildObjectiveSegments(5000, [
      { startMs: 0, endMs: 500 },
      { startMs: 2000, endMs: 3000 },
    ]);

    expect(result.map(({ sourceStartMs, sourceEndMs, kind, signalSource }) => ({
      sourceStartMs,
      sourceEndMs,
      kind,
      signalSource,
    }))).toEqual([
      { sourceStartMs: 0, sourceEndMs: 500, kind: "silence", signalSource: "OBJECTIVE" },
      { sourceStartMs: 500, sourceEndMs: 2000, kind: "content", signalSource: "OBJECTIVE" },
      { sourceStartMs: 2000, sourceEndMs: 3000, kind: "silence", signalSource: "OBJECTIVE" },
      { sourceStartMs: 3000, sourceEndMs: 5000, kind: "content", signalSource: "OBJECTIVE" },
    ]);
  });

  it("does not classify silence overlapping transcript speech as cuttable", () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      confidence: 1,
      limitations: [],
      segments: [{ startMs: 2400, endMs: 2800, text: "слово", confidence: 1 }],
    };

    const result = buildObjectiveSegments(
      5000,
      [{ startMs: 2000, endMs: 3000 }],
      transcript,
    );

    expect(result).toEqual([
      {
        sourceStartMs: 0,
        sourceEndMs: 5000,
        kind: "content",
        signalSource: "OBJECTIVE",
        confidence: 1,
      },
    ]);
  });
});
