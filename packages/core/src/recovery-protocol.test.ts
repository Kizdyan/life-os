import { describe, expect, it } from "vitest";
import type { LifeItem } from "./life-item";
import { deriveRecoveryAction } from "./recovery-protocol";

function item(overrides: Partial<LifeItem> = {}): LifeItem {
  return {
    id: "gym",
    kind: "habit",
    title: "Зал",
    status: "missed_time",
    plannedStart: "2026-10-01T12:00:00+03:00",
    plannedEnd: "2026-10-01T13:00:00+03:00",
    actualStart: null,
    actualEnd: null,
    projectId: null,
    version: 1,
    createdAt: "2026-10-01T08:00:00+03:00",
    updatedAt: "2026-10-01T13:00:00+03:00",
    ...overrides,
  };
}

describe("Recovery Protocol", () => {
  it("turns one missed flexible habit into a near-term retry instead of a failure spiral", () => {
    const result = deriveRecoveryAction({
      item: item(),
      consecutiveMisses: 1,
    });

    expect(result).toMatchObject({
      action: "retry_soon",
      priorityBoost: 1,
      shouldAutoSchedule: true,
      preserveOriginalOutcome: true,
    });
  });

  it("uses a minimum viable version after two consecutive misses", () => {
    const result = deriveRecoveryAction({
      item: item(),
      consecutiveMisses: 2,
    });

    expect(result).toMatchObject({
      action: "minimum_version",
      priorityBoost: 2,
      shouldAutoSchedule: true,
    });
  });

  it("never silently reschedules a missed fixed event", () => {
    const result = deriveRecoveryAction({
      item: item({ kind: "event", title: "Спектакль" }),
      consecutiveMisses: 1,
    });

    expect(result).toMatchObject({
      action: "review_fixed",
      priorityBoost: 0,
      shouldAutoSchedule: false,
    });
  });

  it("does nothing for an item that did not fail", () => {
    const result = deriveRecoveryAction({
      item: item({ status: "completed" }),
      consecutiveMisses: 0,
    });

    expect(result.action).toBe("none");
    expect(result.shouldAutoSchedule).toBe(false);
  });
});
