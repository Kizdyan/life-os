import { describe, expect, it } from "vitest";
import type { Transcript } from "./contracts";
import {
  auditCaptionLayout,
  captionsToAss,
  INSTAGRAM_CAPTION_PRESET,
  layoutCaptionTranscript,
  type CaptionTextMeasurer,
} from "./caption-layout";

const variableWidthMeasurer: CaptionTextMeasurer = {
  measureWidthPx: async (text) =>
    [...text].reduce((sum, character) => sum + (character === "Ш" ? 70 : character === " " ? 8 : 18), 0),
};

describe("layoutCaptionTranscript", () => {
  it("splits long segments into short timed cues with no more than two pixel-safe lines", async () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "local-deterministic-normalizer",
      confidence: 0.9,
      limitations: [],
      segments: [
        {
          startMs: 1000,
          endMs: 11_000,
          text: "Широкая Шапка проверяет реальную ширину русских букв и создаёт короткие читаемые фразы",
          confidence: 0.9,
        },
      ],
    };

    const result = await layoutCaptionTranscript(transcript, variableWidthMeasurer, {
      safeWidthPx: 360,
      maxCueDurationMs: 3000,
      maxWordsPerCue: 6,
    });

    expect(result.segments.length).toBeGreaterThanOrEqual(4);
    expect(result.segments[0].startMs).toBe(1000);
    expect(result.segments.at(-1)?.endMs).toBe(11_000);
    for (const segment of result.segments) {
      const lines = segment.text.split("\n");
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(segment.endMs - segment.startMs).toBeLessThanOrEqual(3000);
      for (const line of lines) {
        await expect(variableWidthMeasurer.measureWidthPx(line)).resolves.toBeLessThanOrEqual(360);
      }
    }
    await expect(auditCaptionLayout(result, variableWidthMeasurer, 360)).resolves.toMatchObject({
      cueCount: result.segments.length,
      maxLinesObserved: 2,
      withinSafeWidth: true,
      safeWidthPx: 360,
    });
  });

  it("uses measured glyph width instead of character count alone", async () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      confidence: 1,
      limitations: [],
      segments: [
        { startMs: 0, endMs: 2000, text: "ШШ iiiiiiiiii", confidence: 1 },
      ],
    };

    const result = await layoutCaptionTranscript(transcript, variableWidthMeasurer, {
      safeWidthPx: 200,
      maxCueDurationMs: 4000,
      maxWordsPerCue: 8,
    });

    expect(result.segments.map((segment) => segment.text)).toEqual(["ШШ\niiiiiiiiii"]);
  });

  it("keeps every cue within the configured maximum duration", async () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      confidence: 1,
      limitations: [],
      segments: [
        {
          startMs: 0,
          endMs: 9000,
          text: "длинноеслово длинноеслово коротко а б в г д е ж з",
          confidence: 1,
        },
      ],
    };

    const result = await layoutCaptionTranscript(transcript, variableWidthMeasurer, {
      safeWidthPx: 1000,
      maxCueDurationMs: 3000,
      maxWordsPerCue: 4,
    });

    expect(result.segments.every((segment) => segment.endMs - segment.startMs <= 3000)).toBe(true);
  });
});

describe("captionsToAss", () => {
  it("writes an exact 1080x1920 Instagram lower-middle safe-area style", () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      confidence: 1,
      limitations: [],
      segments: [
        { startMs: 0, endMs: 2000, text: "Первая строка\nВторая строка", confidence: 1 },
      ],
    };

    const ass = captionsToAss(transcript, INSTAGRAM_CAPTION_PRESET);

    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Style: Default,Arial,64");
    expect(ass).toContain(",100,116,360,1");
    expect(ass).toContain("Первая строка\\NВторая строка");
  });
});
