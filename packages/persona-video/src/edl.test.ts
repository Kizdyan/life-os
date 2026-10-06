import { describe, expect, it } from "vitest";
import { buildEditDecisionList } from "./edl";
import { buildObjectiveSegments } from "./segmentation";

describe("buildEditDecisionList", () => {
  it("cuts edge silence and shortens only excessive internal pauses", () => {
    const segments = buildObjectiveSegments(10_000, [
      { startMs: 0, endMs: 600 },
      { startMs: 2000, endMs: 4000 },
      { startMs: 9000, endMs: 10_000 },
    ]);

    const result = buildEditDecisionList(10_000, segments, {
      maxInternalSilenceMs: 1200,
      preservedPauseMs: 300,
    });

    expect(result.version).toBe(1);
    expect(result.decisions.map(({ sourceStartMs, sourceEndMs, action, reason }) => ({
      sourceStartMs,
      sourceEndMs,
      action,
      reason,
    }))).toEqual([
      { sourceStartMs: 0, sourceEndMs: 450, action: "CUT", reason: "leading_silence" },
      { sourceStartMs: 450, sourceEndMs: 600, action: "KEEP", reason: "leading_breathing_room" },
      { sourceStartMs: 600, sourceEndMs: 2300, action: "KEEP", reason: "content_or_natural_pause" },
      { sourceStartMs: 2300, sourceEndMs: 4000, action: "CUT", reason: "excess_internal_silence" },
      { sourceStartMs: 4000, sourceEndMs: 9000, action: "KEEP", reason: "content_or_natural_pause" },
      { sourceStartMs: 9000, sourceEndMs: 9300, action: "KEEP", reason: "trailing_breathing_room" },
      { sourceStartMs: 9300, sourceEndMs: 10_000, action: "CUT", reason: "trailing_silence" },
    ]);
    expect(result.decisions.every((decision) => decision.signalSource === "OBJECTIVE")).toBe(true);
  });

  it("keeps a natural internal pause below the configured maximum", () => {
    const segments = buildObjectiveSegments(3000, [{ startMs: 1000, endMs: 1500 }]);
    const result = buildEditDecisionList(3000, segments, {
      maxInternalSilenceMs: 1200,
      preservedPauseMs: 300,
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({
      sourceStartMs: 0,
      sourceEndMs: 3000,
      action: "KEEP",
    });
  });

  it("removes the V0 micro-tail without a standalone micro KEEP decision", () => {
    const segments = buildObjectiveSegments(33_700, [
      { startMs: 31_891, endMs: 33_684 },
    ]);

    const result = buildEditDecisionList(33_700, segments);

    expect(result.decisions).toEqual([
      expect.objectContaining({
        sourceStartMs: 0,
        sourceEndMs: 31_891,
        action: "KEEP",
      }),
      expect.objectContaining({
        sourceStartMs: 31_891,
        sourceEndMs: 32_191,
        action: "KEEP",
        reason: "trailing_breathing_room",
      }),
      expect.objectContaining({
        sourceStartMs: 32_191,
        sourceEndMs: 33_700,
        action: "CUT",
        reason: "micro_content_cleanup",
      }),
    ]);
    expect(
      result.decisions.some(
        (decision) =>
          decision.action === "KEEP" &&
          decision.sourceEndMs - decision.sourceStartMs < 200,
      ),
    ).toBe(false);
  });
});
