import { describe, expect, it } from "vitest";
import { buildCapCutWorkPackage, capCutPackageToJson } from "./capcut-work-package";

describe("CapCut work package", () => {
  it("normalizes edit order and remains approval-gated", () => {
    const result = buildCapCutWorkPackage({
      projectId: "project-1",
      channel: "instagram",
      aspectRatio: "9:16",
      targetDurationMs: 30000,
      hook: "За 30 секунд покажу, как рождается сцена",
      clips: [
        { assetId: "b", sourceStartMs: 1000, sourceEndMs: 3000, order: 2, reason: "payoff" },
        { assetId: "a", sourceStartMs: 0, sourceEndMs: 1000, order: 1, reason: "hook" },
      ],
      captions: [{ startMs: 1000, endMs: 2000, text: "Репетиция" }],
      overlays: [{ atMs: 0, durationMs: 1000, text: "Изнутри театра", role: "hook" }],
      audio: [{ atMs: 0, kind: "ambient", instruction: "сохранить живой звук сцены" }],
      coverBrief: "Крупный план, минимальный текст",
      diveMRevisionNotes: ["первый кадр должен сразу объяснять контекст"],
      styleMemoryNotes: ["без блогерской гиперболы"],
    });

    expect(result.clips.map((clip) => clip.assetId)).toEqual(["a", "b"]);
    expect(result.approvalRequired).toBe(true);
    expect(JSON.parse(capCutPackageToJson(result)).projectId).toBe("project-1");
  });

  it("rejects invalid clip ranges", () => {
    expect(() =>
      buildCapCutWorkPackage({
        projectId: "bad",
        channel: "instagram",
        aspectRatio: "9:16",
        targetDurationMs: null,
        hook: null,
        clips: [
          { assetId: "a", sourceStartMs: 10, sourceEndMs: 10, order: 1, reason: "bad" },
        ],
        captions: [],
        overlays: [],
        audio: [],
        coverBrief: null,
        diveMRevisionNotes: [],
        styleMemoryNotes: [],
      }),
    ).toThrow("Invalid clip range");
  });
});
