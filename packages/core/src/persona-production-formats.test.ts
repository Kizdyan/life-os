import { describe, expect, it } from "vitest";
import { buildPersonaProductionBrief, type PersonaIdeaFormat } from "./persona-production-brief";
import { evaluatePersonaProductionBrief } from "./persona-production-qa";

const formats: Array<[PersonaIdeaFormat, string]> = [
  ["reel", "vertical_video"],
  ["short", "vertical_video"],
  ["sketch", "acting_sketch"],
  ["carousel", "carousel_cards"],
  ["photo", "photo_concept"],
  ["story", "story_sequence"],
];

describe("Persona production formats", () => {
  it.each(formats)("creates a dedicated %s production deliverable", (format, kind) => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: `idea-${format}`,
        title: "Рабочее наблюдение",
        angle: "Показываю один проверяемый творческий приём.",
        format,
      },
      sourceFacts: ["Автор репетирует музыкальный материал."],
    });

    expect(brief.formatPlan.kind).toBe(kind);
    expect(brief.factReferences).toEqual(["Автор репетирует музыкальный материал."]);
    expect(JSON.stringify(brief)).not.toContain("годы опыта");
  });

  it("makes an acting sketch about a conflict, turn, and resolved ending", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "sketch-1",
        title: "Перед выходом",
        angle: "Один герой хочет начать сразу, а другой просит выдержать паузу.",
        format: "sketch",
      },
    });

    expect(brief.formatPlan).toMatchObject({
      kind: "acting_sketch",
      conflict: expect.stringContaining("хочет"),
      comicTurn: expect.any(String),
      ending: expect.any(String),
    });
    expect(brief.script.length).toBeGreaterThanOrEqual(3);
    expect(brief.shots.length).toBeGreaterThanOrEqual(3);
  });

  it("makes a carousel with readable cards instead of a silent video plan", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "carousel-1",
        title: "Три точки входа в репетицию",
        angle: "Карточки ведут от наблюдения к одному практическому действию.",
        format: "carousel",
      },
    });

    expect(brief.formatPlan).toMatchObject({ kind: "carousel_cards" });
    if (brief.formatPlan.kind !== "carousel_cards") throw new Error("wrong plan");
    expect(brief.formatPlan.cards).toHaveLength(5);
    expect(brief.formatPlan.cards.every((card) => card.heading.length > 0 && card.visualDirection.length > 0)).toBe(true);
    expect(brief.script).toEqual([]);
    expect(evaluatePersonaProductionBrief({ brief, allowedFacts: [] }).status).not.toBe("needs_revision");
  });

  it("keeps a photo brief photographic and a story brief frame-based", () => {
    const photo = buildPersonaProductionBrief({
      idea: { id: "photo-1", title: "После прогона", angle: "Один честный кадр после работы.", format: "photo" },
    });
    const story = buildPersonaProductionBrief({
      idea: { id: "story-1", title: "Пауза", angle: "Три коротких вертикальных кадра процесса.", format: "story" },
    });

    expect(photo.formatPlan).toMatchObject({ kind: "photo_concept", composition: expect.any(String), lighting: expect.any(String) });
    expect(photo.script).toEqual([]);
    expect(story.formatPlan).toMatchObject({ kind: "story_sequence" });
    if (story.formatPlan.kind !== "story_sequence") throw new Error("wrong plan");
    expect(story.formatPlan.frames).toHaveLength(3);
    expect(story.script).toHaveLength(3);
  });
});
