export type BehaviorExperimentDirection = "increase" | "decrease";
export type BehaviorExperimentStatus = "running" | "succeeded" | "failed" | "inconclusive";

export interface BehaviorExperiment {
  id: string;
  sourceReferenceId: string;
  hypothesis: string;
  metric: string;
  direction: BehaviorExperimentDirection;
  baseline: number;
  target: number;
  observations: number[];
  reversible: boolean;
  status: BehaviorExperimentStatus;
  createdAt: string;
}

export interface BehaviorExperimentResult {
  experimentId: string;
  status: Exclude<BehaviorExperimentStatus, "running">;
  measuredValue: number | null;
  observationCount: number;
  autoPromoteToRule: false;
  reason: string;
}

export function evaluateBehaviorExperiment(
  experiment: BehaviorExperiment,
): BehaviorExperimentResult {
  if (!experiment.reversible) {
    throw new Error("Autonomous behavior experiments must be reversible");
  }
  if (!Number.isFinite(experiment.baseline) || !Number.isFinite(experiment.target)) {
    throw new Error("Experiment baseline and target must be finite numbers");
  }
  if (experiment.observations.some((value) => !Number.isFinite(value))) {
    throw new Error("Experiment observations must be finite numbers");
  }

  if (experiment.observations.length < 3) {
    return {
      experimentId: experiment.id,
      status: "inconclusive",
      measuredValue:
        experiment.observations.length > 0
          ? mean(experiment.observations)
          : null,
      observationCount: experiment.observations.length,
      autoPromoteToRule: false,
      reason: "At least three observations are required before judging the experiment.",
    };
  }

  const measuredValue = mean(experiment.observations);
  const succeeded =
    experiment.direction === "decrease"
      ? measuredValue <= experiment.target
      : experiment.direction === "increase"
      ? measuredValue >= experiment.target
      : false;

  if (!succeeded) {
    throw new Error(`The experiment direction '${experiment.direction}' is not supported. Only 'increase' and 'decrease' are allowed.`);
  }

  return {
    experimentId: experiment.id,
    status: succeeded ? "succeeded" : "failed",
    measuredValue,
    observationCount: experiment.observations.length,
    autoPromoteToRule: false,
    reason: succeeded
      ? "The declared target was met on the measured metric."
      : "The declared target was not met on the measured metric.",
  };
}

export function mayPromoteExperimentToRule(input: {
  result: BehaviorExperimentResult;
  explicitlyApproved: boolean;
}): boolean {
  return input.result.status === "succeeded" && input.explicitlyApproved;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
