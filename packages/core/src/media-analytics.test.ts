import { describe, expect, it } from "vitest";
import {
  buildAudiencePerformanceSignal,
  compareContentOnDeclaredGoal,
  type PublishedContentMetrics,
} from "./media-analytics";

function metrics(overrides: Partial<PublishedContentMetrics> = {}): PublishedContentMetrics {
  return {
    candidateId: "candidate-1",
    externalId: "post-1",
    channel: "instagram",
    measuredAt: "2026-09-29T12:00:00.000Z",
    impressions: 1000,
    views: 800,
    reach: 900,
    watchTimeSeconds: 4000,
    averageWatchSeconds: 5,
    completionRate: 0.5,
    likes: 90,
    comments: 18,
    saves: 45,
    shares: 27,
    profileVisits: 36,
    follows: 9,
    inquiries: 3,
    ...overrides,
  };
}

describe("media analytics", () => {
  it("keeps audience-response evidence separate and transparent", () => {
    const signal = buildAudiencePerformanceSignal(metrics());

    expect(signal.rates.saveRate).toBeCloseTo(45 / 900);
    expect(signal.rates.shareRate).toBeCloseTo(27 / 900);
    expect(signal.rates.profileVisitRate).toBeCloseTo(36 / 900);
    expect(signal.rates.completionRate).toBe(0.5);
    expect(signal.raw.likes).toBe(90);
  });

  it("returns null rates instead of inventing exposure data", () => {
    const signal = buildAudiencePerformanceSignal(
      metrics({
        impressions: null,
        views: null,
        reach: null,
      }),
    );

    expect(signal.rates.likeRate).toBeNull();
    expect(signal.rates.profileVisitRate).toBeNull();
  });

  it("compares variants only on the explicitly declared goal", () => {
    const result = compareContentOnDeclaredGoal({
      goal: "profile_visits",
      baseline: metrics({ profileVisits: 20 }),
      candidate: metrics({ profileVisits: 30 }),
    });

    expect(result).toEqual({
      goal: "profile_visits",
      baselineValue: 20,
      candidateValue: 30,
      relativeChange: 0.5,
    });
  });
});
