export type ExperimentDirection = "increase" | "decrease";
export type ExperimentStatus =
  | "draft"
  | "running"
  | "succeeded"
  | "failed"
  | "inconclusive";

export interface BehaviorExperiment {
  id: string;
  sourceReferenceId: string;
  hypothesis: string;
  metric: string;
  direction: ExperimentDirection;
  baseline: number;
  target: number;
  observations: number[];
  reversible: boolean;
  status: "draft" | "running";
  createdAt: string;
}

export interface BehaviorExperimentResult {
  experimentId: string;
  status: Extract<ExperimentStatus, "succeeded" | "failed" | "inconclusive">;
  measuredValue: number | null;
  observationCount: number;
  target: number;
  baseline: number;
  direction: ExperimentDirection;
  autoPromoteToRule: false;
  reason: string;
}

export const MIN_EXPERIMENT_OBSERVATIONS = 3;

export function evaluateBehaviorExperiment(
  experiment: BehaviorExperiment,
): BehaviorExperimentResult {
  validateExperiment(experiment);

  if (!experiment.reversible) {
    throw new Error("Autonomous behavior experiments must be reversible");
  }

  const observations = experiment.observations.filter(Number.isFinite);
  if (observations.length < MIN_EXPERIMENT_OBSERVATIONS) {
    return {
      experimentId: experiment.id,
      status: "inconclusive",
      measuredValue: observations.length ? average(observations) : null,
      observationCount: observations.length,
      target: experiment.target,
      baseline: experiment.baseline,
      direction: experiment.direction,
      autoPromoteToRule: false,
      reason: `At least ${MIN_EXPERIMENT_OBSERVATIONS} observations are required before drawing a conclusion.`,
    };
  }

  const measuredValue = average(observations);
  const targetMet =
    experiment.direction === "decrease"
      ? measuredValue <= experiment.target
      : measuredValue >= experiment.target;

  return {
    experimentId: experiment.id,
    status: targetMet ? "succeeded" : "failed",
    measuredValue,
    observationCount: observations.length,
    target: experiment.target,
    baseline: experiment.baseline,
    direction: experiment.direction,
    autoPromoteToRule: false,
    reason: targetMet
      ? "The declared target was met on the measured observations."
      : "The declared target was not met on the measured observations.",
  };
}

export function mayPromoteExperimentToRule(input: {
  result: BehaviorExperimentResult;
  explicitlyApproved: boolean;
}): boolean {
  return input.result.status === "succeeded" && input.explicitlyApproved;
}

function validateExperiment(experiment: BehaviorExperiment): void {
  if (!experiment.id.trim()) throw new Error("Experiment id is required");
  if (!experiment.hypothesis.trim()) {
    throw new Error("Experiment hypothesis is required");
  }
  if (!experiment.metric.trim()) throw new Error("Experiment metric is required");
  if (!Number.isFinite(experiment.baseline) || !Number.isFinite(experiment.target)) {
    throw new Error("Experiment baseline and target must be finite numbers");
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
