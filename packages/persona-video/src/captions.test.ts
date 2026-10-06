import { describe, expect, it } from "vitest";
import {
  VideoPipelineError,
  type CapabilityProviderDescriptor,
  type EditDecisionList,
  type ProcessRunner,
  type Transcript,
} from "./contracts";
import { captionsToSrt, retimeTranscriptToEdl, validateTranscript } from "./captions";
import {
  DeterministicTranscriptProvider,
  TranscriptProviderChain,
  resolveTranscript,
  type ProviderAvailability,
  type TranscriptProvider,
  type TranscriptProviderInput,
} from "./transcription";

describe("transcription contract", () => {
  it("accepts any provider implementing the provider-neutral interface", async () => {
    const provider: TranscriptProvider = {
      descriptor: descriptor("custom-provider", "EXTERNAL", true, true),
      availability: async () => ({ available: true }),
      transcribe: async () => ({
        transcript: {
          language: "ru",
          provider: "provider-native-value-is-ignored",
          confidence: 0.8,
          limitations: [],
          segments: [{ startMs: 100, endMs: 900, text: "Привет", confidence: 0.8 }],
        },
        diagnosticArtifacts: ["raw.json"],
      }),
    };

    const result = await resolveTranscript(provider, "clip.mp4");

    expect(result).toEqual({
      status: "available",
      transcript: {
        language: "ru",
        provider: "custom-provider",
        confidence: 0.8,
        limitations: [],
        segments: [{ startMs: 100, endMs: 900, text: "Привет", confidence: 0.8 }],
      },
      warning: null,
      diagnosticArtifacts: ["raw.json"],
      providerUsage: {
        providerUsed: "custom-provider",
        fallbackOccurred: false,
        fallbackReason: null,
        quotaDependency: true,
        localProcessing: false,
        externalCostRequired: true,
        attempts: [
          {
            providerId: "custom-provider",
            status: "USED",
            code: null,
            reason: null,
          },
        ],
      },
    });
  });

  it("reports unavailable instead of inventing production transcription", async () => {
    await expect(resolveTranscript(null, "clip.mp4")).resolves.toEqual({
      status: "unavailable",
      transcript: null,
      warning: "No transcription provider configured",
      diagnosticArtifacts: [],
      providerUsage: {
        providerUsed: null,
        fallbackOccurred: false,
        fallbackReason: "No transcription provider configured",
        quotaDependency: false,
        localProcessing: false,
        externalCostRequired: false,
        attempts: [],
      },
    });
  });

  it("provides a deterministic adapter for tests and harnesses", async () => {
    const fixture: Transcript = {
      language: "ru",
      provider: "fixture",
      confidence: null,
      limitations: [],
      segments: [{ startMs: 0, endMs: 500, text: "Раз", confidence: null }],
    };
    const provider = new DeterministicTranscriptProvider(fixture);

    expect((await provider.transcribe(providerInput())).transcript).toEqual(fixture);
    expect((await provider.transcribe(providerInput())).transcript).not.toBe(fixture);
  });

  it("uses a permitted available external provider without fallback", async () => {
    const chain = new TranscriptProviderChain([
      { provider: fakeProvider("external", "EXTERNAL"), allowed: true },
      { provider: fakeProvider("local", "LOCAL"), allowed: true },
    ]);

    const result = await chain.resolve(providerInput());

    expect(result.status).toBe("available");
    expect(result.providerUsage).toEqual({
      providerUsed: "external",
      fallbackOccurred: false,
      fallbackReason: null,
      quotaDependency: true,
      localProcessing: false,
      externalCostRequired: true,
      attempts: [{ providerId: "external", status: "USED", code: null, reason: null }],
    });
  });

  it("falls back to local when an external provider is unavailable", async () => {
    const chain = new TranscriptProviderChain([
      {
        provider: fakeProvider("external", "EXTERNAL", {
          available: false,
          code: "UNAVAILABLE",
          reason: "service offline",
        }),
        allowed: true,
      },
      { provider: fakeProvider("local", "LOCAL"), allowed: true },
    ]);

    const result = await chain.resolve(providerInput());

    expect(result.providerUsage.providerUsed).toBe("local");
    expect(result.providerUsage.fallbackOccurred).toBe(true);
    expect(result.providerUsage.fallbackReason).toContain("service offline");
    expect(result.providerUsage).toMatchObject({
      quotaDependency: false,
      localProcessing: true,
      externalCostRequired: false,
    });
  });

  it("falls back to local when an external provider reports quota exhaustion", async () => {
    const chain = new TranscriptProviderChain([
      {
        provider: fakeProvider("external", "EXTERNAL", {
          available: false,
          code: "QUOTA_EXHAUSTED",
          reason: "monthly minutes exhausted",
        }),
        allowed: true,
      },
      { provider: fakeProvider("local", "LOCAL"), allowed: true },
    ]);

    const result = await chain.resolve(providerInput());

    expect(result.providerUsage.providerUsed).toBe("local");
    expect(result.providerUsage.fallbackOccurred).toBe(true);
    expect(result.providerUsage.fallbackReason).toContain("QUOTA_EXHAUSTED");
  });

  it("falls back to local when an external provider throws", async () => {
    const external = fakeProvider("external", "EXTERNAL");
    external.transcribe = async () => {
      throw new Error("remote failed");
    };
    const chain = new TranscriptProviderChain([
      { provider: external, allowed: true },
      { provider: fakeProvider("local", "LOCAL"), allowed: true },
    ]);

    const result = await chain.resolve(providerInput());

    expect(result.providerUsage.providerUsed).toBe("local");
    expect(result.providerUsage.fallbackOccurred).toBe(true);
    expect(result.providerUsage.fallbackReason).toContain("remote failed");
    expect(result.providerUsage.attempts[0]).toMatchObject({
      providerId: "external",
      status: "FAILED",
      code: "PROVIDER_ERROR",
    });
  });

  it("uses local directly when no external provider is configured", async () => {
    const chain = new TranscriptProviderChain([
      { provider: fakeProvider("local", "LOCAL"), allowed: true },
    ]);

    const result = await chain.resolve(providerInput());

    expect(result.providerUsage).toMatchObject({
      providerUsed: "local",
      fallbackOccurred: false,
      fallbackReason: null,
      quotaDependency: false,
      localProcessing: true,
      externalCostRequired: false,
    });
  });
});

describe("captionsToSrt", () => {
  it("maps source transcript cues through cumulative EDL cuts", () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      confidence: null,
      limitations: [],
      segments: [
        { startMs: 1_000, endMs: 1_500, text: "После вступления", confidence: null },
        { startMs: 2_000, endMs: 2_500, text: "После паузы", confidence: null },
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
      { startMs: 400, endMs: 900, text: "После вступления", confidence: null },
      { startMs: 1_200, endMs: 1_700, text: "После паузы", confidence: null },
    ]);
  });

  it("sorts cues, formats timestamps and normalizes multiline text", () => {
    const transcript: Transcript = {
      language: "ru",
      provider: "fixture",
      confidence: null,
      limitations: [],
      segments: [
        { startMs: 61_001, endMs: 62_045, text: " Вторая\r\n строка ", confidence: null },
        { startMs: 0, endMs: 999, text: "Первая", confidence: null },
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
      confidence: null,
      limitations: [],
      segments: [
        { startMs: 0, endMs: 1000, text: "one", confidence: null },
        { startMs: 900, endMs: 800, text: "two", confidence: null },
      ],
    };

    expect(() => validateTranscript(transcript)).toThrowError(
      expect.objectContaining<Partial<VideoPipelineError>>({ code: "INVALID_TRANSCRIPT" }),
    );

    expect(() =>
      validateTranscript({
        ...transcript,
        segments: [
          { startMs: 0, endMs: 1000, text: "one", confidence: null },
          { startMs: 900, endMs: 1200, text: "two", confidence: null },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TRANSCRIPT" }));
  });

  it("normalizes provider-neutral confidence and drops provider-specific fields", () => {
    const transcript = validateTranscript({
      language: "ru",
      provider: "local",
      confidence: 0.9,
      limitations: ["  noisy room  ", "", "no diarization"],
      providerPayload: { tokens: [1, 2, 3] },
      segments: [
        {
          startMs: 100.4,
          endMs: 900.6,
          text: " Привет ",
          confidence: 0.7,
          tokenProbabilities: [0.7],
        },
      ],
    } as unknown as Transcript & Record<string, unknown>);

    expect(transcript).toEqual({
      language: "ru",
      provider: "local",
      confidence: 0.9,
      limitations: ["noisy room", "no diarization"],
      segments: [
        { startMs: 100, endMs: 901, text: "Привет", confidence: 0.7 },
      ],
    });
  });
});

function descriptor(
  id: string,
  execution: "LOCAL" | "EXTERNAL",
  quotaDependency = execution === "EXTERNAL",
  externalCostRequired = execution === "EXTERNAL",
): CapabilityProviderDescriptor {
  return {
    id,
    execution,
    capabilities: ["TRANSCRIPTION", "CAPTION_TIMING"],
    quotaDependency,
    externalCostRequired,
  };
}

function fakeProvider(
  id: string,
  execution: "LOCAL" | "EXTERNAL",
  availability: ProviderAvailability = { available: true },
): TranscriptProvider {
  return {
    descriptor: descriptor(id, execution),
    availability: async () => availability,
    transcribe: async () => ({
      transcript: {
        language: "ru",
        provider: id,
        confidence: 0.85,
        limitations: [],
        segments: [{ startMs: 0, endMs: 500, text: "Раз", confidence: 0.85 }],
      },
      diagnosticArtifacts: [],
    }),
  };
}

function providerInput(): TranscriptProviderInput {
  const runner: ProcessRunner = {
    run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  };
  return {
    audioPath: "clip.wav",
    language: "ru",
    artifactDirectory: ".",
    runner,
  };
}

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
