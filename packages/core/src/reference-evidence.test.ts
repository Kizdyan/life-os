import { describe, expect, it } from "vitest";
import { assessReferenceInsight } from "./reference-evidence";

describe("Reference Evidence Guard", () => {
  it("lets a useful presentation pattern enter Format Memory without treating its claims as true", () => {
    const result = assessReferenceInsight({
      kind: "format",
      verification: "unverified",
      actionable: false,
      measurable: false,
      reversible: true,
      manipulative: false,
    });

    expect(result).toMatchObject({
      use: "format_only",
      mayAutoStoreAsFormat: true,
      mayBecomeSystemRule: false,
    });
  });

  it("blocks claims known to be false or manipulative from becoming system rules", () => {
    const falseClaim = assessReferenceInsight({
      kind: "claim",
      verification: "false",
      actionable: true,
      measurable: true,
      reversible: true,
      manipulative: false,
    });
    const manipulativeAdvice = assessReferenceInsight({
      kind: "advice",
      verification: "plausible",
      actionable: true,
      measurable: true,
      reversible: true,
      manipulative: true,
    });

    expect(falseClaim.use).toBe("blocked");
    expect(manipulativeAdvice.use).toBe("blocked");
    expect(falseClaim.mayBecomeSystemRule).toBe(false);
    expect(manipulativeAdvice.mayBecomeSystemRule).toBe(false);
  });

  it("turns verified reversible ideas into experiments, never directly into rules", () => {
    const result = assessReferenceInsight({
      kind: "advice",
      verification: "verified",
      actionable: true,
      measurable: true,
      reversible: true,
      manipulative: false,
    });

    expect(result).toMatchObject({
      use: "experiment_candidate",
      requiresMeasurement: true,
      mayBecomeSystemRule: false,
    });
  });

  it("keeps unverified advice as an idea only", () => {
    const result = assessReferenceInsight({
      kind: "advice",
      verification: "unverified",
      actionable: true,
      measurable: true,
      reversible: true,
      manipulative: false,
    });

    expect(result.use).toBe("idea_only");
    expect(result.mayAutoStoreAsFormat).toBe(false);
  });
});
