import type {
  CapabilityProviderDescriptor,
  ProcessRunner,
  Transcript,
} from "./contracts";
import { validateTranscript } from "./captions";

export type ProviderAvailability =
  | { available: true }
  | {
      available: false;
      code: "NOT_ALLOWED" | "UNAVAILABLE" | "AUTH_REQUIRED" | "QUOTA_EXHAUSTED";
      reason: string;
    };

export interface ProviderAttempt {
  providerId: string;
  status: "USED" | "SKIPPED" | "FAILED";
  code: string | null;
  reason: string | null;
}

export interface ProviderUsageReport {
  providerUsed: string | null;
  fallbackOccurred: boolean;
  fallbackReason: string | null;
  quotaDependency: boolean;
  localProcessing: boolean;
  externalCostRequired: boolean;
  attempts: ProviderAttempt[];
}

export interface TranscriptProviderInput {
  audioPath: string;
  language: string;
  artifactDirectory: string;
  runner: ProcessRunner;
}

export interface TranscriptProviderResult {
  transcript: Transcript;
  diagnosticArtifacts: string[];
  providerDetails?: Record<string, string | number | boolean | null>;
}

export interface TranscriptProvider {
  readonly descriptor: CapabilityProviderDescriptor;
  availability(): Promise<ProviderAvailability>;
  transcribe(input: TranscriptProviderInput): Promise<TranscriptProviderResult>;
}

export interface TranscriptProviderCandidate {
  provider: TranscriptProvider;
  allowed: boolean;
}

export type TranscriptResolution =
  | {
      status: "available";
      transcript: Transcript;
      warning: string | null;
      diagnosticArtifacts: string[];
      providerDetails?: Record<string, string | number | boolean | null>;
      providerUsage: ProviderUsageReport;
    }
  | {
      status: "unavailable";
      transcript: null;
      warning: string;
      diagnosticArtifacts: string[];
      providerUsage: ProviderUsageReport;
    };

export class TranscriptProviderChain {
  constructor(private readonly candidates: TranscriptProviderCandidate[]) {}

  async resolve(input: TranscriptProviderInput): Promise<TranscriptResolution> {
    const attempts: ProviderAttempt[] = [];
    for (const candidate of this.candidates) {
      const { provider } = candidate;
      if (!candidate.allowed) {
        attempts.push(attempt(provider, "SKIPPED", "NOT_ALLOWED", "Provider not explicitly allowed"));
        continue;
      }

      let availability: ProviderAvailability;
      try {
        availability = await provider.availability();
      } catch (error) {
        attempts.push(attempt(provider, "FAILED", "AVAILABILITY_ERROR", errorMessage(error)));
        continue;
      }
      if (!availability.available) {
        attempts.push(attempt(provider, "SKIPPED", availability.code, availability.reason));
        continue;
      }

      try {
        const result = await provider.transcribe(input);
        const transcript = validateTranscript({
          ...result.transcript,
          provider: provider.descriptor.id,
        });
        const fallbackReason = summarizeFallback(attempts);
        const resolution: Extract<TranscriptResolution, { status: "available" }> = {
          status: "available",
          transcript,
          warning: fallbackReason,
          diagnosticArtifacts: [...result.diagnosticArtifacts],
          providerUsage: usage(provider.descriptor, [
            ...attempts,
            attempt(provider, "USED", null, null),
          ], fallbackReason),
        };
        if (result.providerDetails) {
          resolution.providerDetails = { ...result.providerDetails };
        }
        return resolution;
      } catch (error) {
        attempts.push(attempt(provider, "FAILED", "PROVIDER_ERROR", errorMessage(error)));
      }
    }

    const warning = summarizeFallback(attempts) ?? "No transcription provider available";
    return {
      status: "unavailable",
      transcript: null,
      warning,
      diagnosticArtifacts: [],
      providerUsage: {
        providerUsed: null,
        fallbackOccurred: attempts.length > 0,
        fallbackReason: warning,
        quotaDependency: false,
        localProcessing: false,
        externalCostRequired: false,
        attempts,
      },
    };
  }
}

export async function resolveTranscript(
  provider: TranscriptProvider | null,
  inputPath: string,
): Promise<TranscriptResolution> {
  if (!provider) {
    const warning = "No transcription provider configured";
    return {
      status: "unavailable",
      transcript: null,
      warning,
      diagnosticArtifacts: [],
      providerUsage: {
        providerUsed: null,
        fallbackOccurred: false,
        fallbackReason: warning,
        quotaDependency: false,
        localProcessing: false,
        externalCostRequired: false,
        attempts: [],
      },
    };
  }
  return new TranscriptProviderChain([{ provider, allowed: true }]).resolve({
    audioPath: inputPath,
    language: "auto",
    artifactDirectory: ".",
    runner: compatibilityRunner,
  });
}

export class DeterministicTranscriptProvider implements TranscriptProvider {
  readonly descriptor: CapabilityProviderDescriptor;
  private readonly fixture: Transcript;

  constructor(fixture: Transcript) {
    this.fixture = validateTranscript(fixture);
    this.descriptor = {
      id: this.fixture.provider,
      execution: "LOCAL",
      capabilities: ["TRANSCRIPTION", "CAPTION_TIMING"],
      quotaDependency: false,
      externalCostRequired: false,
    };
  }

  async availability(): Promise<ProviderAvailability> {
    return { available: true };
  }

  async transcribe(_input: TranscriptProviderInput): Promise<TranscriptProviderResult> {
    return {
      transcript: {
        language: this.fixture.language,
        provider: this.descriptor.id,
        confidence: this.fixture.confidence,
        limitations: [...this.fixture.limitations],
        segments: this.fixture.segments.map((segment) => ({ ...segment })),
      },
      diagnosticArtifacts: [],
    };
  }
}

function attempt(
  provider: TranscriptProvider,
  status: ProviderAttempt["status"],
  code: string | null,
  reason: string | null,
): ProviderAttempt {
  return { providerId: provider.descriptor.id, status, code, reason };
}

function usage(
  descriptor: CapabilityProviderDescriptor,
  attempts: ProviderAttempt[],
  fallbackReason: string | null,
): ProviderUsageReport {
  return {
    providerUsed: descriptor.id,
    fallbackOccurred: fallbackReason !== null,
    fallbackReason,
    quotaDependency: descriptor.quotaDependency,
    localProcessing: descriptor.execution === "LOCAL",
    externalCostRequired: descriptor.externalCostRequired,
    attempts,
  };
}

function summarizeFallback(attempts: ProviderAttempt[]): string | null {
  if (attempts.length === 0) return null;
  return attempts
    .map(
      ({ providerId, code, reason }) =>
        `${providerId}: ${code ?? "UNKNOWN"}${reason ? `: ${reason}` : ""}`,
    )
    .join("; ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const compatibilityRunner: ProcessRunner = {
  async run(): Promise<never> {
    throw new Error("Legacy transcript resolution cannot execute media processes");
  },
};
