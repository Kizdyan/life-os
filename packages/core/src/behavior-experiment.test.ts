import { describe, expect, it } from "vitest";
import {
  evaluateBehaviorExperiment,
  mayPromoteExperimentToRule,
  type BehaviorExperiment,
} from "./behavior-experiment";

function experiment(overrides: Partial<BehaviorExperiment> = {}): BehaviorExperiment {
  return {
    id: "exp-1",
    sourceReferenceId: "reference-8",
    hypothesis: "После одного пропуска быстрый возврат снижает шанс второго пропуска подряд.",
    metric: "second_consecutive_miss_rate",
    direction: "decrease",
    baseline: 0.4,
    target: 0.25,
    observations: [],
    reversible: true,
    status: "running",
    createdAt: "2026-10-01T12:00:00+03:00",
    ...overrides,
  };
}

describe("Behavior Experiment Loop", () => {
  it("marks a reversible measured experiment successful only when the declared target is met", () => {
    const result = evaluateBehaviorExperiment(
      experiment({ observations: [0.3, 0.22, 0.2] }),
    );

    expect(result.status).toBe("succeeded");
    expect(result.measuredValue).toBeCloseTo(0.24);
    expect(result.autoPromoteToRule).toBe(false);
  });

  it("keeps insufficient evidence inconclusive rather than inventing a conclusion", () => {
    const result = evaluateBehaviorExperiment(
      experiment({ observations: [0.2] }),
    );

    expect(result.status).toBe("inconclusive");
    expect(result.autoPromoteToRule).toBe(false);
  });

  it("does not allow an irreversible experiment into the autonomous loop", () => {
    expect(() =>
      evaluateBehaviorExperiment(experiment({ reversible: false })),
    ).toThrow("reversible");
  });

  it("requires explicit approval even after a successful experiment", () => {
    const successful = evaluateBehaviorExperiment(
      experiment({ observations: [0.2, 0.2, 0.2] }),
    );

    expect(
      mayPromoteExperimentToRule({ result: successful, explicitlyApproved: false }),
    ).toBe(false);
    expect(
      mayPromoteExperimentToRule({ result: successful, explicitlyApproved: true }),
    ).toBe(true);
  });
});
