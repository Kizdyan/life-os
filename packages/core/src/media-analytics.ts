export type MediaChannel = "instagram" | "youtube" | "other";

export interface PublishedContentMetrics {
  candidateId: string;
  externalId: string;
  channel: MediaChannel;
  measuredAt: string;
  impressions: number | null;
  views: number | null;
  reach: number | null;
  watchTimeSeconds: number | null;
  averageWatchSeconds: number | null;
  completionRate: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  profileVisits: number | null;
  follows: number | null;
  inquiries: number | null;
}

export interface AudiencePerformanceSignal {
  candidateId: string;
  measuredAt: string;
  rates: {
    likeRate: number | null;
    commentRate: number | null;
    saveRate: number | null;
    shareRate: number | null;
    profileVisitRate: number | null;
    followRate: number | null;
    inquiryRate: number | null;
    completionRate: number | null;
  };
  raw: PublishedContentMetrics;
}

export interface AudiencePerformanceStore {
  append(signal: AudiencePerformanceSignal): Promise<void>;
  listByCandidate(candidateId: string): Promise<AudiencePerformanceSignal[]>;
}

export function buildAudiencePerformanceSignal(
  metrics: PublishedContentMetrics,
): AudiencePerformanceSignal {
  const exposure = firstPositive(metrics.reach, metrics.impressions, metrics.views);

  return {
    candidateId: metrics.candidateId,
    measuredAt: metrics.measuredAt,
    rates: {
      likeRate: ratio(metrics.likes, exposure),
      commentRate: ratio(metrics.comments, exposure),
      saveRate: ratio(metrics.saves, exposure),
      shareRate: ratio(metrics.shares, exposure),
      profileVisitRate: ratio(metrics.profileVisits, exposure),
      followRate: ratio(metrics.follows, exposure),
      inquiryRate: ratio(metrics.inquiries, exposure),
      completionRate: normalizeRate(metrics.completionRate),
    },
    raw: metrics,
  };
}

export async function recordAudiencePerformance(input: {
  metrics: PublishedContentMetrics;
  store: AudiencePerformanceStore;
}): Promise<AudiencePerformanceSignal> {
  const signal = buildAudiencePerformanceSignal(input.metrics);
  await input.store.append(signal);
  return signal;
}

export type ContentGoalMetric =
  | "views"
  | "completion_rate"
  | "saves"
  | "shares"
  | "profile_visits"
  | "follows"
  | "inquiries";

export function metricForGoal(
  metrics: PublishedContentMetrics,
  goal: ContentGoalMetric,
): number | null {
  switch (goal) {
    case "views":
      return metrics.views;
    case "completion_rate":
      return normalizeRate(metrics.completionRate);
    case "saves":
      return metrics.saves;
    case "shares":
      return metrics.shares;
    case "profile_visits":
      return metrics.profileVisits;
    case "follows":
      return metrics.follows;
    case "inquiries":
      return metrics.inquiries;
    default:
      return assertNever(goal);
  }
}

export function compareContentOnDeclaredGoal(input: {
  goal: ContentGoalMetric;
  baseline: PublishedContentMetrics;
  candidate: PublishedContentMetrics;
}): {
  goal: ContentGoalMetric;
  baselineValue: number | null;
  candidateValue: number | null;
  relativeChange: number | null;
} {
  const baselineValue = metricForGoal(input.baseline, input.goal);
  const candidateValue = metricForGoal(input.candidate, input.goal);

  return {
    goal: input.goal,
    baselineValue,
    candidateValue,
    relativeChange:
      baselineValue !== null &&
      candidateValue !== null &&
      baselineValue !== 0
        ? (candidateValue - baselineValue) / Math.abs(baselineValue)
        : null,
  };
}

function firstPositive(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (typeof value === "number" && value > 0) return value;
  }
  return null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (
    numerator === null ||
    denominator === null ||
    denominator <= 0 ||
    numerator < 0
  ) {
    return null;
  }
  return numerator / denominator;
}

function normalizeRate(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return Math.min(1, value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled content goal metric: ${value}`);
}
