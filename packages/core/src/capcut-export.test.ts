import { describe, expect, it } from "vitest";
import { buildCapCutWorkPackage } from "./capcut-work-package";
import {
  buildCapCutEditorBundle,
  captionsToSrt,
  cutListToCsv,
  editorBrief,
} from "./capcut-export";

const workPackage = buildCapCutWorkPackage({
  projectId: "project-1",
  channel: "instagram",
  aspectRatio: "9:16",
  targetDurationMs: 15000,
  hook: "Репетиция изнутри",
  clips: [
    {
      assetId: "asset-1",
      sourceStartMs: 1000,
      sourceEndMs: 3500,
      order: 1,
      reason: "hook",
    },
  ],
  captions: [
    { startMs: 0, endMs: 1200, text: "Первый титр" },
    { startMs: 1300, endMs: 2500, text: "Второй титр" },
  ],
  overlays: [
    { atMs: 0, durationMs: 900, text: "Изнутри театра", role: "hook" },
  ],
  audio: [
    { atMs: 0, kind: "ambient", instruction: "сохранить живой звук" },
  ],
  coverBrief: "Крупный план, минимум текста",
  diveMRevisionNotes: ["быстрее объяснить контекст"],
  styleMemoryNotes: ["без блогерской гиперболы"],
});

describe("CapCut editor export", () => {
  it("creates a complete portable bundle", () => {
    const files = buildCapCutEditorBundle(workPackage);
    expect(files.map((file) => file.relativePath)).toEqual([
      "edit-plan.json",
      "captions.srt",
      "cut-list.csv",
      "editor-brief.txt",
    ]);
  });

  it("renders valid SRT timing", () => {
    const srt = captionsToSrt(workPackage);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,200");
    expect(srt).toContain("Первый титр");
  });

  it("renders a transparent source cut list", () => {
    const csv = cutListToCsv(workPackage);
    expect(csv).toContain("asset-1,1000,3500,2500,hook");
  });

  it("keeps DiveM and Style Memory notes visible to the editor", () => {
    const brief = editorBrief(workPackage);
    expect(brief).toContain("быстрее объяснить контекст");
    expect(brief).toContain("без блогерской гиперболы");
  });
});
