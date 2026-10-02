export type FormatUserSignal =
  | "published"
  | "explicit_approval"
  | "specific_feedback"
  | "saved_reference"
  | "inferred";

export type FormatAudienceSignal = "unknown" | "weak" | "mixed" | "strong";

export interface FormatMemoryObservation {
  formatKey: string;
  label: string;
  mechanics: string[];
  sourceAssetId: string;
  userSignal: FormatUserSignal;
  audienceSignal: FormatAudienceSignal;
  userFitWeight: number;
  audienceWeight: number;
  createdAt: string;
}

export interface FormatMemorySummary {
  formats: Array<{
    formatKey: string;
    label: string;
    mechanics: string[];
    userFitScore: number;
    audienceScore: number;
    samples: number;
  }>;
}

const USER_SIGNAL_WEIGHT: Record<FormatUserSignal, number> = {
  published: 1,
  explicit_approval: 0.9,
  specific_feedback: 0.82,
  saved_reference: 0.35,
  inferred: 0.15,
};

const AUDIENCE_SIGNAL_WEIGHT: Record<FormatAudienceSignal, number> = {
  unknown: 0,
  weak: 0.2,
  mixed: 0.5,
  strong: 1,
};

export function buildFormatObservation(input: {
  formatKey: string;
  label: string;
  mechanics: string[];
  sourceAssetId: string;
  userSignal: FormatUserSignal;
  audienceSignal: FormatAudienceSignal;
  createdAt: string;
}): FormatMemoryObservation {
  const formatKey = input.formatKey.trim();
  const label = input.label.trim();
  if (!formatKey) throw new Error("Format key is required");
  if (!label) throw new Error("Format label is required");

  return {
    formatKey,
    label,
    mechanics: uniqueNonEmpty(input.mechanics),
    sourceAssetId: input.sourceAssetId,
    userSignal: input.userSignal,
    audienceSignal: input.audienceSignal,
    userFitWeight: USER_SIGNAL_WEIGHT[input.userSignal],
    audienceWeight: AUDIENCE_SIGNAL_WEIGHT[input.audienceSignal],
    createdAt: input.createdAt,
  };
}

export function summarizeFormatMemory(
  observations: FormatMemoryObservation[],
): FormatMemorySummary {
  const aggregate = new Map<
    string,
    {
      label: string;
      mechanics: Set<string>;
      userFitScore: number;
      audienceScore: number;
      samples: number;
    }
  >();

  for (const observation of observations) {
    const current = aggregate.get(observation.formatKey) ?? {
      label: observation.label,
      mechanics: new Set<string>(),
      userFitScore: 0,
      audienceScore: 0,
      samples: 0,
    };

    current.label = observation.label || current.label;
    for (const mechanic of observation.mechanics) current.mechanics.add(mechanic);
    current.userFitScore += observation.userFitWeight;
    current.audienceScore += observation.audienceWeight;
    current.samples += 1;
    aggregate.set(observation.formatKey, current);
  }

  return {
    formats: [...aggregate.entries()]
      .map(([formatKey, value]) => ({
        formatKey,
        label: value.label,
        mechanics: [...value.mechanics],
        userFitScore: round(value.userFitScore),
        audienceScore: round(value.audienceScore),
        samples: value.samples,
      }))
      .sort(
        (a, b) =>
          b.userFitScore - a.userFitScore ||
          b.audienceScore - a.audienceScore ||
          a.formatKey.localeCompare(b.formatKey),
      ),
  };
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
