import { describe, expect, it } from "vitest";
import { PERSONAL_HIGH_AUTONOMY_MEDIA } from "./media-brain";
import { buildCapCutWorkPackage } from "./capcut-work-package";
import {
  prepareContentForReview,
  publishReviewedContent,
  type ContentCandidate,
} from "./media-pipeline";

const baseCandidate: ContentCandidate = {
  id: "candidate-1",
  projectId: "project-1",
  assetIds: ["asset-1"],
  title: "Черновик",
  caption: null,
  createdAt: "2026-09-28T20:00:00.000Z",
  workPackage: buildCapCutWorkPackage({
    projectId: "project-1",
    channel: "instagram",
    aspectRatio: "9:16",
    targetDurationMs: 25000,
    hook: "Как проходит репетиция изнутри",
    clips: [
      {
        assetId: "asset-1",
        sourceStartMs: 0,
        sourceEndMs: 3000,
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

describe("personal media pipeline", () => {
  it("runs DiveM assessment before review and applies revision", async () => {
    let revised = false;
    const result = await prepareContentForReview({
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      profileId: "personal",
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "increase relevant actor profile visits",
      currentFocus: ["acting", "music"],
      styleMemoryNotes: ["без дешёвого кликбейта"],
      lifeOsContext: { event: "rehearsal" },
      strategyEvidence: {
        distribution_strength: 0.8,
        profile_bridge_clarity: 0.7,
        hook_clarity: 0.25,
        cta_clarity: 0.65,
        proof_strength: 0.75,
      },
      strategy: {
        assessContent: async () => ({
          fit: "mixed",
          notes: ["контекст понятен не сразу"],
          weakTransition: "interest",
          revisionSuggestions: ["усилить первые 2 секунды"],
          confidence: 1,
          evidenceState: "sufficient",
        }),
      },
      contentFactory: {
        createDraft: async () => baseCandidate,
        reviseDraft: async ({ candidate, assessment }) => {
          revised = true;
          return {
            ...candidate,
            workPackage: {
              ...candidate.workPackage,
              diveMRevisionNotes: assessment.revisionSuggestions,
            },
          };
        },
      },
      observer: {
        verifyDraft: async () => ({ verified: true, notes: ["draft valid"] }),
        verifyPublished: async () => ({ verified: true, notes: [] }),
      },
    });

    expect(revised).toBe(true);
    expect(result.readyForReview).toBe(true);
    expect(result.assessment?.weakTransition).toBe("interest");
    expect(result.candidate.workPackage.diveMRevisionNotes).toContain(
      "усилить первые 2 секунды",
    );
  });

  it("blocks publishing without approval", async () => {
    let publishCalls = 0;
    const result = await publishReviewedContent({
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      candidate: baseCandidate,
      review: null,
      publisher: {
        publish: async () => {
          publishCalls += 1;
          return { externalId: "post-1" };
        },
      },
      observer: {
        verifyDraft: async () => ({ verified: true, notes: [] }),
        verifyPublished: async () => ({ verified: true, notes: [] }),
      },
    });

    expect(result.published).toBe(false);
    expect(publishCalls).toBe(0);
  });

  it("publishes only an approved exact candidate and verifies outcome", async () => {
    const result = await publishReviewedContent({
      capabilities: PERSONAL_HIGH_AUTONOMY_MEDIA,
      candidate: baseCandidate,
      review: {
        candidateId: "candidate-1",
        approved: true,
        feedback: [],
        reviewedAt: "2026-09-28T21:00:00.000Z",
      },
      publisher: {
        publish: async () => ({ externalId: "post-1" }),
      },
      observer: {
        verifyDraft: async () => ({ verified: true, notes: [] }),
        verifyPublished: async () => ({
          verified: true,
          externalId: "post-1",
          notes: ["visible"],
        }),
      },
    });

    expect(result).toEqual({
      published: true,
      externalId: "post-1",
      verified: true,
      notes: ["visible"],
    });
  });
});
