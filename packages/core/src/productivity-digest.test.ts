import { describe, expect, it } from "vitest";
import type { LifeItem } from "./life-item";
import { buildProductivityDigest } from "./productivity-digest";

function item(id: string, overrides: Partial<LifeItem> = {}): LifeItem {
  return {
    id,
    kind: "task",
    title: id,
    status: "planned",
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    projectId: null,
    version: 1,
    createdAt: "2026-10-01T08:00:00+03:00",
    updatedAt: "2026-10-01T08:00:00+03:00",
    ...overrides,
  };
}

describe("Erika productivity digest", () => {
  it("pairs attention exceptions with recovery actions for missed flexible work", () => {
    const digest = buildProductivityDigest({
      now: "2026-10-01T12:00:00+03:00",
      items: [
        item("gym", {
          kind: "habit",
          title: "Зал",
          status: "missed_time",
        }),
      ],
      consecutiveMissesByItem: { gym: 1 },
    });

    expect(digest.attention.visible[0].itemId).toBe("gym");
    expect(digest.recovery).toEqual([
      expect.objectContaining({
        itemId: "gym",
        action: "retry_soon",
        shouldAutoSchedule: true,
      }),
    ]);
  });

  it("never converts a missed fixed event into an automatic reschedule", () => {
    const digest = buildProductivityDigest({
      now: "2026-10-01T12:00:00+03:00",
      items: [
        item("show", {
          kind: "event",
          title: "Спектакль",
          status: "missed_time",
        }),
      ],
      consecutiveMissesByItem: { show: 1 },
    });

    expect(digest.recovery[0]).toMatchObject({
      itemId: "show",
      action: "review_fixed",
      shouldAutoSchedule: false,
    });
  });

  it("keeps the digest exception-oriented rather than dumping every planned item", () => {
    const digest = buildProductivityDigest({
      now: "2026-10-01T12:00:00+03:00",
      items: [
        item("today", {
          kind: "event",
          plannedStart: "2026-10-01T14:00:00+03:00",
        }),
        item("next-week", {
          plannedStart: "2026-10-08T14:00:00+03:00",
        }),
      ],
      consecutiveMissesByItem: {},
    });

    expect(digest.attention.visible.map((entry) => entry.itemId)).toEqual([
      "today",
    ]);
    expect(digest.recovery).toEqual([]);
  });
});
