import { describe, expect, it } from "vitest";
import { ProviderNeutralContentFactory } from "./content-factory";

describe("ProviderNeutralContentFactory", () => {
  it("turns a planner result into a CapCut work package", async () => {
    let id = 0;
    const factory = new ProviderNeutralContentFactory(
      {
        createPlan: async () => ({
          title: "Репетиция",
          caption: "Backstage",
          aspectRatio: "9:16",
          targetDurationMs: 20000,
          hook: "Как выглядит репетиция изнутри",
          clips: [
            {
              assetId: "asset-1",
              sourceStartMs: 0,
              sourceEndMs: 2500,
              order: 1,
              reason: "hook",
            },
          ],
          captions: [],
          overlays: [],
          audio: [],
          coverBrief: "Крупный план",
          editorNotes: ["без лишних эффектов"],
        }),
        revisePlan: async () => {
          throw new Error("not used");
        },
      },
      () => `candidate-${++id}`,
      () => "2026-09-29T12:00:00.000Z",
    );

    const candidate = await factory.createDraft({
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "profile visits",
      styleMemoryNotes: ["спокойный темп"],
      lifeOsContext: { event: "rehearsal" },
    });

    expect(candidate.id).toBe("candidate-1");
    expect(candidate.workPackage.aspectRatio).toBe("9:16");
    expect(candidate.workPackage.styleMemoryNotes).toEqual([
      "спокойный темп",
      "без лишних эффектов",
    ]);
  });

  it("creates a new candidate id after DiveM revision", async () => {
    let id = 0;
    const planner = {
      createPlan: async () => ({
        title: null,
        caption: null,
        aspectRatio: "9:16" as const,
        targetDurationMs: 15000,
        hook: "old hook",
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
        editorNotes: [],
      }),
      revisePlan: async () => ({
        title: null,
        caption: null,
        aspectRatio: "9:16" as const,
        targetDurationMs: 15000,
        hook: "new hook",
        clips: [
          {
            assetId: "asset-1",
            sourceStartMs: 0,
            sourceEndMs: 1200,
            order: 1,
            reason: "stronger hook",
          },
        ],
        captions: [],
        overlays: [],
        audio: [],
        coverBrief: null,
        editorNotes: [],
      }),
    };

    const factory = new ProviderNeutralContentFactory(
      planner,
      () => `candidate-${++id}`,
      () => "2026-09-29T12:00:00.000Z",
    );

    const first = await factory.createDraft({
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "profile visits",
      styleMemoryNotes: [],
    });

    const revised = await factory.reviseDraft({
      candidate: first,
      assessment: {
        fit: "mixed",
        notes: [],
        weakTransition: "interest",
        revisionSuggestions: ["усилить hook"],
        confidence: 0.8,
        evidenceState: "partial",
      },
    });

    expect(first.id).toBe("candidate-1");
    expect(revised.id).toBe("candidate-2");
    expect(revised.workPackage.hook).toBe("new hook");
    expect(revised.workPackage.diveMRevisionNotes).toEqual(["усилить hook"]);
  });

  it("rejects hallucinated asset references from the planner", async () => {
    const factory = new ProviderNeutralContentFactory(
      {
        createPlan: async () => ({
          title: null,
          caption: null,
          aspectRatio: "9:16",
          targetDurationMs: null,
          hook: null,
          clips: [
            {
              assetId: "unknown-asset",
              sourceStartMs: 0,
              sourceEndMs: 1000,
              order: 1,
              reason: "bad",
            },
          ],
          captions: [],
          overlays: [],
          audio: [],
          coverBrief: null,
          editorNotes: [],
        }),
        revisePlan: async () => {
          throw new Error("not used");
        },
      },
      () => "candidate-1",
      () => "2026-09-29T12:00:00.000Z",
    );

    await expect(
      factory.createDraft({
        projectId: "project-1",
        assetIds: ["asset-1"],
        channel: "instagram",
        goal: "test",
        styleMemoryNotes: [],
      }),
    ).rejects.toThrow("unknown asset");
  });
});
