import { describe, expect, it } from "vitest";
import { StructuredContentPlanner } from "./content-planner";

describe("StructuredContentPlanner", () => {
  it("parses snake_case structured planner output", async () => {
    let system = "";
    const planner = new StructuredContentPlanner({
      completeJson: async (input) => {
        system = input.system;
        return {
          title: "Backstage",
          caption: "Репетиция изнутри",
          aspect_ratio: "9:16",
          target_duration_ms: 18000,
          hook: "Что происходит до выхода на сцену",
          clips: [
            {
              asset_id: "asset-1",
              source_start_ms: 0,
              source_end_ms: 2200,
              order: 1,
              reason: "hook",
            },
          ],
          captions: [
            {
              start_ms: 0,
              end_ms: 1000,
              text: "До спектакля",
            },
          ],
          overlays: [
            {
              at_ms: 0,
              duration_ms: 900,
              text: "backstage",
              role: "hook",
            },
          ],
          audio: [
            {
              at_ms: 0,
              kind: "ambient",
              instruction: "оставить живой звук",
            },
          ],
          cover_brief: "крупный план",
          editor_notes: ["чистые склейки"],
        };
      },
    });

    const result = await planner.createPlan({
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "profile visits",
      styleMemoryNotes: ["без блогерской гиперболы"],
      lifeOsContext: { event: "rehearsal" },
    });

    expect(result.aspectRatio).toBe("9:16");
    expect(result.clips[0].assetId).toBe("asset-1");
    expect(result.editorNotes).toEqual(["чистые склейки"]);
    expect(system.toLowerCase()).toContain("не выдумывай исходники");
  });

  it("rejects malformed structured output", async () => {
    const planner = new StructuredContentPlanner({
      completeJson: async () => ({
        aspect_ratio: "9:16",
        clips: "not-an-array",
        captions: [],
        overlays: [],
        audio: [],
        editor_notes: [],
      }),
    });

    await expect(
      planner.createPlan({
        projectId: "project-1",
        assetIds: ["asset-1"],
        channel: "instagram",
        goal: "test",
        styleMemoryNotes: [],
        lifeOsContext: null,
      }),
    ).rejects.toThrow("clips");
  });

  it.each([
    ["clip", { clips: [{ assetId: "asset-1", sourceStartMs: 1000, sourceEndMs: 1000, order: 1, reason: "invalid" }] }],
    ["caption", { captions: [{ startMs: 1200, endMs: 800, text: "invalid" }] }],
    ["overlay", { overlays: [{ atMs: 0, durationMs: 0, text: "invalid", role: "hook" }] }],
    ["audio", { audio: [{ atMs: -1, kind: "voice", instruction: "invalid" }] }],
  ])("rejects invalid %s temporal ranges", async (_field, invalid) => {
    const planner = new StructuredContentPlanner({
      completeJson: async () => ({
        title: null,
        caption: null,
        aspectRatio: "9:16",
        targetDurationMs: 12000,
        hook: null,
        clips: [],
        captions: [],
        overlays: [],
        audio: [],
        coverBrief: null,
        editorNotes: [],
        ...invalid,
      }),
    });

    await expect(planner.createPlan({
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "test",
      styleMemoryNotes: [],
      lifeOsContext: null,
    })).rejects.toThrow(/duration|range/i);
  });

  it.each([0, -1])("rejects non-positive target duration %s", async (targetDurationMs) => {
    const planner = new StructuredContentPlanner({
      completeJson: async () => ({
        title: null,
        caption: null,
        aspectRatio: "9:16",
        targetDurationMs,
        hook: null,
        clips: [],
        captions: [],
        overlays: [],
        audio: [],
        coverBrief: null,
        editorNotes: [],
      }),
    });

    await expect(planner.createPlan({
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "test",
      styleMemoryNotes: [],
      lifeOsContext: null,
    })).rejects.toThrow(/target duration/i);
  });

  it("passes DiveM assessment into revision request", async () => {
    let userPayload: Record<string, unknown> | null = null;
    const planner = new StructuredContentPlanner({
      completeJson: async (input) => {
        userPayload = JSON.parse(input.user) as Record<string, unknown>;
        return {
          title: null,
          caption: null,
          aspectRatio: "9:16",
          targetDurationMs: 12000,
          hook: "new",
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
        };
      },
    });

    await planner.revisePlan({
      candidate: {
        id: "candidate-1",
        projectId: "project-1",
        assetIds: ["asset-1"],
        title: null,
        caption: null,
        createdAt: "2026-09-29T12:00:00.000Z",
        workPackage: {
          version: 1,
          projectId: "project-1",
          channel: "instagram",
          aspectRatio: "9:16",
          targetDurationMs: 12000,
          hook: "old",
          clips: [],
          captions: [],
          overlays: [],
          audio: [],
          coverBrief: null,
          diveMRevisionNotes: [],
          styleMemoryNotes: [],
          approvalRequired: true,
        },
      },
      assessment: {
        fit: "mixed",
        notes: ["context late"],
        weakTransition: "interest",
        revisionSuggestions: ["clarify hook"],
        confidence: 0.7,
        evidenceState: "partial",
      },
    });

    expect(userPayload).toMatchObject({
      task: "revise_draft",
      dive_m_assessment: {
        weakTransition: "interest",
        revisionSuggestions: ["clarify hook"],
      },
    });
  });
});
