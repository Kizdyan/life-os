import { describe, expect, it } from "vitest";
import { VideoPipelineError, type EditDecisionList, type Transcript } from "./contracts";
import { captionsToSrt, retimeTranscriptToEdl, validateTranscript } from "./captions";
import {
  DeterministicTranscriptProvider,
  resolveTranscript,
  type TranscriptProvider,
} from "./transcription";

describe("transcription contract", () => {
  it("accepts any provider implementing the provider-neutral interface", async () => {
    const provider: TranscriptProvider = {
      id: "custom-provider",
      transcribe: async () => ({
        language: "ru",
        provider: "custom-provider",
        segments: [{ startMs: 100, endMs: 900, text: "Привет" }],
      }),
    };

    const result = await resolveTranscript(provider, "clip.mp4");

    expect(result).toEqual({
      status: "available",
      transcript: {
        language: "ru",
        provider: "custom-provider",
        segments: [{ startMs: 100, endMs: 900, text: "Привет" }],
      },
      warning: null,
    });
  });

  it("reports unavailable instead of inventing production transcription", async () => {
    await expect(resolveTranscript(null, "clip.mp4")).resolves.toEqual({
      status: "unavailable",
      transcript: null,
      warning: "No transcription provider configured",
    });
  });

  it("provides a deterministic adapter for tests and harnesses", async () => {
    const fixture: Transcript = {
      language: "ru",
      provider: "fixture",
      segments: [{ startMs: 0, endMs: 500, text: "Раз" }],
    };
    const provider = new DeterministicTranscriptProvider(fixture);

    expect(await provider.transcribe("ignored.mp4")).toEqual(fixture);
    expect((await provider.transcribe("ignored.mp4"))).not.toBe(fixture);
  });
});

describe("captionsToSrt", () => {
  it("maps source transcript cues through cumulative EDL cuts", () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      segments: [
        { startMs: 1_000, endMs: 1_500, text: "После вступления" },
        { startMs: 2_000, endMs: 2_500, text: "После паузы" },
      ],
    };
    const edl: EditDecisionList = {
      version: 1,
      inputDurationMs: 3_000,
      decisions: [
        decision(0, 600, "CUT"),
        decision(600, 1_700, "KEEP"),
        decision(1_700, 1_900, "CUT"),
        decision(1_900, 3_000, "KEEP"),
      ],
    };

    expect(retimeTranscriptToEdl(transcript, edl).segments).toEqual([
      { startMs: 400, endMs: 900, text: "После вступления" },
      { startMs: 1_200, endMs: 1_700, text: "После паузы" },
    ]);
  });

  it("sorts cues, formats timestamps and normalizes multiline text", () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      segments: [
        { startMs: 61_001, endMs: 62_045, text: " Вторая\r\n строка " },
        { startMs: 0, endMs: 999, text: "Первая" },
      ],
    };

    expect(captionsToSrt(transcript)).toBe(
      "1\n00:00:00,000 --> 00:00:00,999\nПервая\n\n" +
        "2\n00:01:01,001 --> 00:01:02,045\nВторая\nстрока\n",
    );
  });

  it("rejects invalid or overlapping timed segments", () => {
    const transcript: Transcript = {
      language: null,
      provider: "fixture",
      segments: [
        { startMs: 0, endMs: 1000, text: "one" },
        { startMs: 900, endMs: 800, text: "two" },
      ],
    };

    expect(() => validateTranscript(transcript)).toThrowError(
      expect.objectContaining<Partial<VideoPipelineError>>({ code: "INVALID_TRANSCRIPT" }),
    );

    expect(() =>
      validateTranscript({
        ...transcript,
        segments: [
          { startMs: 0, endMs: 1000, text: "one" },
          { startMs: 900, endMs: 1200, text: "two" },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TRANSCRIPT" }));
  });
});

function decision(
  sourceStartMs: number,
  sourceEndMs: number,
  action: "KEEP" | "CUT",
) {
  return {
    sourceStartMs,
    sourceEndMs,
    action,
    reason: "test",
    confidence: 1,
    signalSource: "OBJECTIVE" as const,
  };
}
