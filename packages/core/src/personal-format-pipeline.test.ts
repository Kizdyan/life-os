import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEDIA_CAPABILITIES,
  PERSONAL_HIGH_AUTONOMY_MEDIA,
} from "./media-brain";
import { buildCapCutWorkPackage } from "./capcut-work-package";
import { prepareContentForReview } from "./media-pipeline";

const candidate = {
  id: "candidate-1",
  projectId: "project-1",
  assetIds: ["asset-1"],
  title: null,
  caption: null,
  createdAt: "2026-10-01T12:00:00+03:00",
  workPackage: buildCapCutWorkPackage({
    projectId: "project-1",
    channel: "instagram",
    aspectRatio: "9:16",
    targetDurationMs: 10000,
    hook: "hook",
    clips: [
      {
        assetId: "asset-1",
        sourceStartMs: 0,
        sourceEndMs: 1000,
        order: 1,
        reason: "hook",
      },
    ],
    captions: [],
    overlays: [],
    audio: [],
    coverBrief: null,
    diveMRevisionNotes: [],
    styleMemoryNotes: [],
  }),
};

function baseInput(capabilities: typeof PERSONAL_HIGH_AUTONOMY_MEDIA) {
  let captured: string[] | undefined;
  return {
    captured: () => captured,
    input: {
      capabilities,
      profileId: "personal",
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram" as const,
      goal: "profile visits",
      currentFocus: ["acting"],
      styleMemoryNotes: [],
      strategy: {
        assessContent: async () => ({
          fit: "unknown" as const,
          notes: [],
          weakTransition: null,
          revisionSuggestions: [],
          confidence: 0,
          evidenceState: "insufficient" as const,
        }),
      },
      contentFactory: {
        createDraft: async (input: { formatMemoryNotes?: string[] }) => {
          captured = input.formatMemoryNotes;
          return candidate;
        },
        reviseDraft: async () => candidate,
      },
      observer: {
        verifyDraft: async () => ({ verified: true, notes: [] }),
        verifyPublished: async () => ({ verified: true, notes: [] }),
      },
    },
  };
}

describe("personal Format Memory pipeline defaults", () => {
  it("injects the personal format seed when Kostya mode has no learned format notes yet", async () => {
    const setup = baseInput(PERSONAL_HIGH_AUTONOMY_MEDIA);

    await prepareContentForReview(setup.input);

    expect(setup.captured()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("demo-tool"),
        expect.stringContaining("chronological-story"),
        expect.stringContaining("resource-roundup"),
        expect.stringContaining("one-rule-metaphor"),
      ]),
    );
  });

  it("does not inject Kostya's personal format seed for normal users", async () => {
    const setup = baseInput({
      ...DEFAULT_MEDIA_CAPABILITIES,
      useDiveMPrePublishAnalysis: false,
    });

    await prepareContentForReview(setup.input);

    expect(setup.captured()).toEqual([]);
  });
});
