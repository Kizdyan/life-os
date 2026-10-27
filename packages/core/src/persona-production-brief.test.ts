import { describe, expect, it } from "vitest";
import { buildPersonaProductionBrief } from "./persona-production-brief";

describe("buildPersonaProductionBrief", () => {
  it("turns an approved idea into a shoot-ready brief without inventing biography", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "idea-1",
        title: "Разбор репетиционного приёма",
        angle: "Показываю один приём, который помогает держать темп в репетиции.",
        format: "reel",
      },
      sourceFacts: ["Автор репетирует музыкальный материал."],
    });

    expect(brief.hook.firstSeconds).toContain("Разбор репетиционного приёма");
    expect(brief.script.map((beat) => beat.action)).not.toContain("");
    expect(brief.shots).toHaveLength(3);
    expect(brief.shots.reduce((total, shot) => total + shot.durationSec, 0)).toBe(30);
    expect(brief.capture).toMatchObject({
      lighting: expect.any(String),
      audio: expect.objectContaining({ recording: expect.any(String) }),
    });
    expect(brief.postProduction.subtitles.maxCharactersPerLine).toBe(42);
    expect(Object.keys(brief.adaptations)).toEqual(["reels", "shorts", "vkClips"]);
    expect(JSON.stringify(brief)).not.toContain("годы опыта");
    expect(brief.factReferences).toEqual(["Автор репетирует музыкальный материал."]);
  });

  it("uses only supplied facts and keeps a factual reference empty when none are supplied", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "idea-2",
        title: "Мой рабочий ритуал",
        angle: "Показываю последовательность подготовки перед записью.",
        format: "short",
      },
    });

    expect(brief.factReferences).toEqual([]);
    expect(brief.script.map((beat) => beat.line).join(" ")).toContain(
      "Показываю последовательность подготовки перед записью.",
    );
  });
});
