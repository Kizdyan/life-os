import { describe, expect, it } from "vitest";
import { buildPersonaProductionBrief } from "./persona-production-brief";
import { evaluatePersonaProductionBrief } from "./persona-production-qa";

describe("evaluatePersonaProductionBrief", () => {
  it("passes a structurally complete brief but leaves editorial judgement pending", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "idea-1",
        title: "Разбор репетиционного приёма",
        angle: "Показываю один приём, который помогает держать темп в репетиции.",
        format: "reel",
      },
      sourceFacts: ["Автор репетирует музыкальный материал."],
    });

    const result = evaluatePersonaProductionBrief({
      brief,
      allowedFacts: ["Автор репетирует музыкальный материал."],
    });

    expect(result.status).toBe("pass");
    expect(result.structuralChecks.every((check) => check.passed)).toBe(true);
    expect(result.editorialReview.state).toBe("pending");
    expect(result.editorialReview.questions).toContain(
      "Сохраняет ли материал индивидуальность автора?",
    );
  });

  it("flags missing production detail and unverifiable fact references without pretending to judge the video", () => {
    const brief = buildPersonaProductionBrief({
      idea: {
        id: "idea-2",
        title: "Рабочий ритуал",
        angle: "Показываю последовательность подготовки перед записью.",
        format: "short",
      },
    });
    brief.script[1].action = "";
    brief.shots[1].cameraMovement = "";
    brief.postProduction.subtitles.maxCharactersPerLine = 60;
    brief.factReferences = ["Неподтверждённый факт"];

    const result = evaluatePersonaProductionBrief({
      brief,
      allowedFacts: [],
    });

    expect(result.status).toBe("needs_revision");
    expect(result.structuralChecks.filter((check) => !check.passed).map((check) => check.id)).toEqual(
      expect.arrayContaining(["script-completeness", "shot-specificity", "subtitle-readability", "fact-references"]),
    );
    expect(result).not.toHaveProperty("videoQualityScore");
  });
});
