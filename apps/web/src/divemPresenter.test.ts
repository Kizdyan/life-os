import { describe, expect, it } from "vitest";
import { presentDiagnostic } from "./divemPresenter";

describe("DiveM diagnostic presentation", () => {
  it("shows an explainable action from explicit measurements only", () => {
    expect(presentDiagnostic({ profile_clarity: "0.8", content_consistency: "0.4", audience_response: "" }))
      .toMatchObject({
        kind: "result",
        result: {
          state: "ACTIONABLE",
          score: 0.6,
          weakestComponent: "content_consistency",
          recommendation: "Improve content_consistency before changing other tactics.",
        },
      });
  });

  it("keeps insufficient evidence UNKNOWN and rejects malformed input", () => {
    expect(presentDiagnostic({ profile_clarity: "0.8", content_consistency: "", audience_response: "" }))
      .toMatchObject({ kind: "result", result: { state: "UNKNOWN", score: null } });
    expect(presentDiagnostic({ profile_clarity: "1.2", content_consistency: "", audience_response: "" }))
      .toEqual({ kind: "invalid", message: "Каждый показатель должен быть числом от 0 до 1." });
  });

  it("does not turn an unconfirmed number into verified evidence", () => {
    expect(presentDiagnostic(
      { profile_clarity: "0.8", content_consistency: "0.4", audience_response: "0.7" },
      { profile_clarity: "VERIFIED", content_consistency: "UNVERIFIED", audience_response: "UNVERIFIED" },
    )).toEqual({
      kind: "result",
      result: {
        state: "UNKNOWN",
        score: null,
        components: [{ name: "profile_clarity", value: 0.8, evidenceState: "VERIFIED" }],
        weakestComponent: null,
        recommendation: null,
      },
      unverified: ["content_consistency", "audience_response"],
    });
  });

  it("requires source confirmation before calculating an all-unconfirmed form", () => {
    expect(presentDiagnostic(
      { profile_clarity: "0.8", content_consistency: "0.4", audience_response: "" },
      { profile_clarity: "UNVERIFIED", content_consistency: "UNVERIFIED" },
    )).toEqual({
      kind: "empty",
      message: "Подтвердите источник минимум двух показателей перед расчётом.",
      unverified: ["profile_clarity", "content_consistency"],
    });
  });
});
