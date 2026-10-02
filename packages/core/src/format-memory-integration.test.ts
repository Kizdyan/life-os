import { describe, expect, it } from "vitest";
import { StructuredContentPlanner } from "./content-planner";

describe("Format Memory integration", () => {
  it("passes reusable format mechanics to the content planner separately from Style Memory", async () => {
    let payload: Record<string, unknown> | null = null;
    const planner = new StructuredContentPlanner({
      completeJson: async (input) => {
        payload = JSON.parse(input.user) as Record<string, unknown>;
        return {
          title: null,
          caption: null,
          aspectRatio: "9:16",
          targetDurationMs: 12000,
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
          editorNotes: [],
        };
      },
    });

    await planner.createPlan({
      projectId: "project-1",
      assetIds: ["asset-1"],
      channel: "instagram",
      goal: "profile visits",
      styleMemoryNotes: ["без блогерской гиперболы"],
      formatMemoryNotes: [
        "one-rule-metaphor: одно правило + простая визуальная метафора",
      ],
      lifeOsContext: null,
    });

    expect(payload).toMatchObject({
      style_memory: ["без блогерской гиперболы"],
      format_memory: [
        "one-rule-metaphor: одно правило + простая визуальная метафора",
      ],
    });
  });
});
