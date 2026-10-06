import type { Transcript } from "./contracts";
import { validateTranscript } from "./captions";

export interface TranscriptProvider {
  readonly id: string;
  transcribe(inputPath: string): Promise<Transcript>;
}

export type TranscriptResolution =
  | { status: "available"; transcript: Transcript; warning: null }
  | { status: "unavailable"; transcript: null; warning: string };

export async function resolveTranscript(
  provider: TranscriptProvider | null,
  inputPath: string,
): Promise<TranscriptResolution> {
  if (!provider) {
    return {
      status: "unavailable",
      transcript: null,
      warning: "No transcription provider configured",
    };
  }
  const transcript = validateTranscript(await provider.transcribe(inputPath));
  return {
    status: "available",
    transcript: { ...transcript, provider: provider.id },
    warning: null,
  };
}

export class DeterministicTranscriptProvider implements TranscriptProvider {
  readonly id: string;

  constructor(private readonly fixture: Transcript) {
    this.id = fixture.provider;
  }

  async transcribe(_inputPath: string): Promise<Transcript> {
    return {
      language: this.fixture.language,
      provider: this.id,
      segments: this.fixture.segments.map((segment) => ({ ...segment })),
    };
  }
}
