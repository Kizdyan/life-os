import { describe, expect, it } from "vitest";
import {
  deriveMediaOpportunities,
  PERSONAL_CAPTURE_POLICY,
  type LifeOsMediaSnapshot,
} from "./media-life-context";
import {
  DEFAULT_MEDIA_CAPABILITIES,
  PERSONAL_HIGH_AUTONOMY_MEDIA,
} from "./media-brain";

const snapshot: LifeOsMediaSnapshot = {
  date: "2026-09-29",
  currentFocus: ["acting", "music"],
  existingCaptureCount: 0,
  items: [
    {
      id: "rehearsal",
      kind: "event",
      title: "Репетиция",
      status: "planned",
      plannedStart: "2026-09-29T16:00:00+03:00",
      plannedEnd: null,
      actualStart: null,
      actualEnd: null,
      projectId: null,
      version: 1,
      createdAt: "2026-09-29T09:00:00+03:00",
      updatedAt: "2026-09-29T09:00:00+03:00",
    },
    {
      id: "recovery",
      kind: "recovery",
      title: "Отдых",
      status: "planned",
      plannedStart: "2026-09-29T20:00:00+03:00",
      plannedEnd: null,
      actualStart: null,
      actualEnd: null,
      projectId: null,
      version: 1,
      createdAt: "2026-09-29T09:00:00+03:00",
      updatedAt: "2026-09-29T09:00:00+03:00",
    },
  ],
  annotations: [
    {
      lifeItemId: "rehearsal",
      eligible: true,
      kind: "capture_backstage",
      priority: "high",
      reason: "естественная возможность снять backstage без отдельной съёмки",
      requiresExtraEffort: false,
    },
    {
      lifeItemId: "recovery",
      eligible: true,
      kind: "capture_process",
      priority: "normal",
      reason: "можно было бы сделать бытовой контент",
      requiresExtraEffort: true,
    },
  ],
};

describe("Life OS media context bridge", () => {
  it("does nothing for normal users when Life OS context is disabled", () => {
    expect(
      deriveMediaOpportunities({
        snapshot,
        capabilities: DEFAULT_MEDIA_CAPABILITIES,
      }),
    ).toEqual([]);
  });

  it("surfaces only explicitly annotated low-effort opportunities", () => {
    const result = deriveMediaOpportunities({
      snapshot,
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      lifeItemId: "rehearsal",
      kind: "capture_backstage",
    });
  });

  it("caps prompts so the media system does not become another obligation", () => {
    const result = deriveMediaOpportunities({
      snapshot: {
        ...snapshot,
        existingCaptureCount: PERSONAL_CAPTURE_POLICY.maxNewCapturePromptsPerDay,
      },
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
    });

    expect(result).toEqual([]);
  });
});
