export type ReferenceInsightKind = "claim" | "advice" | "format";

export type ReferenceVerification =
  | "unverified"
  | "plausible"
  | "verified"
  | "contested"
  | "false";

export type ReferenceUse =
  | "format_only"
  | "idea_only"
  | "experiment_candidate"
  | "blocked";

export interface ReferenceInsightAssessment {
  use: ReferenceUse;
  mayAutoStoreAsFormat: boolean;
  mayBecomeSystemRule: false;
  requiresMeasurement: boolean;
  reason: string;
}

export function assessReferenceInsight(input: {
  kind: ReferenceInsightKind;
  verification: ReferenceVerification;
  actionable: boolean;
  measurable: boolean;
  reversible: boolean;
  manipulative: boolean;
}): ReferenceInsightAssessment {
  if (input.verification === "false" || input.manipulative) {
    return {
      use: "blocked",
      mayAutoStoreAsFormat: false,
      mayBecomeSystemRule: false,
      requiresMeasurement: false,
      reason:
        input.verification === "false"
          ? "Known-false claims are blocked from system learning."
          : "Manipulative advice is blocked from behavior-rule learning.",
    };
  }

  if (input.kind === "format") {
    return {
      use: "format_only",
      mayAutoStoreAsFormat: true,
      mayBecomeSystemRule: false,
      requiresMeasurement: false,
      reason:
        "Presentation mechanics can be remembered without accepting the source claim as true.",
    };
  }

  if (
    input.verification === "verified" &&
    input.actionable &&
    input.measurable &&
    input.reversible
  ) {
    return {
      use: "experiment_candidate",
      mayAutoStoreAsFormat: false,
      mayBecomeSystemRule: false,
      requiresMeasurement: true,
      reason:
        "Verified reversible advice may become a measured experiment, never an automatic permanent rule.",
    };
  }

  return {
    use: "idea_only",
    mayAutoStoreAsFormat: false,
    mayBecomeSystemRule: false,
    requiresMeasurement: false,
    reason:
      input.verification === "contested"
        ? "Contested evidence stays a reference idea until stronger evidence exists."
        : "Unverified or non-measurable advice stays an idea only.",
  };
}
