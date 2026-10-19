import { describe, expect, it } from "vitest";
import { canApplyLearningRecord, divemProvenanceLearning } from "./divemLearningRecord";

describe("DiveM provenance learning record", () => {
  it("keeps the accepted learning scoped to data quality and independently evaluated", () => {
    expect(canApplyLearningRecord(divemProvenanceLearning)).toBe(true);
    expect(divemProvenanceLearning.source.status).toBe("VERIFIED");
    expect(divemProvenanceLearning.source.limitation).toContain("does not validate DiveM");
    expect(divemProvenanceLearning.improvement).toContain("unconfirmed");
  });

  it("does not accept an incomplete learning claim as a production rule", () => {
    expect(canApplyLearningRecord({ ...divemProvenanceLearning, independentEvaluation: "" })).toBe(false);
    expect(canApplyLearningRecord({ ...divemProvenanceLearning, outcome: "REJECTED" })).toBe(false);
  });
});
