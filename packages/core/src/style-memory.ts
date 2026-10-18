import {
  makeStyleObservation,
  type StyleDimension,
  type StyleMemoryObservation,
  type StyleSignal,
} from "./media-brain";

export interface StyleMemoryStore {
  append(observation: StyleMemoryObservation): Promise<void>;
  listByDimension(dimension: StyleDimension): Promise<StyleMemoryObservation[]>;
}

export interface InterpretedStyleFeedback {
  dimension: StyleDimension;
  value: string;
  confidence: number;
  reusable: boolean;
}

export interface StyleFeedbackInterpreter {
  interpret(input: {
    feedback: string;
    assetId: string;
    projectId: string | null;
  }): Promise<InterpretedStyleFeedback[]>;
}

export async function learnFromFeedback(input: {
  feedback: string;
  assetId: string;
  projectId: string | null;
  signal?: StyleSignal;
  interpreter: StyleFeedbackInterpreter;
  store: StyleMemoryStore;
  now: () => string;
}): Promise<StyleMemoryObservation[]> {
  const feedback = input.feedback.trim();
  if (!feedback) return [];

  const interpreted = await input.interpreter.interpret({
    feedback,
    assetId: input.assetId,
    projectId: input.projectId,
  });

  const reusable = interpreted.filter(
    (item) =>
      item.reusable &&
      Number.isFinite(item.confidence) &&
      item.confidence >= 0.65 &&
      item.value.trim().length > 0,
  );

  const observations = reusable.map((item) =>
    makeStyleObservation({
      assetId: input.assetId,
      dimension: item.dimension,
      value: item.value.trim(),
      signal: input.signal ?? "specific_feedback",
      createdAt: input.now(),
    }),
  );

  for (const observation of observations) {
    await input.store.append(observation);
  }

  return observations;
}

export interface StylePreferenceSummary {
  dimension: StyleDimension;
  preferred: Array<{ value: string; score: number; samples: number }>;
}

export async function summarizeStyleDimension(
  store: StyleMemoryStore,
  dimension: StyleDimension,
): Promise<StylePreferenceSummary> {
  const items = await store.listByDimension(dimension);
  const aggregate = new Map<string, { score: number; samples: number }>();

  for (const item of items) {
    const key = item.value.trim();
    if (!key) continue;
    if (!Number.isFinite(item.weight)) {
      throw new Error('Invalid style observation weight');
    }
    const current = aggregate.get(key) ?? { score: 0, samples: 0 };
    current.score += item.weight;
    current.samples += 1;
    aggregate.set(key, current);
  }

  const preferred = [...aggregate.entries()]
    .map(([value, stats]) => ({
      value,
      score: round(stats.score),
      samples: stats.samples,
    }))
    .sort((a, b) => b.score - a.score || b.samples - a.samples);

  return { dimension, preferred };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
